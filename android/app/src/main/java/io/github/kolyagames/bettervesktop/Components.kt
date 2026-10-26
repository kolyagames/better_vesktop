/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The parts that are downloaded instead of shipped, so they are always the newest:
 *
 *  - Vencord: the web build (browser.js / browser.css) of its latest GitHub release, the same build its browser
 *    extension uses.
 *  - BetterDiscord: betterdiscord.asar of its latest GitHub release. Only the renderer is used; it is patched at
 *    runtime with the same patches the desktop build applies (assets/bdvk/bd-patches.json). When a patch target is
 *    missing, the newest release is not used and the version bundled in the APK stays active.
 *
 * Discord itself needs no updating: the app loads discord.com, which is always the current web client.
 */
class Components(private val context: Context) {
    companion object {
        const val VENCORD_REPO = "Vendicated/Vencord"
        const val BD_REPO = "BetterDiscord/BetterDiscord"
        const val APP_REPO = "kolyagames/better_vesktop"
        private const val USER_AGENT = "BetterVesktop-Android"

        /** Same wrapping as wrapRenderer in scripts/build/android.mts. */
        fun wrapRenderer(source: String) = """(() => {
try {
$source
} catch (error) {
    console.error("[BetterDiscord] renderer failed", error);
}
})();
//# sourceURL=betterdiscord/betterdiscord.js"""
    }

    data class Asset(val name: String, val url: String, val size: Long, val updatedAt: String)
    data class Release(val tag: String, val assets: List<Asset>, val htmlUrl: String) {
        fun asset(name: String) = assets.firstOrNull { it.name == name }
    }

    sealed class BdResult {
        data class Installed(val version: String) : BdResult()
        data class AlreadyCurrent(val version: String) : BdResult()
        data class Incompatible(val version: String, val reason: String) : BdResult()
    }

    private val prefs = Prefs(context)
    private val root = Dirs.components(context)
    private val vencordDir = File(root, "vencord")
    private val bdDir = File(root, "betterdiscord")

    // ---------------------------------------------------------------------------------------------------------------
    // what is installed
    // ---------------------------------------------------------------------------------------------------------------

    fun vencordInstalled() = File(vencordDir, "browser.js").isFile && File(vencordDir, "browser.css").isFile

    /** The commit Vencord's web build names in its first line, e.g. "443688b". */
    fun vencordVersion(): String? {
        val js = File(vencordDir, "browser.js")
        if (!js.isFile) return null
        val first = js.bufferedReader().use { it.readLine() } ?: return null
        return Regex("^// Vencord (\\S+)").find(first)?.groupValues?.get(1) ?: "?"
    }

    private fun vencordMarker() = File(vencordDir, "release.txt").takeIf { it.isFile }?.readText()?.trim()

    fun bundledBetterDiscordVersion(): String =
        JSONObject(context.assets.open("bdvk/bundled.json").bufferedReader().use { it.readText() }).optString("betterDiscord", "?")

    fun downloadedBetterDiscordVersion(): String? =
        File(bdDir, "version.txt").takeIf { it.isFile && File(bdDir, "betterdiscord.js").isFile }?.readText()?.trim()

    /** Version that the next page load will use, and whether it is the bundled one. */
    fun activeBetterDiscord(): Pair<String, Boolean> {
        val downloaded = downloadedBetterDiscordVersion()
        return if (downloaded != null && !prefs.useBundledBetterDiscord) downloaded to false else bundledBetterDiscordVersion() to true
    }

    // ---------------------------------------------------------------------------------------------------------------
    // serving to the page (DiscordWebClient asks for /__bdvk/<name>)
    // ---------------------------------------------------------------------------------------------------------------

    fun open(name: String): InputStream? = when (name) {
        "shim.js", "better-vesktop.js", "mobile.js" -> context.assets.open("bdvk/$name")
        "vencord.js" -> File(vencordDir, "browser.js").takeIf { it.isFile }?.inputStream()
        "vencord.css" -> File(vencordDir, "browser.css").takeIf { it.isFile }?.inputStream()
        "bd-early.js", "betterdiscord.js" -> {
            val (_, bundled) = activeBetterDiscord()
            if (bundled) context.assets.open("bdvk/$name") else File(bdDir, name).inputStream()
        }
        else -> null
    }

    // ---------------------------------------------------------------------------------------------------------------
    // GitHub
    // ---------------------------------------------------------------------------------------------------------------

    private fun connect(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 20_000
        conn.readTimeout = 60_000
        conn.setRequestProperty("User-Agent", USER_AGENT)
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        return conn
    }

    private fun parseRelease(json: JSONObject): Release {
        val assets = json.optJSONArray("assets") ?: JSONArray()
        return Release(
            tag = json.optString("tag_name"),
            htmlUrl = json.optString("html_url"),
            assets = (0 until assets.length()).map { i ->
                val a = assets.getJSONObject(i)
                Asset(a.optString("name"), a.optString("browser_download_url"), a.optLong("size"), a.optString("updated_at"))
            }
        )
    }

