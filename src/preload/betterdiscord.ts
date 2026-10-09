/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron/renderer";

import { BdFetchRequest, BdFetchResponse, BdFsOp, BdFsResult, BdIpc, BdState } from "../shared/betterDiscord";

/*
 * The sandboxed side of the BetterDiscord bridge.
 *
 * Stock BetterDiscord runs with Node.js inside Discord's preload (fs, https, vm, ...). Vesktop keeps its window sandboxed
 * instead, so this file rebuilds the same `BetterDiscordPreload()` object that BetterDiscord's renderer expects, but every
 * call is forwarded over IPC to src/main/betterdiscord, which decides what is allowed.
 */

const CHUNK_SIZE = 64 * 1024;

function isDiscordPage() {
    try {
        const { protocol, hostname } = location;
        return protocol === "https:" && (hostname === "discord.com" || hostname.endsWith(".discord.com"));
    } catch {
        return false;
    }
}

function fail(error: { message: string; code?: string }): never {
    const err: any = new Error(error.message);
    if (error.code) err.code = error.code;
    throw err;
}

function unwrap<T>(result: BdFsResult<T>): T {
    if (!result?.ok) fail((result as any)?.error ?? { message: "Unknown error" });
    return result.value;
}

const fsCall = (op: BdFsOp, ...args: unknown[]) => unwrap(ipcRenderer.sendSync(BdIpc.FS, op, ...args) as BdFsResult);

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

// -------------------------------------------------------------------------------------------------------------------
// filesystem
// -------------------------------------------------------------------------------------------------------------------

const watchCallbacks = new Map<number, (event: string, filename: string | null) => void>();
let watchListening = false;

function makeFilesystem() {
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
        exists: (path: string) => fsCall("exists", path) as boolean,
        getRealPath: (path: string) => fsCall("realpath", path) as string,
        renameSync: (from: string, to: string) => void fsCall("rename", from, to),
        rmSync: (path: string, options?: any) => void fsCall("rm", path, options),
        unlinkSync: (path: string) => void fsCall("unlink", path),
        readFile: (path: string, encoding: string | null = "utf-8") => {
            const data = fsCall("readFile", path, encoding) as string | Uint8Array;
            return typeof data === "string" ? data : Buffer.from(data);
        },
        writeFile: (path: string, data: string | Uint8Array, options?: any) => {
            // the `originalFs` flag of stock BetterDiscord (bypass Electron's asar shim) means nothing here
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
            if (!watchListening) {
                watchListening = true;
                ipcRenderer.on(BdIpc.FS_WATCH_EVENT, (_e, id: number, event: string, filename: string | null) => {
                    try {
                        watchCallbacks.get(id)?.(event, filename);
                    } catch (e) {
                        console.error("[BetterDiscord] watch callback failed", e);
                    }
                });
            }

            const id = unwrap(ipcRenderer.sendSync(BdIpc.FS_WATCH, path, options) as BdFsResult<number>);
            watchCallbacks.set(id, callback);
            return {
                close() {
                    watchCallbacks.delete(id);
                    ipcRenderer.send(BdIpc.FS_UNWATCH, id);
                }
            };
        },
        createWriteStream: (path: string, options?: any) => {
            const flags = typeof options === "object" ? options?.flags : undefined;
            const id = unwrap(ipcRenderer.sendSync(BdIpc.FS_STREAM, "open", path, flags) as BdFsResult<number>);

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
                    unwrap(ipcRenderer.sendSync(BdIpc.FS_STREAM, "write", id, bytes) as BdFsResult);
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
                    ipcRenderer.sendSync(BdIpc.FS_STREAM, "close", id);
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
// path (pure functions, evaluated in the main process because the sandboxed preload has no `path` module)
// -------------------------------------------------------------------------------------------------------------------

function makePath() {
    const { sep, delimiter } = ipcRenderer.sendSync(BdIpc.PATH_CONSTANTS) as { sep: string; delimiter: string };
    const cache = new Map<string, unknown>();

    const call = (fn: string, ...args: string[]) => {
        const key = fn + "\0" + args.join("\0");
        if (cache.has(key)) return cache.get(key);
        const result = ipcRenderer.sendSync(BdIpc.PATH, fn, ...args);
        if (cache.size > 4000) cache.clear();
        cache.set(key, result);
        return result;
    };

    const strings = (args: unknown[]) => {
        for (const a of args) if (typeof a !== "string") throw new TypeError("The path argument must be of type string");
        return args as string[];
    };

    return {
        sep,
        delimiter,
        join: (...p: unknown[]) => call("join", ...strings(p)) as string,
        resolve: (...p: unknown[]) => call("resolve", ...strings(p)) as string,
        dirname: (p: string) => call("dirname", ...strings([p])) as string,
        basename: (p: string, ext?: string) => call("basename", ...strings(ext == null ? [p] : [p, ext])) as string,
        extname: (p: string) => call("extname", ...strings([p])) as string,
        isAbsolute: (p: string) => call("isAbsolute", ...strings([p])) as boolean,
        normalize: (p: string) => call("normalize", ...strings([p])) as string,
        relative: (from: string, to: string) => call("relative", ...strings([from, to])) as string,
        parse: (p: string) => call("parse", ...strings([p])) as object
    };
}

// -------------------------------------------------------------------------------------------------------------------
// network
// -------------------------------------------------------------------------------------------------------------------

let nextFetchId = 1;

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

async function nativeFetchBytes(request: Omit<BdFetchRequest, "id">, signal?: any): Promise<BdFetchResponse> {
    const id = nextFetchId++;
    try {
        signal?.addListener?.(() => ipcRenderer.send(BdIpc.FETCH_ABORT, id));
    } catch {}

    const outcome = await ipcRenderer.invoke(BdIpc.FETCH, { ...request, id });
    if (!outcome.ok) fail(outcome.error);
    return outcome.value as BdFetchResponse;
}

async function nativeFetch({ url, body, signal, headers, method, redirect, maxRedirects, timeout }: any) {
    const bytes = await readAll(body);
    const res = await nativeFetchBytes({ url, method, headers, body: bytes, redirect, maxRedirects, timeout }, signal);
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
    let target: { write?(c: Uint8Array): void; end?(): void } | undefined;
    const rawBody = options.formData ?? options.body;

    nativeFetchBytes({
        url,
        method: options.method ?? "GET",
        headers: options.headers && !Array.isArray(options.headers) ? options.headers : undefined,
        body: rawBody == null ? null : toBytes(rawBody),
        redirect: "follow"
    }).then(
        res => {
            const body = Buffer.from(res.body ?? new Uint8Array());
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
                    rawHeaders: Object.entries(res.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.flatMap(x => [k, x]) : [k, v]))
                },
                body
            );
        },
        err => callback?.(err)
    );

    return {
        end() {},
        pipe(dest: typeof target) {
            target = dest;
        }
    };
}

