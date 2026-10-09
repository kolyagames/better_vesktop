/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { ipcMain, Session, session } from "electron";
import { isIP } from "net";

import { BdFetchRequest, BdFetchResponse, BdIpc } from "../../shared/betterDiscord";
import { allowLocalNetwork, assertDiscordSender, BdPolicyError, isPrivateAddress, isWebhookUrl } from "./policy";

const MAX_BODY_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HASH_ALGORITHMS = new Set(["md5", "sha1", "sha256", "sha384", "sha512"]);

let fetchSession: Session | undefined;
/** A separate, non persistent session: no Discord cookies or credentials ever go out with plugin requests. */
const getFetchSession = () => (fetchSession ??= session.fromPartition("bd-native-fetch"));

const aborts = new Map<number, AbortController>();

async function assertUrlAllowed(raw: string) {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new BdPolicyError("Invalid URL", "EINVAL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new BdPolicyError(`Unsupported protocol: ${url.protocol}`, "EINVAL");
    }

    if (isWebhookUrl(raw)) throw new BdPolicyError("Failed to fetch", "EACCES");

    if (allowLocalNetwork()) return;

    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost")) {
        throw new BdPolicyError("Requests to the local network are blocked", "EACCES");
    }

    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map(a => a.address);
    if (addresses.some(isPrivateAddress)) {
        throw new BdPolicyError("Requests to the local network are blocked", "EACCES");
    }
}

function collectHeaders(res: Response): Record<string, string | string[]> {
    const headers: Record<string, string | string[]> = {};
    res.headers.forEach((value, key) => (headers[key] = value));

    const cookies = res.headers.getSetCookie?.();
    if (cookies?.length) headers["set-cookie"] = cookies;
    return headers;
}

async function readBody(res: Response): Promise<Uint8Array | null> {
    if (!res.body) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        total += value.byteLength;
        if (total > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new BdPolicyError("Response is too large", "EFBIG");
        }
        chunks.push(value);
    }

    return Buffer.concat(chunks);
}

async function doFetch(req: BdFetchRequest, signal: AbortSignal): Promise<BdFetchResponse> {
    const ses = getFetchSession();
    const redirectMode = req.redirect ?? "follow";
    const limit = Math.min(req.maxRedirects ?? MAX_REDIRECTS, MAX_REDIRECTS);

    let url = req.url;
    let method = (req.method ?? "GET").toUpperCase();
    let body: Uint8Array | null | undefined = req.body;
    let redirected = false;

    for (let hops = 0; ; hops++) {
        await assertUrlAllowed(url);

        const res = await ses.fetch(url, {
            method,
            headers: req.headers,
            body: body && method !== "GET" && method !== "HEAD" ? (body as any) : undefined,
            redirect: "manual",
            credentials: "omit",
            bypassCustomProtocolHandlers: true,
            signal
        });

        const location = res.headers.get("location");
        if (REDIRECT_STATUSES.has(res.status) && location) {
            if (redirectMode === "error") throw new BdPolicyError("Failed to fetch", "ERR_REDIRECT");
            if (redirectMode === "follow") {
                if (hops >= limit) throw new BdPolicyError(`Maximum amount of redirects reached (${limit})`, "ERR_REDIRECT");

                // fetch spec: 301/302 on POST and 303 on anything but GET/HEAD turn into a GET
                if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
                    method = "GET";
                    body = null;
                }
                url = new URL(location, url).href;
                redirected = true;
                await res.body?.cancel();
                continue;
            }
        }

        const noBody = res.status === 101 || res.status === 204 || res.status === 205 || res.status === 304;
        return {
            url,
            status: res.status,
            statusText: res.statusText,
            headers: collectHeaders(res),
            redirected,
            body: noBody ? null : await readBody(res)
        };
    }
}

type FetchOutcome = { ok: true; value: BdFetchResponse } | { ok: false; error: { message: string; code?: string } };

export function registerNetHandlers() {
    ipcMain.handle(BdIpc.FETCH, async (e, req: BdFetchRequest): Promise<FetchOutcome> => {
        assertDiscordSender(e, BdIpc.FETCH);

        const controller = new AbortController();
        aborts.set(req.id, controller);

        // the timeout only applies when the caller asked for one (BetterDiscord's default is 8s); null disables it
        const timeoutMs = req.timeout === null ? null : Math.max(req.timeout ?? 8000, 30_000);
        const timer = timeoutMs == null ? undefined : setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

        try {
            return { ok: true, value: await doFetch(req, controller.signal) };
        } catch (err: any) {
            const message = controller.signal.aborted
                ? String(controller.signal.reason?.message ?? "Request was aborted")
                : String(err?.cause?.message ?? err?.message ?? err);
            return { ok: false, error: { message, code: err?.code } };
        } finally {
            clearTimeout(timer);
            aborts.delete(req.id);
        }
    });

    ipcMain.on(BdIpc.FETCH_ABORT, (e, id: number) => {
        try {
            assertDiscordSender(e, BdIpc.FETCH_ABORT);
        } catch {
            return;
        }
        aborts.get(id)?.abort(new Error("Request was aborted"));
    });

    // crypto.createHash for plugins: whole buffer in, digest out
    ipcMain.on(BdIpc.HASH, (e, algorithm: string, data: Uint8Array, encoding?: string) => {
        try {
            assertDiscordSender(e, BdIpc.HASH);
            if (!HASH_ALGORITHMS.has(String(algorithm).toLowerCase())) throw new Error("Unsupported hash algorithm");
            const hash = createHash(algorithm.toLowerCase()).update(data);
            e.returnValue = { ok: true, value: encoding ? hash.digest(encoding as any) : hash.digest() };
        } catch (err: any) {
            e.returnValue = { ok: false, error: { message: String(err?.message ?? err) } };
        }
    });
}
