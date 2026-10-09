/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { installRelabel } from "./relabel";
import { installUnifiedSettings } from "./unified";

// Vencord is already loaded when this runs, the settings plugin only needs a moment to exist
function whenReady(check: () => unknown, callback: () => void, tries = 240) {
    const timer = setInterval(() => {
        let ready = false;
        try {
            ready = !!check();
        } catch {}

        if (ready) {
            clearInterval(timer);
            callback();
        } else if (--tries <= 0) clearInterval(timer);
    }, 250);
}

installRelabel();

whenReady(
    () =>
        Vencord.Plugins.plugins.Settings &&
        (Vencord.Plugins.plugins.Settings as any).buildLayout &&
        Vencord.Webpack.Common.React &&
        (Vencord.Components as any).openPluginModal,
    installUnifiedSettings
);