    fun latestRelease(repo: String): Release {
        val conn = connect("https://api.github.com/repos/$repo/releases/latest")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("GitHub: HTTP ${conn.responseCode} для $repo")
            return parseRelease(JSONObject(conn.inputStream.bufferedReader().use { it.readText() }))
        } finally {
            conn.disconnect()
        }
    }

    /**
     * All published releases, newest first, prereleases included: Android builds are published as prereleases so
     * that the desktop app's updater, which follows the repository's "latest" release, never lands on one.
     */
    fun releases(repo: String): List<Release> {
        val conn = connect("https://api.github.com/repos/$repo/releases?per_page=30")
        try {
            if (conn.responseCode != 200) throw IllegalStateException("GitHub: HTTP ${conn.responseCode} для $repo")
            val arr = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
            return (0 until arr.length()).map { arr.getJSONObject(it) }
                .filter { !it.optBoolean("draft") }
                .map { parseRelease(it) }
        } finally {
            conn.disconnect()
        }
    }

    fun download(url: String, dest: File, progress: (Long, Long) -> Unit) {
        dest.parentFile?.mkdirs()
        var current = url
        for (hop in 0..5) {
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20_000
            conn.readTimeout = 60_000
            conn.setRequestProperty("User-Agent", USER_AGENT)
            try {
                val status = conn.responseCode
                if (status in 300..399) {
                    val location = conn.getHeaderField("Location") ?: throw IllegalStateException("Пустой redirect")
                    current = URL(URL(current), location).toString()
                    if (!current.startsWith("https://")) throw IllegalStateException("Redirect не на https")
                    continue
                }
                if (status != 200) throw IllegalStateException("HTTP $status при скачивании ${dest.name}")
                val total = conn.contentLengthLong
                val tmp = File(dest.path + ".part")
                conn.inputStream.use { input ->
                    tmp.outputStream().use { out ->
                        val buffer = ByteArray(64 * 1024)
                        var done = 0L
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            done += n
                            progress(done, total)
                        }
                    }
                }
                if (!tmp.renameTo(dest)) {
                    dest.delete()
                    if (!tmp.renameTo(dest)) throw IllegalStateException("Не удалось сохранить ${dest.name}")
                }
                return
            } finally {
                conn.disconnect()
            }
        }
        throw IllegalStateException("Слишком много redirect для ${dest.name}")
    }

    // ---------------------------------------------------------------------------------------------------------------
    // installing
    // ---------------------------------------------------------------------------------------------------------------

    /** The marker that tells whether the latest Vencord release changed (its tag is reused, the asset is not). */
    private fun marker(release: Release) = release.asset("browser.js")?.let { "${release.tag}@${it.updatedAt}" } ?: release.tag

    fun vencordUpdateAvailable(release: Release) = !vencordInstalled() || marker(release) != vencordMarker()

    fun installVencord(release: Release, progress: (Long, Long) -> Unit): String {
        val js = release.asset("browser.js") ?: throw IllegalStateException("В релизе Vencord нет browser.js")
        val css = release.asset("browser.css") ?: throw IllegalStateException("В релизе Vencord нет browser.css")

        val staging = File(root, "vencord.new").apply { deleteRecursively(); mkdirs() }
        val total = js.size + css.size
        download(js.url, File(staging, "browser.js")) { done, _ -> progress(done, total) }
        download(css.url, File(staging, "browser.css")) { done, _ -> progress(js.size + done, total) }

        val head = File(staging, "browser.js").bufferedReader().use { it.readLine() } ?: ""
        if (!head.startsWith("// Vencord")) throw IllegalStateException("Скачанный browser.js не похож на Vencord")
        File(staging, "release.txt").writeText(marker(release))

        swap(staging, vencordDir)
        return vencordVersion() ?: "?"
    }

    fun betterDiscordUpdateAvailable(release: Release): Boolean {
        val version = release.tag.removePrefix("v")
        return version != downloadedBetterDiscordVersion() && version != incompatibleBdVersion()
    }

    private fun incompatibleBdVersion() = File(root, "betterdiscord.incompatible").takeIf { it.isFile }?.readText()?.trim()

    fun installBetterDiscord(release: Release, progress: (Long, Long) -> Unit): BdResult {
        val version = release.tag.removePrefix("v")
        if (version == downloadedBetterDiscordVersion()) return BdResult.AlreadyCurrent(version)

        val asset = release.asset("betterdiscord.asar") ?: throw IllegalStateException("В релизе BetterDiscord нет betterdiscord.asar")
        val archive = File(context.cacheDir, "betterdiscord.asar")
        try {
            download(asset.url, archive, progress)

            val asar = Asar(archive)
            val renderer = String(asar.read("betterdiscord.js"), Charsets.UTF_8)
            val early = String(asar.read("earlyRenderer.js"), Charsets.UTF_8)

            val patched = try {
                applyPatches(renderer)
            } catch (e: PatchException) {
                File(root, "betterdiscord.incompatible").writeText(version)
                return BdResult.Incompatible(version, e.message ?: "patch")
            }

            val staging = File(root, "betterdiscord.new").apply { deleteRecursively(); mkdirs() }
            File(staging, "betterdiscord.js").writeText(wrapRenderer(patched))
            File(staging, "bd-early.js").writeText("${applyEarlyPatches(early)}\n//# sourceURL=betterdiscord/earlyRenderer.js")
            File(staging, "version.txt").writeText(version)
            swap(staging, bdDir)
            File(root, "betterdiscord.incompatible").delete()
            return BdResult.Installed(version)
        } finally {
            archive.delete()
        }
    }

    class PatchException(message: String) : Exception(message)

    /** Applies assets/bdvk/bd-patches.json, generated from src/shared/bdPatches.ts. */
    fun applyPatches(source: String): String {
        val patches = JSONArray(context.assets.open("bdvk/bd-patches.json").bufferedReader().use { it.readText() })
        var out = source
        for (i in 0 until patches.length()) {
            val p = patches.getJSONObject(i)
            val from = p.getString("from")
            val to = p.getString("to")
            val patched = if (p.optBoolean("regex")) replaceRegex(out, from, to) else replaceLiteral(out, from, to)
            if (patched != null) out = patched
            else if (!p.optBoolean("optional")) throw PatchException("патч \"${p.getString("name")}\" не подходит к этой версии")
        }
        return out
    }

    private fun replaceLiteral(source: String, from: String, to: String): String? {
        val index = source.indexOf(from)
        return if (index < 0) null else source.substring(0, index) + to + source.substring(index + from.length)
    }

    /** First match only; `$1`..`$9` in [to] are the groups. Null when nothing matches. */
    private fun replaceRegex(source: String, from: String, to: String): String? {
        val match = Regex(from).find(source) ?: return null
        val replacement = Regex("\\$(\\d)").replace(to) { match.groupValues.getOrElse(it.groupValues[1].toInt()) { "" } }
        return source.substring(0, match.range.first) + replacement + source.substring(match.range.last + 1)
    }

    /** Applies assets/bdvk/bd-early-patches.json (regular expressions). A patch that finds nothing is skipped. */
    fun applyEarlyPatches(source: String): String {
        val patches = JSONArray(context.assets.open("bdvk/bd-early-patches.json").bufferedReader().use { it.readText() })
        var out = source
        for (i in 0 until patches.length()) {
            val p = patches.getJSONObject(i)
            out = replaceRegex(out, p.getString("from"), p.getString("to")) ?: continue
        }
        return out
    }

    /** Replaces [target] with [staging] so a page load never sees half of an update. */
    private fun swap(staging: File, target: File) {
        val old = File(target.path + ".old")
        old.deleteRecursively()
        if (target.exists() && !target.renameTo(old)) throw IllegalStateException("Не удалось заменить ${target.name}")
        if (!staging.renameTo(target)) {
            old.renameTo(target)
            throw IllegalStateException("Не удалось установить ${target.name}")
        }
        old.deleteRecursively()
    }

    // ---------------------------------------------------------------------------------------------------------------

    /**
     * Minimal reader for Electron's asar format: a little endian size prefix, a JSON header (wrapped in a Chromium
     * pickle), then the file data. Each entry checks the SHA-256 the header lists for it.
     */
    class Asar(private val file: File) {
        private val header: JSONObject
        private val dataOffset: Long

        init {
            RandomAccessFile(file, "r").use { raf ->
                val prefix = ByteArray(16)
                raf.readFully(prefix)
                fun u32(at: Int) = (prefix[at].toLong() and 0xff) or ((prefix[at + 1].toLong() and 0xff) shl 8) or
                    ((prefix[at + 2].toLong() and 0xff) shl 16) or ((prefix[at + 3].toLong() and 0xff) shl 24)
                val headerSize = u32(4)
                val jsonLength = u32(12)
                if (jsonLength <= 0 || jsonLength > 64L * 1024 * 1024 || jsonLength > raf.length()) throw IllegalStateException("Повреждённый asar")
                val json = ByteArray(jsonLength.toInt())
                raf.seek(16)
                raf.readFully(json)
                header = JSONObject(String(json, Charsets.UTF_8))
                dataOffset = 8 + headerSize
            }
        }

        fun read(path: String): ByteArray {
            var node = header
            for (part in path.split('/')) {
                node = node.optJSONObject("files")?.optJSONObject(part) ?: throw IllegalStateException("В asar нет $path")
            }
            if (node.optBoolean("unpacked")) throw IllegalStateException("$path вынесен из asar")
            val size = node.getLong("size")
            val offset = node.getString("offset").toLong()
            if (size > 64L * 1024 * 1024) throw IllegalStateException("$path слишком большой")
            val bytes = ByteArray(size.toInt())
            RandomAccessFile(file, "r").use { raf ->
                raf.seek(dataOffset + offset)
                raf.readFully(bytes)
            }
            node.optJSONObject("integrity")?.let { integrity ->
                if (integrity.optString("algorithm").equals("SHA256", ignoreCase = true)) {
                    val hash = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
                    if (!hash.equals(integrity.optString("hash"), ignoreCase = true)) throw IllegalStateException("$path: контрольная сумма не совпадает")
                }
            }
            return bytes
        }
    }
}

