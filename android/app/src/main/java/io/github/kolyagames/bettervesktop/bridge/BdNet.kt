/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop.bridge

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * BetterDiscord's network access, the counterpart of src/main/betterdiscord/net.ts.
 *
 * Requests carry no Discord cookies or credentials: the WebView's cookies live in CookieManager, and
 * HttpURLConnection only sends cookies when a CookieHandler is installed, which this app never does.
 */
class BdNet(private val policy: BdPolicy) {
    companion object {
        /** Lower than desktop's 100 MB: the body crosses the bridge as base64 in one string. */
        const val MAX_BODY_BYTES = 50L * 1024 * 1024
        const val MAX_REDIRECTS = 20
        private val REDIRECT_STATUSES = setOf(301, 302, 303, 307, 308)
        private val HASH_ALGORITHMS = mapOf("md5" to "MD5", "sha1" to "SHA-1", "sha256" to "SHA-256", "sha384" to "SHA-384", "sha512" to "SHA-512")
        /** Headers the connection sets itself or that only make sense to the WebView. */
        private val SKIPPED_REQUEST_HEADERS = setOf("host", "content-length", "connection", "transfer-encoding", "accept-encoding", "cookie")
    }

    private val active = ConcurrentHashMap<Int, HttpURLConnection>()
    private val cancelled = ConcurrentHashMap.newKeySet<Int>()

    fun cancel(id: Int) {
        cancelled.add(id)
        active.remove(id)?.disconnect()
    }

    private fun assertUrlAllowed(url: URL) {
        val protocol = url.protocol.lowercase()
        if (protocol != "http" && protocol != "https") throw BdError("Unsupported protocol: $protocol:", "EINVAL")
        if (BdPolicy.isWebhookUrl(url.toString())) throw BdError("Failed to fetch", "EACCES")
        if (policy.allowLocalNetwork()) return

        val host = url.host.removePrefix("[").removeSuffix("]").lowercase()
        if (host == "localhost" || host.endsWith(".localhost")) throw BdError("Requests to the local network are blocked", "EACCES")

        val addresses = try {
            InetAddress.getAllByName(host)
        } catch (e: Exception) {
            throw BdError("getaddrinfo ENOTFOUND $host", "ENOTFOUND")
        }
        if (addresses.any { BdPolicy.isPrivateAddress(it) }) throw BdError("Requests to the local network are blocked", "EACCES")
    }

