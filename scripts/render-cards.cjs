/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Renders docs/card.html to the PNG banners used by the README and the social preview.
// usage: pnpm exec electron scripts/render-cards.cjs
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("fs");
const { join, resolve } = require("path");
const { pathToFileURL } = require("url");

const version = require("../package.json").version;
const cards = [
    { file: "docs/assets/banner.png", title: "Two clients. One window.", sub: "runs Vencord and BetterDiscord together, sandboxed." },
    { file: "docs/assets/release.png", title: `Update ${version}`, sub: "update, changelog below." }
];

app.on("window-all-closed", () => {}); // keep the app alive between cards

app.whenReady().then(async () => {
    for (const card of cards) {
        const win = new BrowserWindow({ width: 1280, height: 520, show: false, useContentSize: true, webPreferences: { sandbox: true } });
        const url = pathToFileURL(resolve(__dirname, "../docs/card.html"));
        url.searchParams.set("title", card.title);
        url.searchParams.set("sub", card.sub);
        await win.loadURL(url.href);
        await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
        await new Promise(r => setTimeout(r, 400));
        writeFileSync(join(__dirname, "..", card.file), (await win.webContents.capturePage()).toPNG());
        console.log("wrote", card.file);
        win.destroy();
    }
    app.quit();
});
