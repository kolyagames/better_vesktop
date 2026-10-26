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

import { applyBdPatches } from "../../src/shared/bdPatches";

/**
 * Prepares BetterDiscord's renderer files for the sandboxed bridge.
 *
 * We ship the unmodified, pinned BetterDiscord release (vendor/betterdiscord, Apache-2.0) and only touch the renderer:
 * BetterDiscord's own main/preload code is NOT used, it is replaced by src/main/betterdiscord and src/preload/betterdiscord.
 * Every patch asserts that its target exists, so a BetterDiscord update that moves things fails the build loudly.
 */

const ASAR_PATH = "vendor/betterdiscord/betterdiscord.asar";
const ASAR_SHA256 = "377cea1df2f006c8d1a402b25ac817a56193c4826b232830fd48201501a391b0";

function patchRenderer(source: string) {
    return applyBdPatches(source);
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
