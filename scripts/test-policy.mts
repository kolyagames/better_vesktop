/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Quick check of the network policy: pnpm tsx scripts/test-policy.mts
import { isPrivateAddress } from "../src/main/betterdiscord/ip";

const mustBlock = [
    "127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.5", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1",
    "::1", "::", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001", "::0001", "::ffff:127.0.0.1", "::ffff:7f00:1",
    "::FFFF:7F00:0001", "0:0:0:0:0:ffff:192.168.0.1", "::ffff:a00:1", "64:ff9b::7f00:1", "64:ff9b::192.168.0.1",
    "2002:7f00:1::", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "febf::1",
    "fec0::1", "ff02::1", "[::1]", "::127.0.0.1", "not-an-ip", "1.2.3"
];
const mustAllow = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"];

let failed = 0;
for (const ip of mustBlock) if (!isPrivateAddress(ip)) (failed++, console.error("NOT BLOCKED:", ip));
for (const ip of mustAllow) if (isPrivateAddress(ip)) (failed++, console.error("WRONGLY BLOCKED:", ip));
console.log(failed ? `${failed} failed` : `ok: ${mustBlock.length} blocked, ${mustAllow.length} allowed`);
process.exit(failed ? 1 : 0);
