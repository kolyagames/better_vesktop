/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** IPC channels of the sandboxed BetterDiscord bridge. Everything BetterDiscord is allowed to do goes through these. */
export const enum BdIpc {
    // bootstrap
    GET_STATE = "BDVK_GET_STATE",
    GET_EARLY_RENDERER = "BDVK_GET_EARLY_RENDERER",
    RUN_RENDERER = "BDVK_RUN_RENDERER",

    // filesystem (restricted to the BetterDiscord folder + paths the user picked)
    FS = "BDVK_FS",
    FS_WATCH = "BDVK_FS_WATCH",
    FS_UNWATCH = "BDVK_FS_UNWATCH",
    FS_WATCH_EVENT = "BDVK_FS_WATCH_EVENT",
    FS_STREAM = "BDVK_FS_STREAM",

    // net
    FETCH = "BDVK_FETCH",
    FETCH_ABORT = "BDVK_FETCH_ABORT",

    // misc native helpers
    PATH = "BDVK_PATH",
    PATH_CONSTANTS = "BDVK_PATH_CONSTANTS",
    HASH = "BDVK_HASH",
    OPEN_EXTERNAL = "BDVK_OPEN_EXTERNAL",
    OPEN_PATH = "BDVK_OPEN_PATH",
    OPEN_DIALOG = "BDVK_OPEN_DIALOG",
    OPEN_WINDOW = "BDVK_OPEN_WINDOW",
    RELAUNCH = "BDVK_RELAUNCH",
    DEVTOOLS = "BDVK_DEVTOOLS",
    INSPECT_ELEMENT = "BDVK_INSPECT_ELEMENT",
    NAVIGATED_IN_PAGE = "BDVK_NAVIGATED_IN_PAGE",
    OPEN_DEVTOOLS_SOURCE = "BDVK_OPEN_DEVTOOLS_SOURCE",
    RUN_SCRIPT = "BDVK_RUN_SCRIPT",

    // custom css / plugin / theme editor
    EDITOR_OPEN = "BDVK_EDITOR_OPEN",
    EDITOR_SHOW_WARNING = "BDVK_EDITOR_SHOW_WARNING",
    EDITOR_SETTINGS_GET = "BDVK_EDITOR_SETTINGS_GET",
    EDITOR_SETTINGS_UPDATE = "BDVK_EDITOR_SETTINGS_UPDATE",
    EDITOR_READ = "BDVK_EDITOR_READ",
    EDITOR_WRITE = "BDVK_EDITOR_WRITE",
    EDITOR_OPEN_FILE = "BDVK_EDITOR_OPEN_FILE",
    EDITOR_READ_CLIPBOARD = "BDVK_EDITOR_READ_CLIPBOARD"
}

export interface BdState {
    enabled: boolean;
    /** The BetterDiscord folder, always with a trailing slash like BetterDiscord expects. */
    dir: string;
    appPath: string;
    userData: string;
    platform: NodeJS.Platform;
    arch: string;
    versions: Record<string, string | undefined>;
    releaseChannel: string;
}

export type BdFsOp =
    | "readdir"
    | "mkdir"
    | "rmdir"
    | "exists"
    | "realpath"
    | "rename"
    | "rm"
    | "unlink"
    | "readFile"
    | "writeFile"
    | "stat";

export type BdFsResult<T = unknown> = { ok: true; value: T } | { ok: false; error: { message: string; code?: string } };

export interface BdFetchRequest {
    id: number;
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | null;
    redirect?: "follow" | "manual" | "error";
    maxRedirects?: number;
    timeout?: number | null;
}

export interface BdFetchResponse {
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string | string[]>;
    redirected: boolean;
    body: Uint8Array | null;
}
