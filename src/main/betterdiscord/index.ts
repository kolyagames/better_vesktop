/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { registerEditorHandlers } from "./editor";
import { registerFsHandlers } from "./fs";
import { registerNativeHandlers } from "./native";
import { registerNetHandlers } from "./net";
import { BD_ENABLED, ensureBdDirectories } from "./policy";

export { BD_DIR, BD_ENABLED } from "./policy";

/**
 * Sets up the BetterDiscord side of the app in the main process. The Discord window itself stays exactly as
 * sandboxed as in stock Vesktop: BetterDiscord only ever talks to the handlers registered here.
 */
export function initBetterDiscord() {
    // always registered: tells the preload whether BetterDiscord is on
    registerNativeHandlers();
    if (!BD_ENABLED) return;

    ensureBdDirectories();
    registerFsHandlers();
    registerNetHandlers();
    registerEditorHandlers();
}
