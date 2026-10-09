/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences, WebContents } from "electron";
import { readFileSync, statSync } from "fs";
import { extname, format, isAbsolute, join, normalize, parse, relative, resolve, basename, dirname, sep, delimiter } from "path";

import { BdIpc, BdState } from "../../shared/betterDiscord";
import { DATA_DIR } from "../constants";
import {
    assertDiscordSender,
    BD_DIR,
    BD_ENABLED,
    grantPaths,
    isAllowedExternalUrl,
    RELEASE_CHANNEL,
    resolveAllowed
} from "./policy";

export const BD_ASSETS_DIR = join(__dirname, "betterdiscord");

const PURE_PATH_FUNCTIONS = {
    join,
    resolve,
    dirname,
    basename,
    extname,
    isAbsolute,
    normalize,
    relative,
    parse,
    format
} as Record<string, (...args: any[]) => unknown>;

/** Files BetterDiscord may ask the OS to open with the default app. Never anything executable. */
const OPENABLE_EXTENSIONS = new Set([".js", ".css", ".json", ".txt", ".md", ".log"]);

const DIALOG_KEYS = ["title", "defaultPath", "buttonLabel", "filters", "properties", "message"] as const;
const WINDOW_KEYS = ["width", "height", "minWidth", "minHeight", "title", "resizable", "center", "x", "y"] as const;

function pick<T extends object>(source: any, keys: readonly (keyof T & string)[]): Partial<T> {
    const out: any = {};
    if (!source || typeof source !== "object") return out;
    for (const key of keys) if (key in source) out[key] = source[key];
    return out;
}

function guardedOn(channel: BdIpc, listener: (e: Electron.IpcMainEvent, ...args: any[]) => unknown) {
    ipcMain.on(channel, (e, ...args) => {
        try {
            assertDiscordSender(e, channel);
            e.returnValue = listener(e, ...args);
        } catch (err: any) {
            console.warn(String(err?.message ?? err));
            e.returnValue = null;
        }
    });
}

function guardedHandle(channel: BdIpc, listener: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) {
    ipcMain.handle(channel, (e, ...args) => {
        assertDiscordSender(e, channel);
        return listener(e, ...args);
    });
}

const getState = (): BdState => ({
    enabled: BD_ENABLED,
    dir: BD_DIR.replaceAll("\\", "/") + "/",
    appPath: app.getAppPath(),
    userData: DATA_DIR,
    platform: process.platform,
    arch: process.arch,
    versions: { node: process.versions.node, electron: process.versions.electron, chrome: process.versions.chrome },
    releaseChannel: RELEASE_CHANNEL
});

function openDevTools(sender: WebContents) {
    if (!sender.isDevToolsOpened()) sender.openDevTools();
}

async function waitForDevTools(sender: WebContents) {
    openDevTools(sender);
    while (!sender.devToolsWebContents) await new Promise(r => setTimeout(r, 16));
    return sender.devToolsWebContents;
}

function getAccentColor() {
    try {
        const color = systemPreferences.getAccentColor();
        return color ? (color.startsWith("#") ? color : `#${color}`) : "#3E82E5";
    } catch {
        return "#3E82E5";
    }
}

/** Mirrors what BetterDiscord's own main process did: tell the page about in-page navigation and the OS accent colour. */
function watchWebContents(wc: WebContents) {
    if (wc.getType() !== "window") return;

    let css: Promise<string> | undefined;
    const applyAccent = async () => {
        if (wc.isDestroyed()) return;
        if (css) wc.removeInsertedCSS(await css).catch(() => {});
        css = wc.insertCSS(`:root { --os-accent-color: ${getAccentColor()}; }`);
    };

    wc.on("did-navigate-in-page", () => wc.send(BdIpc.NAVIGATED_IN_PAGE));
    wc.on("dom-ready", () => {
        let isDiscord = false;
        try {
            isDiscord = new URL(wc.getURL()).protocol === "https:";
        } catch {}
        if (isDiscord) applyAccent();
    });

    systemPreferences.on("accent-color-changed" as any, applyAccent);
    wc.once("destroyed", () => systemPreferences.off("accent-color-changed" as any, applyAccent));
}