function makeHttps() {
    const api: Record<string, any> = { request: legacyRequest };
    for (const method of ["get", "put", "post", "delete", "head"]) {
        api[method] = (url: string, options: any = {}, callback?: any) =>
            legacyRequest(url, { ...options, method: options.method ?? method.toUpperCase() }, callback);
    }
    return api;
}

// -------------------------------------------------------------------------------------------------------------------
// the small slice of `electron` that BetterDiscord and plugins get
// -------------------------------------------------------------------------------------------------------------------

function deny(channel: string): never {
    throw new Error(`BetterDiscord: IPC channel "${channel}" is not available in Better Vesktop`);
}

const noop = () => {};

function makeElectron() {
    // BetterDiscord's original channel names -> what they do here. Anything not listed is refused.
    const send: Record<string, (...args: any[]) => void> = {
        "bd-open-devtools": () => ipcRenderer.send(BdIpc.DEVTOOLS, "open"),
        "bd-close-devtools": () => ipcRenderer.send(BdIpc.DEVTOOLS, "close"),
        "bd-toggle-devtools": () => ipcRenderer.send(BdIpc.DEVTOOLS, "toggle"),
        "bd-inspect-element": () => ipcRenderer.send(BdIpc.INSPECT_ELEMENT),
        "bd-relaunch-app": (args?: unknown) => ipcRenderer.send(BdIpc.RELAUNCH, args),
        "bd-open-path": (path: string) => ipcRenderer.send(BdIpc.OPEN_PATH, path),
        // window chrome is Vesktop's business
        "bd-minimum-size": noop,
        "bd-window-size": noop,
        "bd-remove-devtools-message": noop
    };
    const invoke: Record<string, (...args: any[]) => Promise<unknown>> = {
        "bd-run-script": code => ipcRenderer.invoke(BdIpc.RUN_SCRIPT, code),
        "bd-open-window": (url, options) => ipcRenderer.invoke(BdIpc.OPEN_WINDOW, url, options),
        "bd-open-dialog": options => ipcRenderer.invoke(BdIpc.OPEN_DIALOG, options),
        "bd-open-devtools-source": (url, line, column) => ipcRenderer.invoke(BdIpc.OPEN_DEVTOOLS_SOURCE, url, line, column),
        "bd-set-vibrancy": async () => undefined,
        "bd-set-background-material": async () => undefined,
        "bd-get-allow-preload-override": async () => false,
        "bd-set-allow-preload-override": async () => undefined
    };
    const on: Record<string, string | null> = {
        "bd-did-navigate-in-page": BdIpc.NAVIGATED_IN_PAGE,
        "bd-window-maximize": null,
        "bd-window-minimize": null
    };

    const subscriptions = new Map<(...args: any[]) => void, (...args: any[]) => void>();

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
                const wrapped = (_e: unknown, ...args: any[]) => listener({}, ...args);
                subscriptions.set(listener, wrapped);
                ipcRenderer.on(real, wrapped);
            },
            off(channel: string, listener: (...args: any[]) => void) {
                const real = on[channel];
                const wrapped = subscriptions.get(listener);
                if (real && wrapped) ipcRenderer.off(real, wrapped);
                subscriptions.delete(listener);
            }
        },
        shell: {
            openExternal: async (url: string) => {
                if (ipcRenderer.sendSync(BdIpc.OPEN_EXTERNAL, url) !== true) {
                    throw new Error("Only http(s) and mailto links can be opened");
                }
            },
            // same contract as Electron's shell.openPath: resolves to an error message, "" on success
            openPath: async (path: string) =>
                ipcRenderer.sendSync(BdIpc.OPEN_PATH, path) === true ? "" : "This path cannot be opened"
        },
        webUtils: { getPathForFile: (file: File) => webUtils.getPathForFile(file) }
    };
}

