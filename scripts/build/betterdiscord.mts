/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as asar from "@electron/asar";
import { createHash } from "crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Prepares BetterDiscord's renderer files for the sandboxed bridge.
 *
 * We ship the unmodified, pinned BetterDiscord release (vendor/betterdiscord, Apache-2.0) and only touch the renderer:
 * BetterDiscord's own main/preload code is NOT used, it is replaced by src/main/betterdiscord and src/preload/betterdiscord.
 * Every patch asserts that its target exists, so a BetterDiscord update that moves things fails the build loudly.
 */

const ASAR_PATH = "vendor/betterdiscord/betterdiscord.asar";
const ASAR_SHA256 = "377cea1df2f006c8d1a402b25ac817a56193c4826b232830fd48201501a391b0";

function patch(source: string, name: string, from: string, to: string) {
    if (!source.includes(from)) throw new Error(`BetterDiscord patch "${name}": target not found, was BetterDiscord updated?`);
    return source.replace(from, () => to);
}

function patchRenderer(source: string) {
    // 1. No `vm` module in the sandbox: compile plugin code in the page itself, which is where it runs anyway.
    source = patch(
        source,
        "compileFunction",
        "A.vm.compileFunction(a,e,t)",
        `(()=>{let f=typeof t=="string"?t:t?.filename;try{return new Function(...e,a+"\\n//# sourceURL=betterdiscord://betterdiscord/"+(f?encodeURI(String(f).replace(/\\\\/g,"/")):"anonymous"))}catch(r){return{name:r.name,message:r.message,stack:r.stack}}})()`
    );

    // 2. The settings search hook looks for a Discord string that no longer exists. That failure used to be swallowed by
    //    an async function and silently aborted the whole settings tab, so make it non-fatal.
    source = patch(
        source,
        "settingsSearch",
        "this.patchSettingsSearch();let t=this.getLayoutBuilder()",
        `try{this.patchSettingsSearch()}catch(_e){console.warn("[BetterDiscord] settings search patch skipped",_e)};let t=this.getLayoutBuilder()`
    );

    // 3. Log failures of the async settings patch instead of losing them.
    source = patch(
        source,
        "settingsPatchErrors",
        "async patchModalSettings(){",
        `async patchModalSettings(){try{await this._pms()}catch(e){console.error("[BetterDiscord] patchModalSettings failed",e)}}async _pms(){`
    );

    // 4. BetterDiscord's lazy module waiter never fires when Vencord already loaded the settings layout module.
    source = patch(
        source,
        "settingsRootWait",
        `let e=await We(r=>r?.key==="$Root",{searchExports:!0,searchDefault:!1});`,
        `let e=await new Promise(res=>{let n=0;let t=setInterval(()=>{let m;try{m=window.BdApi?.Webpack?.getModule(r=>r?.key==="$Root",{searchExports:true,searchDefault:false})}catch{}if(m||++n>600){clearInterval(t);res(m)}},250)});`
    );

    return source;
}

export async function buildBetterDiscord(outDir = "dist/js/betterdiscord") {
    const archive = await readFile(ASAR_PATH);
    const hash = createHash("sha256").update(archive).digest("hex");
    if (hash !== ASAR_SHA256) throw new Error(`${ASAR_PATH} does not match the pinned checksum (${hash})`);

    const work = await mkdtemp(join(tmpdir(), "bd-asar-"));
    try {
        asar.extractAll(ASAR_PATH, work);

        await rm(outDir, { recursive: true, force: true });
        await mkdir(join(outDir, "editor"), { recursive: true });

        const renderer = patchRenderer(await readFile(join(work, "betterdiscord.js"), "utf8"));
        await writeFile(join(outDir, "betterdiscord.js"), renderer);

        await cp(join(work, "earlyRenderer.js"), join(outDir, "earlyRenderer.js"));
        await cp(join(work, "editor", "index.html"), join(outDir, "editor", "index.html"));
        await cp(join(work, "editor", "script.js"), join(outDir, "editor", "script.js"));
    } finally {
        await rm(work, { recursive: true, force: true });
    }
}
