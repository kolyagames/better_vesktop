/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, clipboard, dialog, ipcMain, shell, webContents, WebContents } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { pathToFileURL } from "url";

import { BdIpc } from "../../shared/betterDiscord";
import { BD_ASSETS_DIR } from "./native";
import { assertDiscordSender, BD_DIR, RELEASE_CHANNEL } from "./policy";

type EditorType = "custom-css" | "plugin" | "theme";

interface EditorContext {
    type: EditorType;
    filename: string;
    filepath: string;
    window: BrowserWindow;
    warn: boolean;
}

interface EditorSettings {
    options: Record<string, unknown>;
    liveUpdate: boolean;
    discordTheme: string;
    alwaysOnTop: boolean;
}

const contexts = new Map<number, EditorContext>();
const windows: Record<string, BrowserWindow | undefined> = {};
let settings: EditorSettings = { options: { theme: "vs-dark" }, liveUpdate: false, discordTheme: "dark", alwaysOnTop: false };

/** The editor never gets to choose a path: it is derived here from the type and a plain file name. */
function resolveEditorFile(type: unknown, filename: unknown): { type: EditorType; filename: string; filepath: string } {
    if (type === "custom-css") {
        return { type, filename: "custom.css", filepath: join(BD_DIR, "data", RELEASE_CHANNEL, "custom.css") };
    }
    if ((type === "plugin" || type === "theme") && typeof filename === "string") {
        const name = basename(filename);
        const valid = name === filename && !name.startsWith(".") && (type === "plugin" ? name.endsWith(".js") : name.endsWith(".css"));
        if (valid) return { type, filename: name, filepath: join(BD_DIR, `${type}s`, name) };
    }
    throw new Error("Invalid editor target");
}

function contextFor(sender: WebContents) {
    const ctx = contexts.get(sender.id);
    if (!ctx) throw new Error("Not an editor window");
    return ctx;
}

function updateEditorWindows() {
    for (const ctx of contexts.values()) {
        ctx.window.webContents.send(BdIpc.EDITOR_SETTINGS_UPDATE, settings);
        ctx.window.setAlwaysOnTop(settings.alwaysOnTop);
    }
}

function openEditor(discord: WebContents, type: unknown, filename: unknown) {
    const target = resolveEditorFile(type, filename);
    const key = `${target.type}:${target.filename}`;

    const existing = windows[key];
    if (existing && !existing.isDestroyed()) {
        existing.show();
        existing.focus();
        return;
    }

    const win = new BrowserWindow({
        frame: true,
        center: true,
        show: false,
        autoHideMenuBar: true,
        alwaysOnTop: settings.alwaysOnTop,
        webPreferences: {
            preload: join(__dirname, "bdEditorPreload.js"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
        }
    });
    win.setMenu(null);

    const ctx: EditorContext = { ...target, window: win, warn: false };
    contexts.set(win.webContents.id, ctx);
    windows[key] = win;

    // editor windows are plain documents: links go to the browser, nothing else may open
    win.webContents.setWindowOpenHandler(({ url }) => {
        try {
            if (["http:", "https:"].includes(new URL(url).protocol)) shell.openExternal(url);
        } catch {}
        return { action: "deny" };
    });

    win.on("close", e => {
        if (!ctx.warn) return;
        e.preventDefault();
        const choice = dialog.showMessageBoxSync(win, {
            type: "question",
            title: "Close Editor?",
            message: "Changes you made are not saved",
            buttons: ["Close", "Cancel"],
            cancelId: 1,
            defaultId: 1
        });
        if (choice === 0) {
            ctx.warn = false;
            win.close();
        }
    });

    win.once("ready-to-show", () => win.show());
    win.once("closed", () => {
        contexts.delete(win.webContents.id);
        delete windows[key];
    });

    // close editors together with the Discord window that opened them
    const discordWin = BrowserWindow.fromWebContents(discord);
    discordWin?.once("closed", () => {
        ctx.warn = false;
        if (!win.isDestroyed()) win.close();
    });

    const url = pathToFileURL(join(BD_ASSETS_DIR, "editor", "index.html"));
    url.searchParams.set("type", target.type);
    url.searchParams.set("filename", target.filename);
    win.loadURL(url.href);
}

export function registerEditorHandlers() {
    ipcMain.handle(BdIpc.EDITOR_OPEN, (e, type: unknown, filename: unknown) => {
        assertDiscordSender(e, BdIpc.EDITOR_OPEN);
        openEditor(e.sender, type, filename);
    });

    // Settings flow one way each: the Discord page pushes its full settings to the editors, an editor pushes only what it
    // changed, to the other editors and to the page. Echoing the page's own update back makes BetterDiscord save forever.
    ipcMain.handle(BdIpc.EDITOR_SETTINGS_UPDATE, (e, patch: Partial<EditorSettings>) => {
        if (!patch || typeof patch !== "object") return;

        if (contexts.has(e.sender.id)) {
            settings = { ...settings, ...patch };
            updateEditorWindows();
            for (const wc of webContents.getAllWebContents()) {
                if (contexts.has(wc.id)) continue;
                if (wc.getType() === "window") wc.send(BdIpc.EDITOR_SETTINGS_UPDATE, patch);
            }
        } else {
            assertDiscordSender(e, BdIpc.EDITOR_SETTINGS_UPDATE);
            settings = patch as EditorSettings;
            updateEditorWindows();
        }
    });

    ipcMain.on(BdIpc.EDITOR_SETTINGS_GET, e => {
        e.returnValue = contexts.has(e.sender.id) ? settings : null;
    });

    ipcMain.handle(BdIpc.EDITOR_SHOW_WARNING, (e, show: boolean) => {
        contextFor(e.sender).warn = !!show;
    });

    ipcMain.on(BdIpc.EDITOR_READ, e => {
        try {
            e.returnValue = readFileSync(contextFor(e.sender).filepath, "utf-8");
        } catch (err: any) {
            e.returnValue = err?.code === "ENOENT" ? "" : null;
        }
    });

    ipcMain.on(BdIpc.EDITOR_WRITE, (e, content: unknown) => {
        try {
            if (typeof content !== "string") throw new Error("Invalid content");
            writeFileSync(contextFor(e.sender).filepath, content, "utf-8");
            e.returnValue = true;
        } catch {
            e.returnValue = false;
        }
    });

    ipcMain.on(BdIpc.EDITOR_OPEN_FILE, e => {
        const ctx = contexts.get(e.sender.id);
        if (!ctx) return;
        shell.openPath(ctx.filepath).then(() => ctx.window.close());
    });

    ipcMain.on(BdIpc.EDITOR_READ_CLIPBOARD, e => {
        e.returnValue = contexts.has(e.sender.id) ? clipboard.readText() : "";
    });
}
