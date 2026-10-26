/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Android counterpart of src/preload/betterdiscord.ts.
 *
 * Loaded by the app as the first script of discord.com's main document (DiscordWebClient.kt adds the tag), before
 * BetterDiscord's early hook, Vencord and Discord itself. It builds the same `BetterDiscordPreload()` object that
 * BetterDiscord's renderer expects, but every privileged call goes to the Kotlin side, which applies the same policy
 * as src/main/betterdiscord on desktop: files only inside the BetterDiscord folder, no local network, no webhooks.
 */

import type { BdFetchResponse, BdFsOp, BdState } from "../shared/betterDiscord";
import { Native } from "./native";
import * as posixPath from "./posixPath";

const CHUNK_SIZE = 64 * 1024;

declare global {
    interface Window {
        __bdvkNative?: any;
        __bdvkSettle?: (id: number, json: string) => void;
        __bdvkEmit?: (event: string, json: string) => void;
        __bdvkVesktop?: unknown;
    }
}

function isDiscordPage() {
    try {
        const { protocol, hostname } = location;
        return window.top === window && protocol === "https:" && (hostname === "discord.com" || hostname.endsWith(".discord.com"));
    } catch {
        return false;
    }
}

// -------------------------------------------------------------------------------------------------------------------
// Bytes that behave enough like a Node Buffer for what BetterDiscord does with file contents (toString / toJSON).
// The real Buffer polyfill lives inside BetterDiscord's bundle and is not available this early.
// -------------------------------------------------------------------------------------------------------------------

class BdBytes extends Uint8Array {
    toString(encoding = "utf8"): string {
        const enc = String(encoding).toLowerCase();
        if (enc === "hex") return Array.from(this, b => b.toString(16).padStart(2, "0")).join("");
        if (enc === "base64") {
            let binary = "";
            for (let i = 0; i < this.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000) as unknown as number[]);
            }
            return btoa(binary);
        }
        if (enc === "latin1" || enc === "binary" || enc === "ascii") {
            let out = "";
            for (let i = 0; i < this.length; i++) out += String.fromCharCode(this[i]);
            return out;
        }
        return new TextDecoder().decode(this);
    }

    toJSON() {
        return { type: "Buffer", data: Array.from(this) };
    }
}

const asBytes = (data: Uint8Array) => new BdBytes(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);

function toBytes(data: unknown): Uint8Array {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    throw new TypeError("The data argument must be a string, Buffer or Uint8Array");
}

