/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";

import { DISCORD_HOSTNAMES, PORTABLE } from "../constants";
import { Settings } from "../settings";
import { isPrivateAddress } from "./ip";

export { isPrivateAddress };

/**
 * This file is the whole security policy for BetterDiscord: what it may read and write, who may talk to the bridge.
 * Plugins run inside the sandboxed Discord page and can only reach the computer through the bridge, so anything not
 * allowed here simply doesn't exist for them.
 */

export const BD_ENABLED = Settings.store.betterDiscord?.enabled !== false && !process.argv.includes("--vanilla");

const EXE_DIR = dirname(process.execPath);
// BETTER_VESKTOP_BD_DIR is meant for tests and unusual setups; the plugins themselves can't set it
export const BD_DIR = resolve(
    process.env.BETTER_VESKTOP_BD_DIR ||
        (PORTABLE ? join(EXE_DIR, "BetterDiscord") : join(app.getPath("appData"), "BetterDiscord"))
);
export const RELEASE_CHANNEL = "stable";

export function ensureBdDirectories() {
    const dirs = [
        BD_DIR,
        join(BD_DIR, "data"),
        ...["stable", "canary", "ptb", "development"].map(c => join(BD_DIR, "data", c)),
        join(BD_DIR, "plugins"),
        join(BD_DIR, "themes")
    ];
    for (const dir of dirs) mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------------------------------------------
// who may use the bridge
// ---------------------------------------------------------------------------------------------------------------

/** Only the top frame of a discord.com page may use the bridge (not iframes, not other sites, not our own views). */
export function assertDiscordSender(e: IpcMainEvent | IpcMainInvokeEvent, channel: string) {
    const frame = e.senderFrame;
    if (!frame || frame.parent) throw new Error(`BetterDiscord ipc[${channel}]: not a top frame`);

    let url: URL;
    try {
        url = new URL(frame.url);
    } catch {
        throw new Error(`BetterDiscord ipc[${channel}]: bad sender url`);
    }

    if (url.protocol !== "https:" || !DISCORD_HOSTNAMES.includes(url.hostname)) {
        throw new Error(`BetterDiscord ipc[${channel}]: disallowed sender ${url.hostname}`);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// filesystem
// ---------------------------------------------------------------------------------------------------------------

export class BdPolicyError extends Error {
    constructor(
        message: string,
        public code = "EACCES"
    ) {
        super(message);
    }
}

const isWin = process.platform === "win32";

/** Paths the user explicitly picked through a file dialog during this session. */
const grants = new Set<string>();
export function grantPaths(paths: string[]) {
    for (const p of paths) if (typeof p === "string" && isAbsolute(p)) grants.add(resolve(p));
}

function safeRealpath(p: string) {
    try {
        return realpathSync.native(p);
    } catch {
        return resolve(p);
    }
}

/** realpath of the deepest existing ancestor, plus the part that doesn't exist yet. Stops symlink escapes. */
function realish(abs: string): string {
    let current = abs;
    const rest: string[] = [];
    while (!existsSync(current)) {
        const parent = dirname(current);
        if (parent === current) break;
        rest.unshift(current.slice(parent.length).replace(/^[\\/]+/, ""));
        current = parent;
    }
    return join(safeRealpath(current), ...rest);
}

function isInside(child: string, root: string) {
    const rel = relative(root, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function allowedRoots(): string[] {
    const extra = (Settings.store.betterDiscord?.extraPaths ?? []).filter(p => typeof p === "string" && isAbsolute(p));
    return [BD_DIR, ...extra, ...grants].map(safeRealpath);
}

export interface ResolveOptions {
    /** Operations like rm/rename must never touch an allowed root itself */
    notRoot?: boolean;
}

/** Returns the real absolute path if BetterDiscord may touch it, otherwise throws. */
export function resolveAllowed(input: unknown, { notRoot }: ResolveOptions = {}): string {
    if (typeof input !== "string" || !input || input.includes("\0") || !isAbsolute(input)) {
        throw new BdPolicyError("Invalid path", "EINVAL");
    }

    if (isWin) {
        // only plain drive paths: no UNC (\\server\share), device (\\.\ \\?\) or alternate data stream (file:stream) paths
        if (!/^[a-zA-Z]:[\\/]/.test(input) || input.indexOf(":", 2) !== -1) {
            throw new BdPolicyError(`Path not allowed: ${input}`);
        }
    }

    const real = realish(resolve(input));
    for (const root of allowedRoots()) {
        if (!isInside(real, root)) continue;
        if (notRoot && relative(root, real) === "") throw new BdPolicyError(`Cannot modify ${input} itself`);
        return real;
    }

    throw new BdPolicyError(`BetterDiscord is not allowed to access ${input}`);
}

// ---------------------------------------------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------------------------------------------

// Discord webhooks: plugins must not be able to post to attacker-controlled hooks with the user's data. BetterDiscord
// blocks these on its own native fetch too.
export function isWebhookUrl(raw: string) {
    try {
        const { pathname } = new URL(raw);
        const lower = (() => {
            try {
                return decodeURIComponent(pathname);
            } catch {
                return pathname;
            }
        })().toLowerCase();
        return /(^|\/)api\/(?:v\d+\/)?webhooks(\/|$)/.test(lower);
    } catch {
        return /(?:\/|%2f)api(?:\/|%2f)(?:v\d+(?:\/|%2f))?webhooks/.test(raw.toLowerCase());
    }
}

export const allowLocalNetwork = () => Settings.store.betterDiscord?.allowLocalNetwork === true;

// ---------------------------------------------------------------------------------------------------------------
// opening things
// ---------------------------------------------------------------------------------------------------------------

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isAllowedExternalUrl(raw: unknown): raw is string {
    if (typeof raw !== "string") return false;
    try {
        return EXTERNAL_PROTOCOLS.has(new URL(raw).protocol);
    } catch {
        return false;
    }
}
