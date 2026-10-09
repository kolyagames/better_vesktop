/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";

// must be imported before anything touches a session: composes Vencord's and BetterDiscord's header listeners
import "./betterdiscord/csp";
import { CommandLine } from "./cli";
import { downloadVencordFiles } from "./utils/vencordLoader";

if (CommandLine.values.repair) {
    console.log("Repairing Vesktop...");
    downloadVencordFiles().then(() => app.quit());
} else {
    require("./main");
}
