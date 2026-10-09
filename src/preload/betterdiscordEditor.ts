/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { contextBridge, ipcRenderer } from "electron/renderer";

import { BdIpc } from "../shared/betterDiscord";

// Same `window.Editor` API as stock BetterDiscord's editor window, but the sandboxed window can't touch the disk:
// the main process works out the one file this editor may read and write.

const params = new URLSearchParams(location.search);

contextBridge.exposeInMainWorld("Editor", {
    type: params.get("type"),
    filename: params.get("filename"),
    read() {
        const content = ipcRenderer.sendSync(BdIpc.EDITOR_READ);
        if (content == null) throw new Error("Failed to read the file");
        return content as string;
    },
    write(content: string) {
        if (!ipcRenderer.sendSync(BdIpc.EDITOR_WRITE, content)) throw new Error("Failed to save the file");
    },
    open() {
        ipcRenderer.send(BdIpc.EDITOR_OPEN_FILE);
    },
    shouldShowWarning(show: boolean) {
        ipcRenderer.invoke(BdIpc.EDITOR_SHOW_WARNING, show);
    },
    readText() {
        return ipcRenderer.sendSync(BdIpc.EDITOR_READ_CLIPBOARD) as string;
    },
    settings: {
        get: () => ipcRenderer.sendSync(BdIpc.EDITOR_SETTINGS_GET),
        subscribe(callback: (settings: unknown) => void) {
            ipcRenderer.on(BdIpc.EDITOR_SETTINGS_UPDATE, (_e, settings) => callback(settings));
        },
        set(settings: unknown) {
            ipcRenderer.invoke(BdIpc.EDITOR_SETTINGS_UPDATE, settings);
        }
    }
});
