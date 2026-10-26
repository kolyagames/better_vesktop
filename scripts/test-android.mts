/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * Checks for the web side of the Android app, run with `pnpm test:android` after `pnpm build:android`:
 *  - src/android/posixPath.ts against Node's path.posix
 *  - the JSON/bytes protocol of src/android/native.ts
 *  - the built shim.js in a minimal fake page, against a fake bridge that speaks the protocol of BdBridge.kt
 */

import assert from "assert/strict";
import { readFileSync } from "fs";
import { posix } from "path";
import vm from "vm";

import { decode, encode } from "../src/android/native";
import * as p from "../src/android/posixPath";

let failures = 0;
function check(name: string, fn: () => void) {
    try {
        fn();
    } catch (e: any) {
        failures++;
        console.error(`FAIL ${name}\n  ${e.message.split("\n").join("\n  ")}`);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// path
// ---------------------------------------------------------------------------------------------------------------

const samples = [
    "", "/", "//", "///a", ".", "..", "a", "a/", "/a", "/a/", "a/b/c", "/a/b/c/", "/a/./b/../c", "a/../..", "../a/b",
    "/a/b/../../..", "a//b", "/foo/bar.txt", "/foo/.bar", "/foo/.bar.baz", "foo.", ".foo.", "a.b.c", "/a/b.c/d",
    "/data/user/0/app/files/BetterDiscord/plugins/x.plugin.js", "./x/../y/", "~/a", "a/b/../../c/./d"
];

for (const s of samples) {
    check(`normalize(${JSON.stringify(s)})`, () => assert.equal(p.normalize(s), posix.normalize(s)));
    check(`dirname(${JSON.stringify(s)})`, () => assert.equal(p.dirname(s), posix.dirname(s)));
    check(`basename(${JSON.stringify(s)})`, () => assert.equal(p.basename(s), posix.basename(s)));
    check(`basename(${JSON.stringify(s)}, ".js")`, () => assert.equal(p.basename(s, ".js"), posix.basename(s, ".js")));
    check(`extname(${JSON.stringify(s)})`, () => assert.equal(p.extname(s), posix.extname(s)));
    check(`isAbsolute(${JSON.stringify(s)})`, () => assert.equal(p.isAbsolute(s), posix.isAbsolute(s)));
    check(`parse(${JSON.stringify(s)})`, () => assert.deepEqual({ ...p.parse(s) }, { ...posix.parse(s) }));
    check(`format(parse(${JSON.stringify(s)}))`, () => assert.equal(p.format(p.parse(s)), posix.format(posix.parse(s))));
    // the WebView has no working directory; BetterDiscord only ever passes absolute paths, so compare those
    if (s.startsWith("/")) {
        check(`resolve(${JSON.stringify(s)})`, () => assert.equal(p.resolve(s), posix.resolve(s)));
        check(`resolve("/x", ${JSON.stringify(s)}, "y")`, () => assert.equal(p.resolve("/x", s, "y"), posix.resolve("/x", s, "y")));
    }
    for (const t of samples) {
        check(`join(${JSON.stringify(s)}, ${JSON.stringify(t)})`, () => assert.equal(p.join(s, t), posix.join(s, t)));
        if (s.startsWith("/") && t.startsWith("/")) {
            check(`relative(${JSON.stringify(s)}, ${JSON.stringify(t)})`, () => assert.equal(p.relative(s, t), posix.relative(s, t)));
        }
    }
}
check("join()", () => assert.equal(p.join(), posix.join()));
check("format({name, ext})", () => assert.equal(p.format({ name: "a", ext: "js" }), posix.format({ name: "a", ext: "js" })));
check("non-string throws", () => assert.throws(() => p.join("a", 1 as any), TypeError));

// ---------------------------------------------------------------------------------------------------------------
// protocol
// ---------------------------------------------------------------------------------------------------------------

check("bytes survive encode/decode", () => {
    const bytes = new Uint8Array(70000).map((_, i) => i * 31);
    const back = decode<any>(encode(["x", { data: bytes }]));
    assert.equal(back[0], "x");
    assert.ok(back[1].data instanceof Uint8Array);
    assert.deepEqual(Array.from(back[1].data), Array.from(bytes));
});

// ---------------------------------------------------------------------------------------------------------------
// shim in a fake page
// ---------------------------------------------------------------------------------------------------------------

const TOKEN = "t0ken";
const files = new Map<string, string | Uint8Array>([["/bd/plugins/a.plugin.js", "// a"]]);
const calls: string[] = [];

function settleLater(ctx: any, id: number, value: unknown) {
    setTimeout(() => ctx.__bdvkSettle(id, encode({ ok: true, value })), 0);
}

const fakeBridge = {
    call(token: string, op: string, args: string) {
        if (token !== TOKEN) return encode({ ok: false, error: { message: "bad token", code: "EACCES" } });
        const a = decode<any[]>(args);
        calls.push(op + (op === "fs" ? ":" + a[0] : ""));
        switch (op) {
            case "state":
                return encode({
                    ok: true,
                    value: { enabled: true, dir: "/bd/", appPath: "/app", userData: "/data", platform: "linux", arch: "arm64", versions: { chrome: "120" }, releaseChannel: "stable" }
                });
            case "fs": {
                const [fop, path, x] = a;
                if (fop === "readFile") {
                    if (!files.has(path)) return encode({ ok: false, error: { message: "ENOENT: " + path, code: "ENOENT" } });
                    const v = files.get(path)!;
                    return encode({ ok: true, value: x ? v : typeof v === "string" ? new TextEncoder().encode(v) : v });
                }
                if (fop === "writeFile") {
                    files.set(path, x);
                    return encode({ ok: true, value: null });
                }
                if (fop === "exists") return encode({ ok: true, value: files.has(path) });
                if (fop === "readdir") return encode({ ok: true, value: [...files.keys()].map(k => k.split("/").pop()) });
                return encode({ ok: true, value: null });
            }
            case "hash":
                return encode({ ok: true, value: a[2] === "hex" ? "abc123" : new Uint8Array([1, 2, 3]) });
            case "watch":
                return encode({ ok: true, value: 7 });
            default:
                return encode({ ok: true, value: true });
        }
    },
    callAsync(token: string, id: number, op: string, args: string) {
        assert.equal(token, TOKEN);
        const [req] = decode<any[]>(args);
        calls.push("async:" + op);
        if (op === "fetch") {
            settleLater(page, id, {
                url: req.url,
                status: 200,
                statusText: "OK",
                headers: { "content-type": "text/plain" },
                redirected: false,
                body: new TextEncoder().encode("hello " + (req.body ? new TextDecoder().decode(req.body) : ""))
            });
        } else settleLater(page, id, true);
    },
    cancel() {}
};

const scriptTag = {
    dataset: { bdvk: TOKEN } as Record<string, string | undefined>,
    removeAttribute(name: string) {
        if (name === "data-bdvk") delete this.dataset.bdvk;
    },
    remove() {}
};

const page: any = {
    console,
    queueMicrotask,
    setTimeout,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    btoa,
    atob,
    crypto: globalThis.crypto,
    location: { protocol: "https:", hostname: "discord.com" },
    history: { pushState() {}, replaceState() {} },
    addEventListener() {},
    document: { currentScript: scriptTag, head: { appendChild: (el: any) => calls.push("append:" + el.src) }, createElement: () => ({}) },
    __bdvkNative: fakeBridge
};
page.window = page;
page.top = page;
vm.createContext(page);
vm.runInContext(readFileSync("android/app/src/main/assets/bdvk/shim.js", "utf8"), page);

check("token is removed from the script tag", () => assert.equal(scriptTag.dataset.bdvk, undefined));
check("process is exposed", () => assert.equal(page.process.env.BETTERDISCORD_DATA_PATH, "/bd/"));

const bd = page.BetterDiscordPreload();
check("BetterDiscordPreload is handed out once", () => assert.equal(page.BetterDiscordPreload(), null));
check("readFile utf8", () => assert.equal(bd.filesystem.readFile("/bd/plugins/a.plugin.js"), "// a"));
check("readFile binary acts like a Buffer", () => {
    const b = bd.filesystem.readFile("/bd/plugins/a.plugin.js", null);
    assert.equal(b.toString(), "// a");
    assert.equal(b.toString("hex"), "2f2f2061");
    assert.equal(b.toString("base64"), "Ly8gYQ==");
});
check("readFile error carries the code", () => {
    try {
        bd.filesystem.readFile("/bd/nope");
        assert.fail("no throw");
    } catch (e: any) {
        assert.equal(e.code, "ENOENT");
    }
});
check("writeFile bytes", () => {
    bd.filesystem.writeFile("/bd/x.bin", new Uint8Array([9, 8]));
    assert.deepEqual(Array.from(files.get("/bd/x.bin") as Uint8Array), [9, 8]);
});
check("readDirectory", () => assert.ok(bd.filesystem.readDirectory("/bd/plugins").includes("a.plugin.js")));
check("path.join", () => assert.equal(bd.path.join("/bd", "plugins", "../themes"), "/bd/themes"));
check("hash hex", () => assert.equal(bd.crypto.createHash("sha256").update("x").digest("hex"), "abc123"));
check("randomBytes", () => assert.equal(bd.crypto.randomBytes(16).length, 16));
check("watch returns a closer", () => assert.equal(typeof bd.filesystem.watch("/bd/plugins", {}, () => {}).close, "function"));
check("unknown ipc channel refused", () => assert.throws(() => bd.electron.ipcRenderer.send("evil")));

page.BetterDiscordRunRenderer();
check("renderer injected once", () => {
    page.BetterDiscordRunRenderer();
    assert.equal(calls.filter(c => c.startsWith("append:")).length, 1);
    assert.ok(calls.includes("append:/__bdvk/betterdiscord.js"));
});

const res = await bd.nativeFetch({ url: "https://example.com/", method: "POST", body: null, headers: {} });
let text = "";
for (;;) {
    const { done, value } = await res.body.read();
    if (done) break;
    text += new TextDecoder().decode(value);
}
check("nativeFetch round trip", () => {
    assert.equal(res.status, 200);
    assert.equal(text, "hello ");
});

await new Promise<void>(resolve =>
    bd.https.get("https://example.com/", {}, (err: any, r: any, body: any) => {
        check("legacy https.get", () => {
            assert.equal(err, null);
            assert.equal(r.statusCode, 200);
            assert.equal(body.toString(), "hello ");
        });
        resolve();
    })
);

check("a wrong token gets nothing", () => {
    const evil = JSON.parse(fakeBridge.call("guess", "state", "[]"));
    assert.equal(evil.ok, false);
});

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log("android: all checks passed");
