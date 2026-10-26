/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * The patches applied to BetterDiscord's renderer (betterdiscord.js) so it runs in a sandboxed page.
 *
 * Kept in one place because two builds use them: the desktop build patches the pinned BetterDiscord release at build
 * time (scripts/build/betterdiscord.mts), and the Android app ships this list as JSON and applies it at runtime to the
 * newest BetterDiscord release it downloads, falling back to the pinned one when a target is missing.
 *
 * Each patch replaces the first occurrence of `from` with `to`. A missing `from` means BetterDiscord changed and the
 * patch must not be guessed at.
 */
export interface BdPatch {
    name: string;
    from: string;
    to: string;
}

export const BD_RENDERER_PATCHES: BdPatch[] = [
    // 1. No `vm` module in the sandbox: compile plugin code in the page itself, which is where it runs anyway.
    {
        name: "compileFunction",
        from: "A.vm.compileFunction(a,e,t)",
        to: `(()=>{let f=typeof t=="string"?t:t?.filename;try{return new Function(...e,a+"\\n//# sourceURL=betterdiscord://betterdiscord/"+(f?encodeURI(String(f).replace(/\\\\/g,"/")):"anonymous"))}catch(r){return{name:r.name,message:r.message,stack:r.stack}}})()`
    },

    // 2. The settings search hook looks for a Discord string that no longer exists. That failure used to be swallowed
    //    by an async function and silently aborted the whole settings tab, so make it non-fatal.
    {
        name: "settingsSearch",
        from: "this.patchSettingsSearch();let t=this.getLayoutBuilder()",
        to: `try{this.patchSettingsSearch()}catch(_e){console.warn("[BetterDiscord] settings search patch skipped",_e)};let t=this.getLayoutBuilder()`
    },

    // 3. Log failures of the async settings patch instead of losing them.
    {
        name: "settingsPatchErrors",
        from: "async patchModalSettings(){",
        to: `async patchModalSettings(){try{await this._pms()}catch(e){console.error("[BetterDiscord] patchModalSettings failed",e)}}async _pms(){`
    },

    // 4. BetterDiscord's lazy module waiter never fires when Vencord already loaded the settings layout module.
    {
        name: "settingsRootWait",
        from: `let e=await We(r=>r?.key==="$Root",{searchExports:!0,searchDefault:!1});`,
        to: `let e=await new Promise(res=>{let n=0;let t=setInterval(()=>{let m;try{m=window.BdApi?.Webpack?.getModule(r=>r?.key==="$Root",{searchExports:true,searchDefault:false})}catch{}if(m||++n>600){clearInterval(t);res(m)}},250)});`
    }
];

export function applyBdPatches(source: string, patches: BdPatch[] = BD_RENDERER_PATCHES) {
    for (const { name, from, to } of patches) {
        if (!source.includes(from)) throw new Error(`BetterDiscord patch "${name}": target not found, was BetterDiscord updated?`);
        source = source.replace(from, () => to);
    }
    return source;
}

/**
 * Patches for BetterDiscord's early hook (earlyRenderer.js), which rewrites Discord's webpack modules. Each `from` is a
 * regular expression; `$1`..`$9` in `to` are its groups. A target that is not found is skipped: BetterDiscord may
 * have fixed the problem itself.
 */
export interface BdEarlyPatch {
    name: string;
    from: string;
    to: string;
}

export const BD_EARLY_PATCHES: BdEarlyPatch[] = [
    // The hook turns a module into `(function(...){...}).apply(this, arguments)` by looking for "(params){" at the start
    // of its source. Discord's web build for modern browsers (what a phone gets) ships modules as arrow functions,
    // `(e,t,n)=>{`, and the hook produced "(e,t,n)=arguments[0]..." for every one of them: a syntax error, all modules
    // fell back unpatched, and BetterDiscord's settings never appeared. Make them ordinary functions first.
    {
        name: "arrowModules",
        from: "function (\\w+)\\((\\w+)\\)\\{let (\\w+)=\\2\\.match\\((\\w+)\\);return!",
        to: 'function $1($2){$2=$2.replace(/^\\(([^()]*)\\)=>\\{/,(_,p)=>"function("+p+"){").replace(/^(\\w+)=>\\{/,(_,p)=>"function("+p+"){");let $3=$2.match($4);return!'
    }
];

export function applyBdEarlyPatches(source: string, patches: BdEarlyPatch[] = BD_EARLY_PATCHES) {
    for (const { from, to } of patches) {
        const match = new RegExp(from).exec(source);
        if (!match) continue;
        const replacement = to.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? "");
        source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
    }
    return source;
}