    /** Runs on a worker thread. Returns the BdFetchResponse shape of src/shared/betterDiscord.ts. */
    fun fetch(id: Int, request: Map<String, Any?>): Map<String, Any?> {
        try {
            val redirectMode = request["redirect"].asStr() ?: "follow"
            val limit = minOf(request["maxRedirects"].asInt() ?: MAX_REDIRECTS, MAX_REDIRECTS)
            // only when the caller asked for one (BetterDiscord's default is 8s, raised to 30s like desktop); null disables
            val timeoutMs = if (request.containsKey("timeout") && request["timeout"] == null) 0
            else maxOf(request["timeout"].asInt() ?: 8000, 30_000)
            val headers = request["headers"].asMap()

            var url = URL(request["url"].asStr() ?: throw BdError("Invalid URL", "EINVAL"))
            var method = (request["method"].asStr() ?: "GET").uppercase()
            var body = request["body"] as? ByteArray
            var redirected = false

            var hops = 0
            while (true) {
                if (id in cancelled) throw BdError("Request was aborted", "ABORT_ERR")
                assertUrlAllowed(url)

                val conn = url.openConnection() as HttpURLConnection
                active[id] = conn
                try {
                    conn.instanceFollowRedirects = false
                    conn.useCaches = false
                    conn.connectTimeout = timeoutMs
                    conn.readTimeout = timeoutMs
                    conn.requestMethod = method
                    for ((name, value) in headers) {
                        if (name.lowercase() in SKIPPED_REQUEST_HEADERS || value == null) continue
                        conn.setRequestProperty(name, value.toString())
                    }
                    val sendBody = body != null && method != "GET" && method != "HEAD"
                    if (sendBody) {
                        conn.doOutput = true
                        conn.setFixedLengthStreamingMode(body!!.size)
                        conn.outputStream.use { it.write(body) }
                    }

                    val status = conn.responseCode
                    val location = conn.getHeaderField("Location")
                    if (status in REDIRECT_STATUSES && location != null) {
                        if (redirectMode == "error") throw BdError("Failed to fetch", "ERR_REDIRECT")
                        if (redirectMode == "follow") {
                            if (hops >= limit) throw BdError("Maximum amount of redirects reached ($limit)", "ERR_REDIRECT")
                            // fetch spec: 301/302 on POST and 303 on anything but GET/HEAD turn into a GET
                            if (status == 303 && method != "HEAD" || ((status == 301 || status == 302) && method == "POST")) {
                                method = "GET"
                                body = null
                            }
                            url = URI(url.toString()).resolve(location).toURL()
                            redirected = true
                            hops++
                            continue
                        }
                    }

                    val noBody = status == 101 || status == 204 || status == 205 || status == 304 || method == "HEAD"
                    val bytes = if (noBody) null else readBody(if (status >= 400) conn.errorStream else conn.inputStream, id)

                    return mapOf(
                        "url" to url.toString(),
                        "status" to status,
                        "statusText" to (conn.responseMessage ?: ""),
                        "headers" to collectHeaders(conn),
                        "redirected" to redirected,
                        "body" to bytes
                    )
                } finally {
                    active.remove(id)
                    conn.disconnect()
                }
            }
        } catch (e: BdError) {
            throw e
        } catch (e: java.net.SocketTimeoutException) {
            throw BdError("Request timed out", "ETIMEDOUT")
        } catch (e: Exception) {
            if (id in cancelled) throw BdError("Request was aborted", "ABORT_ERR")
            throw BdError(e.message ?: e.javaClass.simpleName, "ECONNREFUSED")
        } finally {
            cancelled.remove(id)
        }
    }

    private fun readBody(stream: InputStream?, id: Int): ByteArray? {
        if (stream == null) return ByteArray(0)
        stream.use { input ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                if (id in cancelled) throw BdError("Request was aborted", "ABORT_ERR")
                val n = input.read(buffer)
                if (n < 0) break
                total += n
                if (total > MAX_BODY_BYTES) throw BdError("Response is too large", "EFBIG")
                out.write(buffer, 0, n)
            }
            return out.toByteArray()
        }
    }

    private fun collectHeaders(conn: HttpURLConnection): Map<String, Any> {
        val out = LinkedHashMap<String, Any>()
        for ((name, values) in conn.headerFields) {
            if (name == null || values.isNullOrEmpty()) continue
            val key = name.lowercase()
            out[key] = if (key == "set-cookie") values else values.joinToString(", ")
        }
        return out
    }

    /** crypto.createHash for plugins: whole buffer in, digest out. */
    fun hash(algorithm: Any?, data: Any?, encoding: Any?): Any {
        val name = HASH_ALGORITHMS[algorithm.asStr()?.lowercase()] ?: throw BdError("Unsupported hash algorithm", "EINVAL")
        val bytes = when (data) {
            is ByteArray -> data
            is String -> data.toByteArray()
            null -> ByteArray(0)
            else -> throw BdError("Invalid data", "EINVAL")
        }
        val digest = MessageDigest.getInstance(name).digest(bytes)
        return when (encoding.asStr()?.lowercase()) {
            null -> digest
            "hex" -> digest.joinToString("") { "%02x".format(it) }
            "base64" -> android.util.Base64.encodeToString(digest, android.util.Base64.NO_WRAP)
            "base64url" -> android.util.Base64.encodeToString(digest, android.util.Base64.NO_WRAP or android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING)
            "latin1", "binary" -> String(digest, Charsets.ISO_8859_1)
            else -> throw BdError("Unsupported digest encoding", "EINVAL")
        }
    }
}
