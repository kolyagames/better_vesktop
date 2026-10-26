/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Phone specifics for Discord's web client, loaded after Vencord. The approach follows Vendroid
 * (github.com/Vencord/Vendroid, GPL-3.0): the system back button closes the open modal first, then opens the
 * channel sidebar of Discord's mobile web layout, and only then leaves the app.
 */

declare const Vencord: any;

let sidebarOpen = false;
let escapeHandler: any;

function setup() {
    const { findLazy, Common, onceReady } = Vencord.Webpack;
    escapeHandler = findLazy((m: any) => m.binds?.length === 1 && m.binds[0] === "esc");
    onceReady.then(() => {
        Common.FluxDispatcher.subscribe("MOBILE_WEB_SIDEBAR_OPEN", () => (sidebarOpen = true));
        Common.FluxDispatcher.subscribe("MOBILE_WEB_SIDEBAR_CLOSE", () => (sidebarOpen = false));
    });
}

function pressEscape() {
    const init = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", init));
}

/** Returns true when the page handled the back press, false when the app should go back. */
function onBackPress(): boolean {
    if (typeof Vencord === "undefined") {
        pressEscape();
        return false;
    }
    try {
        if (escapeHandler?.action() === false) return true;
    } catch {}

    const quickCss = (window as any).__VENCORD_MONACO_WIN__?.deref?.();
    if (quickCss && !quickCss.closed) {
        quickCss.close();
        delete (window as any).__VENCORD_MONACO_WIN__;
        return true;
    }

    if (!sidebarOpen) {
        try {
            Vencord.Webpack.Common.FluxDispatcher.dispatch({ type: "MOBILE_WEB_SIDEBAR_OPEN" });
            return true;
        } catch {}
    }
    return false;
}

/** Opens a discord.com path inside the running client, used for links tapped elsewhere on the phone. */
function navigate(path: string): boolean {
    try {
        Vencord.Webpack.Common.NavigationRouter.transitionTo(path);
        return true;
    } catch {
        return false;
    }
}

try {
    if (typeof Vencord !== "undefined") setup();
} catch (e) {
    console.error("[Better Vesktop] mobile setup failed", e);
}

Object.defineProperty(window, "BetterVesktopMobile", {
    value: Object.freeze({ onBackPress, navigate }),
    configurable: false,
    writable: false
});