function concatBytes(chunks: Uint8Array[]) {
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

const noop = () => {};

// -------------------------------------------------------------------------------------------------------------------
// filesystem
// -------------------------------------------------------------------------------------------------------------------

function makeFilesystem(native: Native) {
    const fsCall = (op: BdFsOp, ...args: unknown[]) => native.call("fs", op, ...args);
    const watchCallbacks = new Map<number, (event: string, filename: string | null) => void>();

    native.on("watch", ({ id, event, filename }: { id: number; event: string; filename: string | null }) => {
        try {
            watchCallbacks.get(id)?.(event, filename);
        } catch (e) {
            console.error("[BetterDiscord] watch callback failed", e);
        }
    });

    return {
        readDirectory: (path: string, options?: any) => {
            const entries = fsCall("readdir", path, options) as any[];
            if (!options?.withFileTypes) return entries;
            return entries.map(d => ({
                name: d.name,
                isFile: () => d.isFile,
                isDirectory: () => d.isDirectory,
                isSymbolicLink: () => d.isSymbolicLink
            }));
        },
        createDirectory: (path: string, options?: any) => void fsCall("mkdir", path, options),
        deleteDirectory: (path: string) => void fsCall("rmdir", path),
        exists: (path: string) => {
            try {
                return fsCall("exists", path) as boolean;
            } catch {
                return false;
            }
        },
        getRealPath: (path: string) => fsCall("realpath", path) as string,
        renameSync: (from: string, to: string) => void fsCall("rename", from, to),
        rmSync: (path: string, options?: any) => void fsCall("rm", path, options),
        unlinkSync: (path: string) => void fsCall("unlink", path),
        readFile: (path: string, encoding: string | null = "utf-8") => {
            const data = fsCall("readFile", path, encoding) as string | Uint8Array;
            return typeof data === "string" ? data : asBytes(data);
        },
        writeFile: (path: string, data: string | Uint8Array, options?: any) => {
            fsCall("writeFile", path, typeof data === "string" ? data : toBytes(data), options);
        },
        getStats: (path: string) => {
            const s = fsCall("stat", path) as any;
            return {
                size: s.size,
                mode: s.mode,
                mtimeMs: s.mtimeMs,
                atimeMs: s.atimeMs,
                ctimeMs: s.ctimeMs,
                birthtimeMs: s.birthtimeMs,
                mtime: new Date(s.mtimeMs),
                atime: new Date(s.atimeMs),
                ctime: new Date(s.ctimeMs),
                birthtime: new Date(s.birthtimeMs),
                isFile: () => s.isFile,
                isDirectory: () => s.isDirectory,
                isSymbolicLink: () => s.isSymbolicLink
            };
        },
        watch: (path: string, options: any, callback: (event: string, filename: string | null) => void) => {
            if (typeof options === "function") {
                callback = options;
                options = undefined;
            }
            const id = native.call<number>("watch", path, !!options?.recursive);
            watchCallbacks.set(id, callback);
            return {
                close() {
                    watchCallbacks.delete(id);
                    native.tryCall("unwatch", id);
                }
            };
        },
        createWriteStream: (path: string, options?: any) => {
            const flags = typeof options === "object" ? options?.flags : undefined;
            const id = native.call<number>("stream", "open", path, flags);

            const listeners = new Map<string, Set<(...args: any[]) => void>>();
            const emit = (event: string, ...args: any[]) => listeners.get(event)?.forEach(fn => fn(...args));
            let ended = false;
            let bytesWritten = 0;

            const stream: any = {
                path,
                writable: true,
                get bytesWritten() {
                    return bytesWritten;
                },
                write(chunk: unknown, encoding?: unknown, callback?: unknown) {
                    const cb = [encoding, callback].find(a => typeof a === "function") as (() => void) | undefined;
                    if (ended) throw new Error("write after end");
                    const bytes = toBytes(chunk);
                    native.call("stream", "write", id, bytes);
                    bytesWritten += bytes.byteLength;
                    cb?.();
                    return true;
                },
                end(chunk?: unknown, encoding?: unknown, callback?: unknown) {
                    if (typeof chunk !== "function" && chunk != null) stream.write(chunk, encoding);
                    const cb = [chunk, encoding, callback].find(a => typeof a === "function") as (() => void) | undefined;
                    if (ended) return stream;
                    ended = true;
                    stream.writable = false;
                    native.tryCall("stream", "close", id);
                    queueMicrotask(() => {
                        cb?.();
                        emit("finish");
                        emit("close");
                    });
                    return stream;
                },
                on(event: string, fn: (...args: any[]) => void) {
                    (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(fn);
                    return stream;
                },
                off(event: string, fn: (...args: any[]) => void) {
                    listeners.get(event)?.delete(fn);
                    return stream;
                },
                once(event: string, fn: (...args: any[]) => void) {
                    const wrapped = (...args: any[]) => {
                        stream.off(event, wrapped);
                        fn(...args);
                    };
                    return stream.on(event, wrapped);
                },
                close: () => stream.end(),
                destroy: () => stream.end()
            };
            stream.addListener = stream.on;
            stream.removeListener = stream.off;
            return stream;
        }
    };
}

// -------------------------------------------------------------------------------------------------------------------
// network
// -------------------------------------------------------------------------------------------------------------------

async function readAll(reader?: { read(): Promise<{ done: boolean; value?: Uint8Array }> } | null) {
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(toBytes(value));
    }
    return concatBytes(chunks);
}

function bodyReader(bytes: Uint8Array | null) {
    if (!bytes) return null;
    let offset = 0;
    return {
        async read() {
            if (offset >= bytes.byteLength) return { done: true, value: undefined };
            const value = bytes.slice(offset, offset + CHUNK_SIZE);
            offset += value.byteLength;
            return { done: false, value };
        },
        async cancel() {
            offset = bytes.byteLength;
        }
    };
}

function makeNet(native: Native) {
    async function fetchBytes(request: Record<string, unknown>, signal?: any): Promise<BdFetchResponse> {
        let id = 0;
        const promise = native.callAsync<BdFetchResponse>("fetch", [request], i => (id = i));
        try {
            const abort = () => native.cancel(id);
            if (signal?.aborted) abort();
            else if (typeof signal?.addEventListener === "function") signal.addEventListener("abort", abort, { once: true });
            else signal?.addListener?.(abort);
        } catch {}
        return promise;
    }

    async function nativeFetch({ url, body, signal, headers, method, redirect, maxRedirects, timeout }: any) {
        const bytes = await readAll(body);
        const res = await fetchBytes({ url, method, headers, body: bytes, redirect, maxRedirects, timeout }, signal);
        return {
            body: bodyReader(res.body),
            url: res.url,
            headers: res.headers,
            status: res.status,
            statusText: res.statusText,
            redirected: res.redirected
        };
    }

    /** The old callback style `https` API plugins get through `require("https")` / `require("request")`. */
    function legacyRequest(url: string, options: any = {}, callback?: (err: Error | null, res?: any, body?: Uint8Array) => void) {
        if (typeof options === "function") {
            callback = options;
            options = {};
        }
        let target: { write?(c: Uint8Array): void; end?(): void } | undefined;
        const rawBody = options.formData ?? options.body;

        fetchBytes({
            url,
            method: options.method ?? "GET",
            headers: options.headers && !Array.isArray(options.headers) ? options.headers : undefined,
            body: rawBody == null ? null : toBytes(rawBody),
            redirect: "follow"
        }).then(
            res => {
                const body = asBytes(res.body ?? new Uint8Array());
                if (target) {
                    target.write?.(body);
                    target.end?.();
                }
                callback?.(
                    null,
                    {
                        statusCode: res.status,
                        statusMessage: res.statusText,
                        url: res.url,
                        headers: res.headers,
                        method: options.method ?? "GET",
                        aborted: false,
                        complete: true,
                        rawHeaders: Object.entries(res.headers).flatMap(([k, v]) =>
                            Array.isArray(v) ? v.flatMap(x => [k, x]) : [k, v]
                        )
                    },
                    body
                );
            },
            err => callback?.(err)
        );

        return {
            end() {},
            on() {
                return this;
            },
            pipe(dest: typeof target) {
                target = dest;
            }
        };
    }

    const https: Record<string, any> = { request: legacyRequest };
    for (const m of ["get", "put", "post", "delete", "head"]) {
        https[m] = (url: string, options: any = {}, callback?: any) => {
            if (typeof options === "function") {
                callback = options;
                options = {};
            }
            return legacyRequest(url, { ...options, method: options.method ?? m.toUpperCase() }, callback);
        };
    }

    return { nativeFetch, https };
}

// -------------------------------------------------------------------------------------------------------------------
// the small slice of `electron` that BetterDiscord and plugins get
// -------------------------------------------------------------------------------------------------------------------

function deny(channel: string): never {
    throw new Error(`BetterDiscord: IPC channel "${channel}" is not available in Better Vesktop for Android`);
}

function runScript(code: string) {
    try {
        (0, eval)(`(() => {try {${code}} catch {}})();`);
    } catch {}
}

function makeElectron(native: Native) {
    const openPath = (path: string) => native.callAsync<boolean>("openPath", [path]).catch(() => false);

    // BetterDiscord's original channel names -> what they do here. Anything not listed is refused.
    const send: Record<string, (...args: any[]) => void> = {
        "bd-relaunch-app": () => native.tryCall("relaunch"),
        "bd-open-path": (path: string) => void openPath(path),
        // DevTools are reached from a computer through chrome://inspect; window chrome belongs to the app
        "bd-open-devtools": noop,
        "bd-close-devtools": noop,
        "bd-toggle-devtools": noop,
        "bd-inspect-element": noop,
        "bd-minimum-size": noop,
        "bd-window-size": noop,
        "bd-remove-devtools-message": noop
    };
    const invoke: Record<string, (...args: any[]) => Promise<unknown>> = {
        "bd-run-script": async code => runScript(String(code)),
        "bd-open-window": (url: unknown) => native.callAsync("openWindow", [url]),
        "bd-open-dialog": (options: unknown) => native.callAsync("openDialog", [options ?? {}]),
        "bd-open-devtools-source": async () => undefined,
        "bd-set-vibrancy": async () => undefined,
        "bd-set-background-material": async () => undefined,
        "bd-get-allow-preload-override": async () => false,
        "bd-set-allow-preload-override": async () => undefined
    };
    const on: Record<string, string | null> = {
        "bd-did-navigate-in-page": "navigate",
        "bd-window-maximize": null,
        "bd-window-minimize": null
    };

    const subscriptions = new Map<(...args: any[]) => void, () => void>();

    return {
        ipcRenderer: {
            send(channel: string, ...args: any[]) {
                (send[channel] ?? deny(channel))(...args);
            },
            invoke(channel: string, ...args: any[]) {
                return (invoke[channel] ?? deny.bind(null, channel))(...args);
            },
            on(channel: string, listener: (...args: any[]) => void) {
                if (!Object.hasOwn(on, channel)) deny(channel);
                const real = on[channel];
                if (!real) return;
                subscriptions.set(listener, native.on(real, () => listener({})));
            },
            off(_channel: string, listener: (...args: any[]) => void) {
                subscriptions.get(listener)?.();
                subscriptions.delete(listener);
            }
        },
        shell: {
            openExternal: async (url: string) => {
                if (native.tryCall("openExternal", url).ok !== true) {
                    throw new Error("Only http(s) and mailto links can be opened");
                }
            },
            // same contract as Electron's shell.openPath: resolves to an error message, "" on success
            openPath: async (path: string) => ((await openPath(path)) ? "" : "This path cannot be opened")
        },
        // Files picked in a WebView <input type=file> have no path on Android
        webUtils: { getPathForFile: () => "" }
    };
}

// -------------------------------------------------------------------------------------------------------------------

function makeCrypto(native: Native) {
    return {
        createHash(algorithm: string) {
            const chunks: Uint8Array[] = [];
            const hash = {
                update(data: unknown) {
                    chunks.push(toBytes(data));
                    return hash;
                },
                digest(encoding?: string) {
                    const value = native.call<string | Uint8Array>("hash", algorithm, concatBytes(chunks), encoding ?? null);
                    return typeof value === "string" ? value : asBytes(value);
                }
            };
            return hash;
        },
        randomBytes(size: number) {
            if (!Number.isInteger(size) || size < 0 || size > 65536) throw new RangeError("Invalid size");
            return asBytes(crypto.getRandomValues(new Uint8Array(size)));
        }
    };
}

function makeEditor(native: Native) {
    // The detached Monaco window of desktop does not exist on a phone; BetterDiscord's in-page editor still works.
    return {
        open: () => native.tryCall("toast", "Отдельный редактор недоступен на Android, используйте встроенный"),
        updateSettings: noop,
        onSettingsChange: () => noop
    };
}

function makeProcess(state: BdState) {
    return {
        platform: state.platform,
        arch: state.arch,
        version: `v${state.versions.node ?? "0.0.0"}`,
        versions: { ...state.versions, nodejs: state.versions.node },
        // BetterDiscord reads its folders from here. Nothing else of the real environment is exposed.
        env: {
            DISCORD_APP_PATH: state.appPath,
            DISCORD_USER_DATA: state.userData,
            BETTERDISCORD_DATA_PATH: state.dir,
            DISCORD_RELEASE_CHANNEL: state.releaseChannel
        },
        isWeb: true,
        cwd: () => "/",
        nextTick: (callback: (...args: any[]) => void, ...args: any[]) => void Promise.resolve().then(() => callback(...args))
    };
}

/** Tells the page about in-page navigation, like BetterDiscord's own main process does on desktop. */
function watchNavigation(native: Native) {
    const notify = () => native.emit("navigate", "{}");
    for (const method of ["pushState", "replaceState"] as const) {
        const original = history[method];
        history[method] = function (this: History, ...args: any[]) {
            const result = original.apply(this, args as any);
            queueMicrotask(notify);
            return result;
        } as any;
    }
    addEventListener("popstate", notify);
}

function define(name: string, value: unknown) {
    Object.defineProperty(window, name, { value, configurable: false, enumerable: false, writable: false });
}

// -------------------------------------------------------------------------------------------------------------------

function start() {
    const script = document.currentScript as HTMLScriptElement | null;
    const token = script?.dataset.bdvk;
    script?.removeAttribute("data-bdvk");
    script?.remove();

    const bridge = window.__bdvkNative;
    if (!token || !bridge || !isDiscordPage()) return;

    const native = new Native(bridge, token);
    define("__bdvkSettle", (id: number, json: string) => native.settle(id, json));
    define("__bdvkEmit", (event: string, json: string) => native.emit(event, json));

    // the few VesktopNative calls the unified settings page makes (see scripts/build/android.mts)
    define("__bdvkVesktop", { app: { relaunch: () => native.tryCall("relaunch") } });

    const stateResult = native.tryCall<BdState>("state");
    if (!stateResult.ok || !stateResult.value.enabled) return;
    const state = stateResult.value;

    watchNavigation(native);
    const net = makeNet(native);

    const bdPreload = {
        addProtocolListener: noop,
        crypto: makeCrypto(native),
        editor: makeEditor(native),
        electron: makeElectron(native),
        filesystem: makeFilesystem(native),
        https: net.https,
        nativeFetch: net.nativeFetch,
        path: { ...posixPath },
        setDevToolsWarningState: noop
    };

    define("process", makeProcess(state));

    let handedOut = false;
    define("BetterDiscordPreload", () => {
        if (!isDiscordPage() || handedOut) return null;
        handedOut = true;
        return bdPreload;
    });

    // Called by BetterDiscord's early hook once Discord's React is loaded. The renderer is served by the app from
    // the same origin, already wrapped like src/main/betterdiscord/native.ts does with executeJavaScript.
    let injected = false;
    define("BetterDiscordRunRenderer", () => {
        if (!isDiscordPage() || injected) return null;
        injected = true;
        const tag = document.createElement("script");
        tag.src = "/__bdvk/betterdiscord.js";
        (document.head ?? document.documentElement).appendChild(tag);
    });
}

start();
