/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop.bridge

import java.io.File
import java.io.IOException
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.URLDecoder
import java.util.concurrent.ConcurrentHashMap

/**
 * The whole security policy for BetterDiscord on Android, the counterpart of src/main/betterdiscord/policy.ts and
 * ip.ts. Plugins run inside the Discord page and reach the phone only through BdBridge, so anything not allowed here
 * does not exist for them.
 */
class BdPolicy(bdDir: File, private val localNetworkAllowed: () -> Boolean) {
    val root: File = canonical(bdDir)

    /** Files the user picked in a dialog during this session. */
    private val grants = ConcurrentHashMap.newKeySet<String>()

    fun grant(file: File) {
        grants.add(canonical(file).path)
    }

    fun allowLocalNetwork() = localNetworkAllowed()

    /** Returns the real file BetterDiscord may touch, otherwise throws. Always operate on the returned file. */
    fun resolveAllowed(input: Any?, notRoot: Boolean = false): File {
        if (input !is String || input.isEmpty() || input.contains('\u0000') || !input.startsWith("/")) {
            throw BdError("Invalid path", "EINVAL")
        }

        val real = realish(normalize(input))
        val roots = ArrayList<String>(grants.size + 1)
        roots.add(root.path)
        roots.addAll(grants)
        for (allowed in roots) {
            if (!isInside(real.path, allowed)) continue
            if (notRoot && real.path == allowed) throw BdError("Cannot modify $input itself")
            return real
        }
        throw BdError("BetterDiscord is not allowed to access $input")
    }

    companion object {
        private fun canonical(file: File): File = try {
            file.canonicalFile
        } catch (_: IOException) {
            file.absoluteFile
        }

        /** Lexical "." / ".." resolution of an absolute path, like path.resolve. */
        fun normalize(path: String): String {
            val out = ArrayDeque<String>()
            for (part in path.split('/')) {
                when (part) {
                    "", "." -> Unit
                    ".." -> out.removeLastOrNull()
                    else -> out.addLast(part)
                }
            }
            return "/" + out.joinToString("/")
        }

        /** Real path of the deepest existing ancestor plus the part that does not exist yet. Stops symlink escapes. */
        private fun realish(abs: String): File {
            var current = File(abs)
            val rest = ArrayDeque<String>()
            while (!current.exists()) {
                val parent = current.parentFile ?: break
                rest.addFirst(current.name)
                current = parent
            }
            var result = canonical(current)
            for (name in rest) result = File(result, name)
            return result
        }

        private fun isInside(child: String, root: String) = child == root || child.startsWith(if (root.endsWith("/")) root else "$root/")

        // ---------------------------------------------------------------------------------------------------------
        // network
        // ---------------------------------------------------------------------------------------------------------

        private val WEBHOOK_PATH = Regex("(^|/)api/(?:v\\d+/)?webhooks(/|$)")
        private val WEBHOOK_RAW = Regex("(?:/|%2f)api(?:/|%2f)(?:v\\d+(?:/|%2f))?webhooks")

        /** Discord webhooks: plugins must not post the user's data to attacker controlled hooks. */
        fun isWebhookUrl(raw: String): Boolean = try {
            val path = URI(raw).rawPath ?: ""
            val decoded = try {
                URLDecoder.decode(path.replace("+", "%2B"), "UTF-8")
            } catch (_: Exception) {
                path
            }
            WEBHOOK_PATH.containsMatchIn(decoded.lowercase())
        } catch (_: Exception) {
            WEBHOOK_RAW.containsMatchIn(raw.lowercase())
        }

        fun isAllowedExternalUrl(raw: Any?): Boolean {
            if (raw !is String) return false
            return try {
                URI(raw).scheme?.lowercase() in setOf("http", "https", "mailto")
            } catch (_: Exception) {
                false
            }
        }

        fun isPrivateAddress(address: InetAddress): Boolean = when (address) {
            is Inet4Address -> isPrivateV4(address.address)
            is Inet6Address -> isPrivateV6(address.address)
            else -> true
        }

        private fun isPrivateV4(b: ByteArray): Boolean {
            if (b.size != 4) return true
            val a = b[0].toInt() and 0xff
            val c = b[1].toInt() and 0xff
            return a == 0 ||
                a == 10 ||
                a == 127 ||
                (a == 100 && c in 64..127) ||
                (a == 169 && c == 254) ||
                (a == 172 && c in 16..31) ||
                (a == 192 && c == 168) ||
                (a == 192 && c == 0) ||
                a >= 224
        }

        private fun isPrivateV6(raw: ByteArray): Boolean {
            if (raw.size != 16) return true
            val b = IntArray(16) { raw[it].toInt() and 0xff }
            fun zeros(from: Int, to: Int) = (from until to).all { b[it] == 0 }
            fun v4(at: Int) = byteArrayOf(raw[at], raw[at + 1], raw[at + 2], raw[at + 3])

            if (zeros(0, 10) && b[10] == 0xff && b[11] == 0xff) return isPrivateV4(v4(12)) // ::ffff:a.b.c.d mapped
            if (zeros(0, 12)) return true // ::, ::1 and the deprecated IPv4 compatible range
            if (b[0] == 0x00 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b && zeros(4, 12)) return isPrivateV4(v4(12)) // NAT64
            if (b[0] == 0x20 && b[1] == 0x02) return isPrivateV4(v4(2)) // 6to4
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x00 && b[3] == 0x00) return true // Teredo
            if ((b[0] and 0xfe) == 0xfc) return true // fc00::/7 unique local
            if (b[0] == 0xfe && (b[1] and 0xc0) == 0x80) return true // fe80::/10 link local
            if (b[0] == 0xfe && (b[1] and 0xc0) == 0xc0) return true // fec0::/10 site local
            if (b[0] == 0xff) return true // multicast
            return false
        }
    }
}
