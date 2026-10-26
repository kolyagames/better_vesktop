/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Builds the web side of the Android app into android/app/src/main/assets/bdvk/:
 *
 *   shim.js             the BetterDiscordPreload bridge (src/android/shim.ts)
 *   better-vesktop.js   the unified "Better Vesktop" settings section (src/renderer/betterVesktop)
 *   mobile.js           back button and link handling for the phone (src/android/mobile.ts)
 *   bd-early.js         BetterDiscord's webpack hook, pinned release
 *   betterdiscord.js    BetterDiscord's renderer, pinned release, patched and wrapped
 *   bd-patches.json     the renderer patches, applied by the app to newer BetterDiscord releases at runtime
 *   bundled.json        which BetterDiscord version is bundled
 *
 * Vencord is not bundled: the app downloads the newest web build (browser.js / browser.css) itself.
 */

import { build, BuildOptions } from "esbuild";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { applyBdEarlyPatches, BD_EARLY_PATCHES, BD_RENDERER_PATCHES } from "../../src/shared/bdPatches";
import { buildBetterDiscord } from "./betterdiscord.mts";
import vencordDep from "./vencordDep.mjs";

const OUT = "android/app/src/main/assets/bdvk";
const isDev = process.argv.includes("--dev");

/** Same wrapping src/main/betterdiscord/native.ts applies before executeJavaScript, so both builds behave alike. */
export function wrapRenderer(source: string) {
    return `(() => {
try {
${source}
} catch (error) {
    console.error("[BetterDiscord] renderer failed", error);
}
})();
//# sourceURL=betterdiscord/betterdiscord.js`;
}

const common: BuildOptions = {
    bundle: true,
    minify: !isDev,
    format: "iife",
    target: ["chrome90"],
    logLevel: "info",
    legalComments: "inline"
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const work = await mkdtemp(join(tmpdir(), "bdvk-android-"));
try {
    await buildBetterDiscord(work);

    const renderer = await readFile(join(work, "betterdiscord.js"), "utf8");
    const version = renderer.match(/version:"(\d+\.\d+\.\d+)"/)?.[1] ?? "unknown";

    await writeFile(join(OUT, "betterdiscord.js"), wrapRenderer(renderer));
    await writeFile(join(OUT, "bd-early.js"), applyBdEarlyPatches(await readFile(join(work, "earlyRenderer.js"), "utf8")) + "\n//# sourceURL=betterdiscord/earlyRenderer.js");
    await writeFile(join(OUT, "bd-patches.json"), JSON.stringify(BD_RENDERER_PATCHES, null, 2));
    await writeFile(join(OUT, "bd-early-patches.json"), JSON.stringify(BD_EARLY_PATCHES, null, 2));
    await writeFile(join(OUT, "bundled.json"), JSON.stringify({ betterDiscord: version }, null, 2));
} finally {
    await rm(work, { recursive: true, force: true });
}

await Promise.all([
    build({
        ...common,
        entryPoints: ["src/android/shim.ts"],
        outfile: join(OUT, "shim.js"),
        footer: { js: "//# sourceURL=BetterVesktopShim" }
    }),
    build({
        ...common,
        entryPoints: ["src/android/mobile.ts"],
        outfile: join(OUT, "mobile.js"),
        footer: { js: "//# sourceURL=BetterVesktopMobile" }
    }),
    build({
        ...common,
        entryPoints: ["src/renderer/betterVesktop/index.ts"],
        outfile: join(OUT, "better-vesktop.js"),
        inject: ["./scripts/build/injectReact.mjs"],
        jsxFactory: "VencordCreateElement",
        jsxFragment: "VencordFragment",
        external: ["@vencord/types/*"],
        plugins: [vencordDep],
        // the settings page calls VesktopNative.app.relaunch(); on Android that is the shim's small stand-in.
        // A real global named VesktopNative would make Vencord's web build think it runs inside Vesktop.
        define: { VesktopNative: "window.__bdvkVesktop" },
        footer: { js: "//# sourceURL=BetterVesktopSettings" }
    })
]);