// -------------------------------------------------------------------------------------------------------------------

function makeCrypto() {
    return {
        createHash(algorithm: string) {
            const chunks: Uint8Array[] = [];
            const hash = {
                update(data: unknown) {
                    chunks.push(toBytes(data));
                    return hash;
                },
                digest(encoding?: string) {
                    const result = ipcRenderer.sendSync(BdIpc.HASH, algorithm, concatBytes(chunks), encoding);
                    if (!result.ok) fail(result.error);
                    return typeof result.value === "string" ? result.value : Buffer.from(result.value);
                }
            };
            return hash;
        },
        randomBytes(size: number) {
            if (!Number.isInteger(size) || size < 0 || size > 65536) throw new RangeError("Invalid size");
            return Buffer.from(crypto.getRandomValues(new Uint8Array(size)));
        }
    };
}

function makeEditor() {
    return {
        open: (type: string, filename?: string) => void ipcRenderer.invoke(BdIpc.EDITOR_OPEN, type, filename),
        updateSettings: (settings: unknown) => void ipcRenderer.invoke(BdIpc.EDITOR_SETTINGS_UPDATE, settings),
        onSettingsChange(callback: (settings: unknown) => void) {
            const listener = (_e: unknown, settings: unknown) => callback(settings);
            ipcRenderer.on(BdIpc.EDITOR_SETTINGS_UPDATE, listener);
            return () => void ipcRenderer.off(BdIpc.EDITOR_SETTINGS_UPDATE, listener);
        }
    };
}

function makeProcess(state: BdState) {
    return {
        platform: state.platform,
        arch: state.arch,
        version: `v${state.versions.node}`,
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

export function setupBetterDiscord() {
    let state: BdState | undefined;
    try {
        state = ipcRenderer.sendSync(BdIpc.GET_STATE);
    } catch {
        return;
    }
    if (!state?.enabled || !isDiscordPage()) return;

    const bridge = {
        addProtocolListener: noop,
        crypto: makeCrypto(),
        editor: makeEditor(),
        electron: makeElectron(),
        filesystem: makeFilesystem(),
        https: makeHttps(),
        nativeFetch,
        path: makePath(),
        setDevToolsWarningState: noop
    };

    contextBridge.exposeInMainWorld("process", makeProcess(state));

    let handedOut = false;
    contextBridge.exposeInMainWorld("BetterDiscordPreload", () => {
        if (!isDiscordPage() || handedOut) return null;
        handedOut = true;
        return bridge;
    });

    let injected = false;
    contextBridge.exposeInMainWorld("BetterDiscordRunRenderer", () => {
        if (!isDiscordPage() || injected) return null;
        injected = true;
        ipcRenderer.invoke(BdIpc.RUN_RENDERER);
    });

    // hooks Discord's webpack before it starts, same as stock BetterDiscord
    const early = ipcRenderer.sendSync(BdIpc.GET_EARLY_RENDERER);
    if (typeof early === "string") webFrame.top?.executeJavaScript(`(() => {${early}})()`).catch(() => {});
}
