/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Loads discord.com with the mods in it.
 *
 * The main document is fetched by the app instead of the WebView, for two reasons that are both done on desktop by
 * Electron's session hooks (src/main/betterdiscord/csp.ts and the preload):
 *  - Discord's Content-Security-Policy is removed, so BetterDiscord can compile plugins and load remote themes;
 *  - the mod scripts are put at the top of <head>, so they run before Discord's own code, in a fixed order.
 *
 * The scripts are served from /__bdvk/ on Discord's own origin by [Components].
 */
class DiscordWebClient(
    private val components: Components,
    private val token: () -> String,
    private val betterDiscordEnabled: () -> Boolean,
    private val userAgent: () -> String,
    private val callbacks: Callbacks
) : WebViewClient() {

    interface Callbacks {
        fun onTopPageChanged(url: String?, newDocument: Boolean)
        fun openExternal(uri: Uri)
        fun onRendererGone(crashed: Boolean)
    }

    companion object {
        private const val TAG = "BetterVesktop"
        private val CSP = Regex("^content-security-policy(-report-only)?$", RegexOption.IGNORE_CASE)
        private val DROPPED_RESPONSE_HEADERS = setOf("content-length", "content-encoding", "transfer-encoding", "set-cookie", "connection")
        private val DROPPED_REQUEST_HEADERS = setOf("accept-encoding", "cookie", "host", "content-length", "connection")
        private val HEAD_TAG = Regex("<head(\\s[^>]*)?>", RegexOption.IGNORE_CASE)
    }

    private fun tags(): String = buildString {
        append("<script src=\"/__bdvk/shim.js\" data-bdvk=\"").append(token()).append("\"></script>")
        if (betterDiscordEnabled()) append("<script src=\"/__bdvk/bd-early.js\"></script>")
        if (components.vencordInstalled()) {
            append("<link rel=\"stylesheet\" href=\"/__bdvk/vencord.css\">")
            append("<script src=\"/__bdvk/vencord.js\"></script>")
        }
        append("<script src=\"/__bdvk/mobile.js\"></script>")
        append("<script src=\"/__bdvk/better-vesktop.js\"></script>")
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val uri = request.url
        if (!Discord.isDiscordPage(uri)) return null

        val path = uri.path ?: ""
        if (path.startsWith("/__bdvk/")) return serveAsset(path.removePrefix("/__bdvk/"))

        if (request.isForMainFrame && request.method.equals("GET", ignoreCase = true)) {
            return try {
                fetchDocument(request)
            } catch (e: Exception) {
                // never leave the user on a blank page: without mods is better than nothing
                Log.w(TAG, "could not prepare ${uri.path}, loading it unmodified", e)
                null
            }
        }
        return null
    }

    private fun serveAsset(name: String): WebResourceResponse {
        val stream = try {
            components.open(name)
        } catch (e: Exception) {
            Log.w(TAG, "asset $name failed", e)
            null
        }
        val headers = mapOf("Cache-Control" to "no-store")
        if (stream == null) {
            return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, ByteArrayInputStream(ByteArray(0)))
        }
        val mime = if (name.endsWith(".css")) "text/css" else "text/javascript"
        return WebResourceResponse(mime, "utf-8", 200, "OK", headers, stream)
    }

    private fun fetchDocument(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url.toString()
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.instanceFollowRedirects = true
            conn.useCaches = false
            conn.connectTimeout = 20_000
            conn.readTimeout = 30_000
            for ((name, value) in request.requestHeaders) {
                if (name.lowercase() !in DROPPED_REQUEST_HEADERS) conn.setRequestProperty(name, value)
            }
            conn.setRequestProperty("User-Agent", userAgent())
            CookieManager.getInstance().getCookie(url)?.let { conn.setRequestProperty("Cookie", it) }

            val status = conn.responseCode
            // keep Cloudflare and Discord's own cookies in the WebView's jar
            conn.headerFields["Set-Cookie"]?.forEach { CookieManager.getInstance().setCookie(url, it) }
            conn.headerFields["set-cookie"]?.forEach { CookieManager.getInstance().setCookie(url, it) }

            val contentType = conn.contentType ?: "text/html"
            val mime = contentType.substringBefore(';').trim().ifEmpty { "text/html" }
            val charset = Regex("charset=([^;]+)", RegexOption.IGNORE_CASE).find(contentType)?.groupValues?.get(1)?.trim() ?: "utf-8"
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val raw = stream?.use { it.readBytes() } ?: ByteArray(0)

            val headers = LinkedHashMap<String, String>()
            for ((name, values) in conn.headerFields) {
                if (name == null || values.isNullOrEmpty()) continue
                if (CSP.matches(name) || name.lowercase() in DROPPED_RESPONSE_HEADERS) continue
                headers[name] = values.joinToString(", ")
            }

            val body = if (status == 200 && mime.equals("text/html", ignoreCase = true)) {
                val html = String(raw, charset(charset))
                val tags = tags()
                val match = HEAD_TAG.find(html)
                val injected = if (match != null) html.substring(0, match.range.last + 1) + tags + html.substring(match.range.last + 1) else tags + html
                injected.toByteArray(charset(charset))
            } else raw

            val reason = conn.responseMessage?.takeIf { it.isNotBlank() } ?: "OK"
            return WebResourceResponse(mime, charset, status, reason, headers, ByteArrayInputStream(body))
        } finally {
            conn.disconnect()
        }
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame) return false
        val uri = request.url
        if (Discord.staysInApp(uri)) return false
        callbacks.openExternal(uri)
        return true
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        callbacks.onTopPageChanged(url, newDocument = true)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
        callbacks.onTopPageChanged(url, newDocument = false)
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        android.util.Log.w("BetterVesktop", "renderer gone, crashed=${detail.didCrash()}")
        callbacks.onRendererGone(detail.didCrash())
        return true
    }
}
