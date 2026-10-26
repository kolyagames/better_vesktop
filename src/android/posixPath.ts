/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * The part of Node's `path` module BetterDiscord and its plugins use, for POSIX paths only (Android has no other kind).
 * On desktop these calls go to the main process over IPC; here they are pure string functions, so they run in the page.
 * Behaviour follows Node's path.posix; scripts/test-android.mts compares the two.
 */

const SEP = "/";

function assertPath(p: unknown): asserts p is string {
    if (typeof p !== "string") throw new TypeError(`The "path" argument must be of type string. Received ${typeof p}`);
}

/** Resolves `.` and `..` segments. Same algorithm as Node's normalizeString for POSIX. */
function normalizeString(path: string, allowAboveRoot: boolean): string {
    let res = "";
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code = 0;

    for (let i = 0; i <= path.length; ++i) {
        if (i < path.length) code = path.charCodeAt(i);
        else if (code === 47) break;
        else code = 47;

        if (code === 47) {
            if (lastSlash === i - 1 || dots === 1) {
                // empty segment or "."
            } else if (dots === 2) {
                if (res.length < 2 || lastSegmentLength !== 2 || !res.endsWith("..")) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(SEP);
                        if (lastSlashIndex === -1) {
                            res = "";
                            lastSegmentLength = 0;
                        } else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(SEP);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    } else if (res.length !== 0) {
                        res = "";
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    res += res.length > 0 ? "/.." : "..";
                    lastSegmentLength = 2;
                }
            } else {
                if (res.length > 0) res += SEP + path.slice(lastSlash + 1, i);
                else res = path.slice(lastSlash + 1, i);
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        } else if (code === 46 && dots !== -1) {
            ++dots;
        } else {
            dots = -1;
        }
    }
    return res;
}

/** BetterDiscord treats the page as running at "/"; there is no real working directory in a WebView. */
const cwd = () => "/";

export function resolve(...args: string[]): string {
    let resolvedPath = "";
    let resolvedAbsolute = false;

    for (let i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
        const path = i >= 0 ? args[i] : cwd();
        assertPath(path);
        if (path.length === 0) continue;
        resolvedPath = `${path}/${resolvedPath}`;
        resolvedAbsolute = path.charCodeAt(0) === 47;
    }

    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute);
    if (resolvedAbsolute) return `/${resolvedPath}`;
    return resolvedPath.length > 0 ? resolvedPath : ".";
}

export function normalize(path: string): string {
    assertPath(path);
    if (path.length === 0) return ".";

    const isAbs = path.charCodeAt(0) === 47;
    const trailingSeparator = path.charCodeAt(path.length - 1) === 47;

    path = normalizeString(path, !isAbs);
    if (path.length === 0) {
        if (isAbs) return "/";
        return trailingSeparator ? "./" : ".";
    }
    if (trailingSeparator) path += "/";
    return isAbs ? `/${path}` : path;
}

export function isAbsolute(path: string): boolean {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === 47;
}

export function join(...args: string[]): string {
    if (args.length === 0) return ".";
    let joined: string | undefined;
    for (const arg of args) {
        assertPath(arg);
        if (arg.length > 0) joined = joined === undefined ? arg : `${joined}/${arg}`;
    }
    return joined === undefined ? "." : normalize(joined);
}

export function relative(from: string, to: string): string {
    assertPath(from);
    assertPath(to);
    if (from === to) return "";

    from = resolve(from);
    to = resolve(to);
    if (from === to) return "";

    const fromStart = 1;
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    const toStart = 1;
    const toLen = to.length - toStart;

    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
        const fromCode = from.charCodeAt(fromStart + i);
        if (fromCode !== to.charCodeAt(toStart + i)) break;
        else if (fromCode === 47) lastCommonSep = i;
    }
    if (i === length) {
        if (toLen > length) {
            if (to.charCodeAt(toStart + i) === 47) return to.slice(toStart + i + 1);
            if (i === 0) return to.slice(toStart + i);
        } else if (fromLen > length) {
            if (from.charCodeAt(fromStart + i) === 47) lastCommonSep = i;
            else if (i === 0) lastCommonSep = 0;
        }
    }

    let out = "";
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
        if (i === fromEnd || from.charCodeAt(i) === 47) out += out.length === 0 ? ".." : "/..";
    }
    return `${out}${to.slice(toStart + lastCommonSep)}`;
}

