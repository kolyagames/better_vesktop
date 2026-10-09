/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Kept free of Electron imports so scripts/test-policy.mts can run it directly.

/** Parses any textual IPv6 form (`::`, upper case, embedded dotted IPv4, zone id) into 16 bytes, or null. */
function parseIPv6(input: string): number[] | null {
    let text = input.replace(/^\[|\]$/g, "");
    const zone = text.indexOf("%");
    if (zone !== -1) text = text.slice(0, zone);

    // embedded IPv4 in the last 32 bits: ::ffff:1.2.3.4
    const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) {
        const octets = dotted[2].split(".").map(Number);
        if (octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        text = dotted[1] + ((octets[0] << 8) | octets[1]).toString(16) + ":" + ((octets[2] << 8) | octets[3]).toString(16);
    }

    const halves = text.split("::");
    if (halves.length > 2) return null;

    const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
    const head = toGroups(halves[0]);
    const tail = halves.length === 2 ? toGroups(halves[1]) : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
    const bytes: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
        const n = parseInt(group, 16);
        bytes.push(n >> 8, n & 255);
    }
    return bytes.length === 16 ? bytes : null;
}

function isPrivateIPv6(ip: string): boolean {
    const b = parseIPv6(ip);
    if (!b) return true; // unparseable: refuse

    const zeros = (from: number, to: number) => b.slice(from, to).every(x => x === 0);
    const v4 = (at: number) => `${b[at]}.${b[at + 1]}.${b[at + 2]}.${b[at + 3]}`;

    if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateAddress(v4(12)); // ::ffff:a.b.c.d (mapped)
    if (zeros(0, 12)) return true; // ::, ::1 and the deprecated IPv4-compatible range
    if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) return isPrivateAddress(v4(12)); // 64:ff9b::/96 NAT64
    if (b[0] === 0x20 && b[1] === 0x02) return isPrivateAddress(v4(2)); // 2002::/16 6to4
    if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return true; // 2001::/32 Teredo
    if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link local
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site local
    if (b[0] === 0xff) return true; // multicast
    return false;
}

export function isPrivateAddress(ip: string): boolean {
    const v = ip.toLowerCase();
    if (v.includes(":")) return isPrivateIPv6(v);

    const parts = v.split(".").map(Number);
    if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparseable: refuse
    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 192 && b === 0) ||
        a >= 224
    );
}