export function registerNativeHandlers() {
    // always answer, so the preload can tell that BetterDiscord is switched off
    ipcMain.on(BdIpc.GET_STATE, e => {
        try {
            assertDiscordSender(e, BdIpc.GET_STATE);
            e.returnValue = getState();
        } catch {
            e.returnValue = { ...getState(), enabled: false };
        }
    });

    if (!BD_ENABLED) return;

    app.on("web-contents-created", (_, wc) => watchWebContents(wc));

    guardedOn(BdIpc.GET_EARLY_RENDERER, () => readFileSync(join(BD_ASSETS_DIR, "earlyRenderer.js"), "utf-8"));

    // Inject BetterDiscord's renderer into the page, in the page's own (sandboxed) world.
    guardedHandle(BdIpc.RUN_RENDERER, async e => {
        const source = readFileSync(join(BD_ASSETS_DIR, "betterdiscord.js"), "utf-8");
        await e.sender.executeJavaScript(`(() => {
            try {
                ${source}
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        })();
        //# sourceURL=betterdiscord/betterdiscord.js`);
    });

    // path helpers: only pure string functions, the sandboxed preload has no `path` module
    guardedOn(BdIpc.PATH, (_e, fn: string, ...args: unknown[]) => {
        const impl = Object.hasOwn(PURE_PATH_FUNCTIONS, fn) ? PURE_PATH_FUNCTIONS[fn] : undefined;
        if (!impl) throw new Error(`path.${fn} is not available`);
        if (!args.every(a => typeof a === "string" || (a && typeof a === "object"))) throw new Error("Invalid path arguments");
        return impl(...args);
    });
    // exposed so the preload can build `sep` / `delimiter` without guessing
    guardedOn(BdIpc.PATH_CONSTANTS, () => ({ sep, delimiter }));

    guardedOn(BdIpc.OPEN_EXTERNAL, (_e, url: unknown) => {
        if (!isAllowedExternalUrl(url)) throw new Error("Only http(s) and mailto links can be opened");
        shell.openExternal(url);
        return true;
    });

    // Opens a BetterDiscord folder, or a plugin/theme/css file in the user's default editor. Never anything else.
    guardedOn(BdIpc.OPEN_PATH, (_e, path: unknown) => {
        const real = resolveAllowed(path);
        const stats = statSync(real);
        const openable = stats.isDirectory() || (stats.isFile() && OPENABLE_EXTENSIONS.has(extname(real).toLowerCase()));
        if (!openable) throw new Error("This kind of path cannot be opened");
        shell.openPath(real);
        return true;
    });

    guardedHandle(BdIpc.OPEN_DIALOG, async (e, options: any = {}) => {
        const mode = options.mode === "save" ? "save" : "open";
        const dialogOptions: any = pick(options, DIALOG_KEYS);
        const parent = options.modal ? BrowserWindow.fromWebContents(e.sender) : null;
        const args = (parent ? [parent, dialogOptions] : [dialogOptions]) as [any];

        if (mode === "save") {
            const result = await dialog.showSaveDialog(...args);
            if (result.filePath) grantPaths([result.filePath]);
            return result;
        }

        const result = await dialog.showOpenDialog(...args);
        grantPaths(result.filePaths);
        return result;
    });

    // Small popup window for sign-in style flows; hardened and unable to reach the bridge.
    guardedHandle(BdIpc.OPEN_WINDOW, (_e, url: unknown, { windowOptions, closeOnUrl }: any = {}) => {
        if (typeof url !== "string") return Promise.reject(new Error("Invalid URL"));
        try {
            if (!["https:", "http:"].includes(new URL(url).protocol)) throw 0;
        } catch {
            return Promise.reject(new Error("Invalid URL"));
        }

        return new Promise<void>(resolveWindow => {
            const win = new BrowserWindow({
                ...pick(windowOptions, WINDOW_KEYS),
                autoHideMenuBar: true,
                webPreferences: { nodeIntegration: false, sandbox: true, contextIsolation: true, webSecurity: true }
            });
            win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
            win.webContents.on("did-navigate", (_ev, navigated) => {
                if (closeOnUrl && navigated === closeOnUrl) {
                    win.close();
                    resolveWindow();
                }
            });
            win.on("closed", () => resolveWindow());
            win.loadURL(url);
        });
    });

    guardedHandle(BdIpc.RUN_SCRIPT, async (e, code: string) => {
        try {
            await e.sender.executeJavaScript(`(() => {try {${code}} catch {}})();`);
        } catch {}
    });

    guardedOn(BdIpc.DEVTOOLS, (e, action: "open" | "close" | "toggle") => {
        const wc = e.sender;
        if (action === "open") openDevTools(wc);
        else if (action === "close") wc.closeDevTools();
        else if (wc.isDevToolsOpened()) wc.closeDevTools();
        else openDevTools(wc);
    });

    guardedOn(BdIpc.INSPECT_ELEMENT, async e => {
        const tools = await waitForDevTools(e.sender);
        tools.executeJavaScript("DevToolsAPI.enterInspectElementMode();");
    });

    guardedHandle(BdIpc.OPEN_DEVTOOLS_SOURCE, async (e, url: string, line: number, column: number) => {
        const tools = await waitForDevTools(e.sender);
        tools.executeJavaScript(
            `DevToolsAPI.revealSourceLine(${JSON.stringify(String(url))}, ${Number(line) | 0}, ${Number(column) | 0});`
        );
    });

    guardedOn(BdIpc.RELAUNCH, (_e, extraArgs: unknown) => {
        const extra = (Array.isArray(extraArgs) ? extraArgs : []).filter(a => typeof a === "string" && a.startsWith("--"));
        app.relaunch({ args: process.argv.slice(1).concat(["--relaunch"], extra) });
        app.exit();
    });
}