export function dirname(path: string): string {
    assertPath(path);
    if (path.length === 0) return ".";
    const hasRoot = path.charCodeAt(0) === 47;
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1; i >= 1; --i) {
        if (path.charCodeAt(i) === 47) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        } else {
            matchedSlash = false;
        }
    }
    if (end === -1) return hasRoot ? "/" : ".";
    if (hasRoot && end === 1) return "//";
    return path.slice(0, end);
}

export function basename(path: string, suffix?: string): string {
    if (suffix !== undefined && typeof suffix !== "string") throw new TypeError('The "ext" argument must be of type string');
    assertPath(path);

    let start = 0;
    let end = -1;
    let matchedSlash = true;

    if (suffix !== undefined && suffix.length > 0 && suffix.length <= path.length) {
        if (suffix === path) return "";
        let extIdx = suffix.length - 1;
        let firstNonSlashEnd = -1;
        for (let i = path.length - 1; i >= 0; --i) {
            const code = path.charCodeAt(i);
            if (code === 47) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            } else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === suffix.charCodeAt(extIdx)) {
                        if (--extIdx === -1) end = i;
                    } else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) end = firstNonSlashEnd;
        else if (end === -1) end = path.length;
        return path.slice(start, end);
    }

    for (let i = path.length - 1; i >= 0; --i) {
        if (path.charCodeAt(i) === 47) {
            if (!matchedSlash) {
                start = i + 1;
                break;
            }
        } else if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
    }
    if (end === -1) return "";
    return path.slice(start, end);
}

export function extname(path: string): string {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }

    if (
        startDot === -1 ||
        end === -1 ||
        preDotState === 0 ||
        (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    ) {
        return "";
    }
    return path.slice(startDot, end);
}

export interface ParsedPath {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
}

export function parse(path: string): ParsedPath {
    assertPath(path);
    const ret: ParsedPath = { root: "", dir: "", base: "", ext: "", name: "" };
    if (path.length === 0) return ret;

    const isAbs = path.charCodeAt(0) === 47;
    let start: number;
    if (isAbs) {
        ret.root = "/";
        start = 1;
    } else {
        start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;

    for (; i >= start; --i) {
        const code = path.charCodeAt(i);
        if (code === 47) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === 46) {
            if (startDot === -1) startDot = i;
            else if (preDotState !== 1) preDotState = 1;
        } else if (startDot !== -1) {
            preDotState = -1;
        }
    }

    if (end !== -1) {
        const start2 = startPart === 0 && isAbs ? 1 : startPart;
        if (
            startDot === -1 ||
            preDotState === 0 ||
            (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
        ) {
            ret.base = ret.name = path.slice(start2, end);
        } else {
            ret.name = path.slice(start2, startDot);
            ret.base = path.slice(start2, end);
            ret.ext = path.slice(startDot, end);
        }
    }

    if (startPart > 0) ret.dir = path.slice(0, startPart - 1);
    else if (isAbs) ret.dir = "/";

    return ret;
}

export function format(obj: Partial<ParsedPath>): string {
    if (obj === null || typeof obj !== "object") throw new TypeError('The "pathObject" argument must be of type object');
    const dir = obj.dir || obj.root;
    const base = obj.base || `${obj.name || ""}${obj.ext ? (obj.ext[0] === "." ? "" : ".") + obj.ext : ""}`;
    if (!dir) return base;
    return dir === obj.root ? `${dir}${base}` : `${dir}/${base}`;
}

export const sep = SEP;
export const delimiter = ":";
