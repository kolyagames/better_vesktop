/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vencord's UI strings live in the bundle it downloads, so the few labels that say "Vencord" are relabelled in the DOM.
const NAME = "Better Vesktop";
const EXACT = new Map([
    ["Vencord", NAME],
    ["Vencord Settings", `${NAME} Settings`]
]);

function fix(root: Node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest(".bdvk-wrap")) continue;

        const value = node.nodeValue?.trim();
        const replacement = value && EXACT.get(value);
        if (replacement) node.nodeValue = node.nodeValue!.replace(value, replacement);
    }
}

function start() {
    fix(document.body);

    new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const added of mutation.addedNodes) {
                if (added.nodeType === Node.ELEMENT_NODE) fix(added);
                else if (added.nodeType === Node.TEXT_NODE && EXACT.has(added.nodeValue?.trim() ?? "")) fix(added.parentNode!);
            }
            if (mutation.type === "characterData" && EXACT.has(mutation.target.nodeValue?.trim() ?? "")) {
                fix(mutation.target.parentNode!);
            }
        }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

export function installRelabel() {
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
}
