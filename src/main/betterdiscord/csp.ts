/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, Session } from "electron";

import { BD_ENABLED } from "./policy";

/*
 * Electron allows exactly one `webRequest.onHeadersReceived` listener per session. Vencord registers one for its
 * own CSP / CORS handling, and BetterDiscord needs Discord's Content-Security-Policy gone so that plugins and themes
 * can load remote images, fonts, styles and scripts. If both just register, the last one silently wins.
 *
 * So we wrap the registration function as soon as a session exists: whatever listener gets registered later
 * (Vencord's) keeps running first, and our CSP removal runs on its result.
 *
 * Only responses that actually enforce a policy (documents and workers) are touched.
 */

const CSP_HEADER = /^content-security-policy(-report-only)?$/i;
const ENFORCING_TYPES = new Set(["mainFrame", "subFrame", "worker", "sharedWorker", "serviceWorker"]);

function stripCsp(headers: Record<string, string[] | string> | undefined) {
    if (!headers) return headers;
    for (const key of Object.keys(headers)) if (CSP_HEADER.test(key)) delete headers[key];
    return headers;
}

function compose({ webRequest }: Session) {
    if ((webRequest as any).__bdComposed) return;

    const register = webRequest.onHeadersReceived.bind(webRequest);
    let inner: ((details: any, callback: (response: any) => void) => void) | null = null;

    register((details, callback) => {
        const finish = (res?: any) => {
            // the inner listener may cancel or redirect, leave that alone
            if (res && (res.cancel || res.redirectURL || res.statusLine)) return callback(res);

            const headers = res?.responseHeaders ?? details.responseHeaders;
            callback({
                ...res,
                cancel: false,
                responseHeaders: ENFORCING_TYPES.has(details.resourceType) ? stripCsp(headers) : headers
            });
        };

        if (!inner) return finish();

        try {
            inner(details, finish);
        } catch (e) {
            console.error("[BetterDiscord] onHeadersReceived listener threw", e);
            finish();
        }
    });

    // (listener | null) or (filter, listener | null)
    (webRequest as any).onHeadersReceived = (...args: any[]) => {
        const listener = args.length > 1 ? args[1] : args[0];
        inner = typeof listener === "function" ? listener : null;
    };
    Object.defineProperty(webRequest, "__bdComposed", { value: true });
}

if (BD_ENABLED) app.on("session-created", compose);
