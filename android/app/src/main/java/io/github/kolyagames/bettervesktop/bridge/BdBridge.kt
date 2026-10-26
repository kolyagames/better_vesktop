/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop.bridge

import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors

/**
 * The object behind `window.__bdvkNative`, the Android counterpart of the IPC handlers in src/main/betterdiscord.
 *
 * WebView exposes a JavascriptInterface to every frame, third-party iframes included, so every call must carry the
 * per-launch [token]. The token is only written into the script tag the app adds to discord.com's main document.
 * Calls are additionally refused while the top page is not discord.com.
 */
class BdBridge(
    private val host: Host,
    bdDir: File,
    private val betterDiscordEnabled: () -> Boolean,
    localNetworkAllowed: () -> Boolean
) {
    /** What the bridge needs from the activity. Callbacks may come from any thread. */
    interface Host {
        fun isDiscordTopPage(): Boolean
        fun evaluate(script: String)
        fun relaunch()
        fun toast(message: String)
        fun openExternal(url: String)
        /** BetterDiscord's "open folder": on a phone this imports plugin or theme files into [dir]. */
        fun importInto(dir: File, done: (Boolean) -> Unit)
        /** Electron style open/save dialog. Settles with {canceled, filePaths} or {canceled, filePath}. */
        fun openDialog(options: Map<String, Any?>, policy: BdPolicy, done: (Map<String, Any?>) -> Unit)
        /** BetterDiscord finished writing [path]; used to deliver files saved through a save dialog. */
        fun fileWritten(path: String)
        fun appVersion(): String
        fun webViewVersion(): String
    }

    val token: String = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    private val tokenBytes = token.toByteArray()

    val policy = BdPolicy(bdDir, localNetworkAllowed)
    private val fs = BdFs(policy) { event, payload -> emit(event, payload) }
    private val net = BdNet(policy)
    private val workers = Executors.newCachedThreadPool()

    init {
        listOf("", "data", "data/stable", "data/canary", "data/ptb", "data/development", "plugins", "themes")
            .forEach { File(bdDir, it).mkdirs() }
    }

    private fun authorized(given: String?): Boolean {
        if (given == null || !MessageDigest.isEqual(given.toByteArray(), tokenBytes)) return false
        return host.isDiscordTopPage()
    }

    // ---------------------------------------------------------------------------------------------------------------

    @JavascriptInterface
    fun call(token: String?, op: String?, args: String?): String {
        if (!authorized(token)) return Json.error("Not allowed", "EACCES")
        return try {
            val a = Json.parseArgs(args)
            // state is always answered, so the page can tell that BetterDiscord is switched off
            if (op != "state" && op != "relaunch" && op != "toast" && !betterDiscordEnabled()) {
                return Json.error("BetterDiscord is disabled", "EACCES")
            }
            Json.ok(dispatch(op, a))
        } catch (e: BdError) {
            Json.error(e.message ?: "Error", e.code)
        } catch (e: Exception) {
            Log.w("BetterVesktop", "bridge call $op failed", e)
            Json.error(e.message ?: e.javaClass.simpleName)
        }
    }

    private fun dispatch(op: String?, a: List<Any?>): Any? = when (op) {
        "state" -> mapOf(
            "enabled" to betterDiscordEnabled(),
            "dir" to policy.root.path + "/",
            "appPath" to "/android_asset",
            "userData" to policy.root.parentFile?.path,
            // BetterDiscord only knows desktop platforms; Android is Linux underneath and that is what it gets
            "platform" to "linux",
            "arch" to abi(),
            "versions" to mapOf(
                "chrome" to host.webViewVersion(),
                "app" to host.appVersion(),
                "android" to Build.VERSION.RELEASE
            ),
            "releaseChannel" to "stable"
        )

        "fs" -> {
            val op = a.getOrNull(0).asStr() ?: ""
            fs.run(op, a.drop(1)).also { if (op == "writeFile") notifyWritten(a.getOrNull(1)) }
        }
        "watch" -> fs.watch(a.getOrNull(0), a.getOrNull(1).asBool())
        "unwatch" -> fs.unwatch(a.getOrNull(0).asInt())
        "stream" -> {
            val action = a.getOrNull(0).asStr()
            val path = if (action == "close") fs.streamPath(a.getOrNull(1).asInt()) else null
            fs.stream(action, a.drop(1)).also { if (path != null) host.fileWritten(path) }
        }
        "hash" -> net.hash(a.getOrNull(0), a.getOrNull(1), a.getOrNull(2))

        "openExternal" -> {
            val url = a.getOrNull(0)
            if (!BdPolicy.isAllowedExternalUrl(url)) throw BdError("Only http(s) and mailto links can be opened")
            host.openExternal(url as String)
            true
        }

        "toast" -> {
            host.toast(a.getOrNull(0).asStr()?.take(200) ?: "")
            null
        }

        "relaunch" -> {
            host.relaunch()
            null
        }

        else -> throw BdError("Unknown operation $op", "EINVAL")
    }

    @JavascriptInterface
    fun callAsync(token: String?, id: Int, op: String?, args: String?) {
        if (!authorized(token)) return
        val a = try {
            Json.parseArgs(args)
        } catch (e: Exception) {
            settle(id, Json.error("Invalid arguments", "EINVAL"))
            return
        }
        if (!betterDiscordEnabled()) {
            settle(id, Json.error("BetterDiscord is disabled", "EACCES"))
            return
        }

        when (op) {
            "fetch" -> workers.execute {
                settle(id, try {
                    Json.ok(net.fetch(id, a.getOrNull(0).asMap()))
                } catch (e: BdError) {
                    Json.error(e.message ?: "Failed to fetch", e.code)
                } catch (e: Exception) {
                    Json.error(e.message ?: "Failed to fetch")
                })
            }

            "openPath" -> {
                val target = try {
                    policy.resolveAllowed(a.getOrNull(0))
                } catch (e: BdError) {
                    settle(id, Json.error(e.message ?: "Not allowed", e.code))
                    return
                }
                // a file: nothing on the phone can edit it, show where it is instead
                if (!target.isDirectory) {
                    host.toast(target.path)
                    settle(id, Json.ok(false))
                    return
                }
                host.importInto(target) { settle(id, Json.ok(it)) }
            }

            "openDialog" -> host.openDialog(a.getOrNull(0).asMap(), policy) { settle(id, Json.ok(it)) }

            "openWindow" -> {
                val url = a.getOrNull(0)
                val ok = url is String && (url.startsWith("https://") || url.startsWith("http://"))
                if (ok) host.openExternal(url as String)
                settle(id, if (ok) Json.ok(null) else Json.error("Invalid URL", "EINVAL"))
            }

            else -> settle(id, Json.error("Unknown operation $op", "EINVAL"))
        }
    }

    @JavascriptInterface
    fun cancel(token: String?, id: Int) {
        if (!authorized(token)) return
        net.cancel(id)
    }

    // ---------------------------------------------------------------------------------------------------------------

    private fun notifyWritten(path: Any?) {
        try {
            host.fileWritten(policy.resolveAllowed(path).path)
        } catch (_: Exception) {
        }
    }

    private fun settle(id: Int, json: String) {
        host.evaluate("window.__bdvkSettle&&window.__bdvkSettle($id,${Json.jsString(json)})")
    }

    private fun emit(event: String, payload: Any?) {
        val json = Json.toJson(payload).toString()
        host.evaluate("window.__bdvkEmit&&window.__bdvkEmit(${Json.jsString(event)},${Json.jsString(json)})")
    }

    /** Called when the page goes away: watchers and streams belong to one page load. */
    fun reset() {
        fs.closeAll()
    }

    fun shutdown() {
        fs.closeAll()
        workers.shutdownNow()
    }

    private fun abi() = when (Build.SUPPORTED_ABIS.firstOrNull()) {
        "arm64-v8a" -> "arm64"
        "armeabi-v7a" -> "arm"
        "x86_64" -> "x64"
        "x86" -> "ia32"
        else -> Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown"
    }
}
