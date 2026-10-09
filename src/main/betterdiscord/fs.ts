/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ipcMain, WebContents } from "electron";
import {
    appendFileSync,
    existsSync,
    FSWatcher,
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmdirSync,
    rmSync,
    statSync,
    unlinkSync,
    watch,
    writeFileSync
} from "fs";

import { BdFsOp, BdFsResult, BdIpc } from "../../shared/betterDiscord";
import { assertDiscordSender, BdPolicyError, resolveAllowed } from "./policy";

const WRITE_FLAGS = new Set(["w", "a", "wx", "ax"]);
const TRACE = !!process.env.BETTER_VESKTOP_TRACE_FS;

function runFs(op: BdFsOp, args: any[]): unknown {
    switch (op) {
        case "readdir": {
            const path = resolveAllowed(args[0]);
            const withFileTypes = !!args[1]?.withFileTypes;
            if (!withFileTypes) return readdirSync(path);
            return readdirSync(path, { withFileTypes: true }).map(d => ({
                name: d.name,
                isFile: d.isFile(),
                isDirectory: d.isDirectory(),
                isSymbolicLink: d.isSymbolicLink()
            }));
        }
        case "mkdir": {
            mkdirSync(resolveAllowed(args[0]), { recursive: !!args[1]?.recursive });
            return null;
        }
        case "rmdir": {
            rmdirSync(resolveAllowed(args[0], { notRoot: true }));
            return null;
        }
        case "exists": {
            try {
                return existsSync(resolveAllowed(args[0]));
            } catch {
                return false;
            }
        }
        case "realpath": {
            return realpathSync(resolveAllowed(args[0]));
        }
        case "rename": {
            renameSync(resolveAllowed(args[0], { notRoot: true }), resolveAllowed(args[1], { notRoot: true }));
            return null;
        }
        case "rm": {
            const opts = args[1] ?? {};
            rmSync(resolveAllowed(args[0], { notRoot: true }), { recursive: !!opts.recursive, force: !!opts.force });
            return null;
        }
        case "unlink": {
            unlinkSync(resolveAllowed(args[0], { notRoot: true }));
            return null;
        }
        case "readFile": {
            const path = resolveAllowed(args[0]);
            const encoding = typeof args[1] === "string" ? args[1] : args[1]?.encoding;
            return encoding ? readFileSync(path, encoding as BufferEncoding) : readFileSync(path);
        }
        case "writeFile": {
            const path = resolveAllowed(args[0], { notRoot: true });
            const data = args[1];
            if (typeof data !== "string" && !(data instanceof Uint8Array)) {
                throw new BdPolicyError("Invalid data", "EINVAL");
            }
            const opts = typeof args[2] === "string" ? { encoding: args[2] } : (args[2] ?? {});
            const flag = WRITE_FLAGS.has(opts.flag) ? opts.flag : "w";
            writeFileSync(path, data, { encoding: opts.encoding, flag });
            return null;
        }
        case "stat": {
            const path = resolveAllowed(args[0]);
            const link = lstatSync(path);
            const stats = statSync(path);
            return {
                size: stats.size,
                mode: stats.mode,
                mtimeMs: stats.mtimeMs,
                atimeMs: stats.atimeMs,
                ctimeMs: stats.ctimeMs,
                birthtimeMs: stats.birthtimeMs,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                isSymbolicLink: link.isSymbolicLink()
            };
        }
        default:
            throw new BdPolicyError(`Unknown filesystem operation ${op}`, "EINVAL");
    }
}

function toResult(fn: () => unknown): BdFsResult {
    try {
        return { ok: true, value: fn() };
    } catch (e: any) {
        return { ok: false, error: { message: String(e?.message ?? e), code: e?.code } };
    }
}

// ---- watchers ------------------------------------------------------------------------------------------------

const watchers = new Map<number, { watcher: FSWatcher; sender: WebContents }>();
let nextWatchId = 1;

function closeWatchersFor(sender: WebContents) {
    for (const [id, entry] of watchers) {
        if (entry.sender !== sender) continue;
        entry.watcher.close();
        watchers.delete(id);
    }
}

// ---- write streams -------------------------------------------------------------------------------------------

const streams = new Map<number, { path: string; sender: WebContents }>();
let nextStreamId = 1;

export function registerFsHandlers() {
    ipcMain.on(BdIpc.FS, (e, op: BdFsOp, ...args: any[]) => {
        try {
            assertDiscordSender(e, BdIpc.FS);
        } catch (err: any) {
            e.returnValue = { ok: false, error: { message: err.message, code: "EACCES" } } satisfies BdFsResult;
            return;
        }
        if (TRACE) console.log("[BD fs]", op, typeof args[0] === "string" ? args[0] : "");
        e.returnValue = toResult(() => runFs(op, args));
    });

    ipcMain.on(BdIpc.FS_WATCH, (e, path: string, options: any) => {
        try {
            assertDiscordSender(e, BdIpc.FS_WATCH);
        } catch (err: any) {
            e.returnValue = { ok: false, error: { message: err.message, code: "EACCES" } } satisfies BdFsResult;
            return;
        }

        e.returnValue = toResult(() => {
            const real = resolveAllowed(path);
            const id = nextWatchId++;
            const sender = e.sender;
            const watcher = watch(real, { persistent: false, recursive: !!options?.recursive }, (event, filename) => {
                if (!sender.isDestroyed()) sender.send(BdIpc.FS_WATCH_EVENT, id, event, filename?.toString() ?? null);
            });
            watcher.on("error", () => {
                watcher.close();
                watchers.delete(id);
            });
            watchers.set(id, { watcher, sender });
            sender.once("destroyed", () => closeWatchersFor(sender));
            return id;
        });
    });

    ipcMain.on(BdIpc.FS_UNWATCH, (e, id: number) => {
        try {
            assertDiscordSender(e, BdIpc.FS_UNWATCH);
        } catch {
            return;
        }
        const entry = watchers.get(id);
        if (!entry || entry.sender !== e.sender) return;
        entry.watcher.close();
        watchers.delete(id);
    });

    // createWriteStream: open (truncate / append), write chunks, close
    ipcMain.on(BdIpc.FS_STREAM, (e, action: "open" | "write" | "close", ...args: any[]) => {
        try {
            assertDiscordSender(e, BdIpc.FS_STREAM);
        } catch (err: any) {
            e.returnValue = { ok: false, error: { message: err.message, code: "EACCES" } } satisfies BdFsResult;
            return;
        }

        e.returnValue = toResult(() => {
            switch (action) {
                case "open": {
                    const [path, flags] = args as [string, string | undefined];
                    const real = resolveAllowed(path, { notRoot: true });
                    if (flags?.startsWith("a")) appendFileSync(real, "");
                    else writeFileSync(real, "");
                    const id = nextStreamId++;
                    streams.set(id, { path: real, sender: e.sender });
                    return id;
                }
                case "write": {
                    const [id, chunk] = args as [number, string | Uint8Array];
                    const stream = streams.get(id);
                    if (!stream || stream.sender !== e.sender) throw new BdPolicyError("Stream closed", "EBADF");
                    appendFileSync(stream.path, chunk);
                    return null;
                }
                case "close": {
                    const [id] = args as [number];
                    const stream = streams.get(id);
                    if (stream?.sender === e.sender) streams.delete(id);
                    return null;
                }
                default:
                    throw new BdPolicyError("Unknown stream action", "EINVAL");
            }
        });
    });
}
