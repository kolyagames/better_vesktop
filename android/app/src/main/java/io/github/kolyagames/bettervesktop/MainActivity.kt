/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.view.KeyEvent
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.Toast
import io.github.kolyagames.bettervesktop.bridge.BdBridge
import io.github.kolyagames.bettervesktop.bridge.BdPolicy
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** The Discord window: discord.com in a WebView with Vencord and BetterDiscord loaded into it. */
class MainActivity : Activity(), BdBridge.Host, DiscordWebClient.Callbacks {

    companion object {
        private const val REQ_FILE_CHOOSER = 1
        private const val REQ_IMPORT = 2
        private const val REQ_OPEN_DIALOG = 3
        private const val REQ_SAVE_DIALOG = 4
        private const val REQ_MEDIA_PERMISSIONS = 5
        private const val REQ_STORAGE_PERMISSION = 6
        private const val UPDATE_INTERVAL_MS = 12L * 60 * 60 * 1000
    }

    private lateinit var prefs: Prefs
    private lateinit var components: Components
    private lateinit var webView: WebView
    private lateinit var bridge: BdBridge
    private lateinit var userAgent: String
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var topUrl: String? = null

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null
    private var importRequest: Pair<File, (Boolean) -> Unit>? = null
    private var dialogRequest: Triple<Map<String, Any?>, BdPolicy, (Map<String, Any?>) -> Unit>? = null
    private var pendingDownload: (() -> Unit)? = null

    /** Files BetterDiscord saved through a "save" dialog: copied to the document the user picked once written. */
    private val exportTargets = ConcurrentHashMap<String, Uri>()

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        components = Components(this)

        // first start, or Vencord missing: the manager installs everything, like Aliucord Manager does
        if (!prefs.setupDone || !components.vencordInstalled()) {
            startActivity(Intent(this, ManagerActivity::class.java).putExtra(ManagerActivity.EXTRA_AUTO_INSTALL, true))
            finish()
            return
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG || prefs.remoteDebugging)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.parseColor("#1E1F22"))
        webView = WebView(this)
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applyInsets(root)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            // the plain Chrome user agent: "wv" marks an embedded WebView and some sites treat it differently
            userAgentString = userAgentString.replace("; wv)", ")").replace(Regex("Version/\\d+\\.\\d+ "), "")
            userAgent = userAgentString
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        bridge = BdBridge(this, Dirs.betterDiscord(this), { prefs.betterDiscordEnabled }, { prefs.allowLocalNetwork })
        webView.addJavascriptInterface(bridge, "__bdvkNative")
        webView.webViewClient = DiscordWebClient(components, { bridge.token }, { prefs.betterDiscordEnabled }, { userAgent }, this)
        webView.webChromeClient = ChromeClient()
        webView.setDownloadListener { url, ua, disposition, mime, _ -> download(url, ua, disposition, mime) }

        webView.loadUrl(intent?.data?.takeIf { Discord.staysInApp(it) }?.toString() ?: Discord.APP_URL)

        updateInBackground()
    }

    private fun applyInsets(root: ViewGroup) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            root.setOnApplyWindowInsetsListener { v, insets ->
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
                v.setPadding(i.left, i.top, i.right, i.bottom)
                WindowInsets.CONSUMED
            }
        }
        // Android 9 and 10 lay the window out inside the system bars and resize it for the keyboard on their own
    }

    /** New Vencord and BetterDiscord releases are fetched quietly and used from the next start. */
    private fun updateInBackground() {
        if (System.currentTimeMillis() - prefs.lastUpdateCheck < UPDATE_INTERVAL_MS) return
        Thread {
            val changed = Installer(applicationContext).run(Installer.Listener.NONE)
            if (changed) main.post { toast(getString(R.string.updates_downloaded)) }
        }.apply { isDaemon = true }.start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val uri = intent.data ?: return
        if (!Discord.staysInApp(uri) || !::webView.isInitialized) return
        if (Discord.isDiscordPage(uri)) {
            val path = Uri.decode(uri.path ?: "/app")
            val js = "window.BetterVesktopMobile&&window.BetterVesktopMobile.navigate(${org.json.JSONObject.quote(path)})"
            webView.evaluateJavascript(js) { if (it != "true") webView.loadUrl(uri.toString()) }
        } else {
            webView.loadUrl(uri.toString())
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK && ::webView.isInitialized) {
            webView.evaluateJavascript("window.BetterVesktopMobile?window.BetterVesktopMobile.onBackPress():false") {
                // nothing left to close in Discord: leave, but keep the session alive like other messengers do
                if (it != "true") moveTaskToBack(true)
            }
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        if (::bridge.isInitialized) bridge.shutdown()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // DiscordWebClient.Callbacks
    // ---------------------------------------------------------------------------------------------------------------

    override fun onTopPageChanged(url: String?, newDocument: Boolean) {
        topUrl = url
        // watchers and write streams belong to one page load, like they belong to one WebContents on desktop
        if (newDocument && ::bridge.isInitialized) bridge.reset()
    }

    override fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            toast(getString(R.string.no_app_for_link))
        }
    }

    override fun onRendererGone() {
        // the WebView cannot be used after its renderer died; start over with a fresh one
        recreate()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // BdBridge.Host (called from the bridge thread)
    // ---------------------------------------------------------------------------------------------------------------

    override fun isDiscordTopPage(): Boolean = topUrl?.let { Discord.isDiscordPage(Uri.parse(it)) } == true

    override fun evaluate(script: String) {
        main.post { if (::webView.isInitialized) webView.evaluateJavascript(script, null) }
    }

    override fun relaunch() {
        main.post { webView.reload() }
    }

    override fun toast(message: String) {
        main.post { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    }

    override fun openExternal(url: String) {
        main.post { openExternal(Uri.parse(url)) }
    }

    override fun appVersion(): String = BuildConfig.VERSION_NAME

    override fun webViewVersion(): String = Regex("Chrome/([\\d.]+)").find(userAgent)?.groupValues?.get(1) ?: ""

    override fun importInto(dir: File, done: (Boolean) -> Unit) {
        main.post {
            importRequest?.second?.invoke(false)
            importRequest = dir to done
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("*/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            if (!launch(intent, REQ_IMPORT)) {
                importRequest = null
                done(false)
            }
        }
    }

    override fun openDialog(options: Map<String, Any?>, policy: BdPolicy, done: (Map<String, Any?>) -> Unit) {
        main.post {
            dialogRequest?.third?.invoke(mapOf("canceled" to true, "filePaths" to emptyList<String>()))
            dialogRequest = Triple(options, policy, done)
            val save = options["mode"] == "save"
            val multiple = (options["properties"] as? List<*>)?.contains("multiSelections") == true
            val intent = if (save) {
                val name = (options["defaultPath"] as? String)?.substringAfterLast('/')?.ifBlank { null } ?: "export.json"
                Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_TITLE, name)
            } else {
                Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
            }
            if (!launch(intent, if (save) REQ_SAVE_DIALOG else REQ_OPEN_DIALOG)) {
                dialogRequest = null
                done(mapOf("canceled" to true, "filePaths" to emptyList<String>()))
            }
        }
    }

    override fun fileWritten(path: String) {
        val target = exportTargets.remove(path) ?: return
        Thread {
            try {
                contentResolver.openOutputStream(target, "wt")?.use { out -> File(path).inputStream().use { it.copyTo(out) } }
                File(path).delete()
                toast(getString(R.string.file_saved))
            } catch (e: Exception) {
                toast(e.message ?: "Error")
            }
        }.start()
    }

    private fun launch(intent: Intent, request: Int): Boolean = try {
        startActivityForResult(intent, request)
        true
    } catch (_: ActivityNotFoundException) {
        false
    }

    // ---------------------------------------------------------------------------------------------------------------
    // activity results
    // ---------------------------------------------------------------------------------------------------------------

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uris = if (resultCode == RESULT_OK) pickedUris(data) else emptyList()

        when (requestCode) {
            REQ_FILE_CHOOSER -> {
                fileChooserCallback?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
                fileChooserCallback = null
            }

            REQ_IMPORT -> {
                val (dir, done) = importRequest ?: return
                importRequest = null
                if (uris.isEmpty()) return done(false)
                Thread {
                    val count = uris.count { copyInto(it, dir) != null }
                    toast(getString(R.string.imported_files, count))
                    done(count > 0)
                }.start()
            }

            REQ_OPEN_DIALOG -> {
                val (_, policy, done) = dialogRequest ?: return
                dialogRequest = null
                if (uris.isEmpty()) return done(mapOf("canceled" to true, "filePaths" to emptyList<String>()))
                Thread {
                    val dir = File(Dirs.betterDiscord(this), "imports").apply { mkdirs() }
                    val paths = uris.mapNotNull { copyInto(it, dir) }.onEach { policy.grant(it) }.map { it.path }
                    done(mapOf("canceled" to paths.isEmpty(), "filePaths" to paths))
                }.start()
            }

            REQ_SAVE_DIALOG -> {
                val (options, policy, done) = dialogRequest ?: return
                dialogRequest = null
                val target = uris.firstOrNull() ?: return done(mapOf("canceled" to true))
                val dir = File(Dirs.betterDiscord(this), "exports").apply { mkdirs() }
                val name = (options["defaultPath"] as? String)?.substringAfterLast('/')?.ifBlank { null } ?: "export.json"
                val file = File(dir, safeName(name))
                policy.grant(file)
                exportTargets[file.path] = target
                done(mapOf("canceled" to false, "filePath" to file.path))
            }
        }
    }

    private fun pickedUris(data: Intent?): List<Uri> {
        data ?: return emptyList()
        val clip = data.clipData
        if (clip != null) return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
        return listOfNotNull(data.data)
    }

    private fun safeName(name: String) = name.replace(Regex("[/\\\\\\u0000]"), "_").trim().trimStart('.').ifBlank { "file" }

    private fun displayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.let { return it }
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "file"
    }

    /** Copies a picked document into [dir]; plugins go to plugins/, themes to themes/ when importing into the root. */
    private fun copyInto(uri: Uri, dir: File): File? = try {
        val name = safeName(displayName(uri))
        val bdRoot = Dirs.betterDiscord(this).canonicalFile
        val target = when {
            dir.canonicalFile != bdRoot -> dir
            name.endsWith(".plugin.js") -> File(bdRoot, "plugins")
            name.endsWith(".theme.css") -> File(bdRoot, "themes")
            else -> dir
        }
        target.mkdirs()
        val out = File(target, name)
        contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: throw IllegalStateException()
        out
    } catch (_: Exception) {
        null
    }

    // ---------------------------------------------------------------------------------------------------------------
    // downloads and permissions
    // ---------------------------------------------------------------------------------------------------------------

    private fun download(url: String, ua: String?, disposition: String?, mime: String?) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            toast(getString(R.string.download_unsupported))
            return
        }
        val start = {
            val name = URLUtil.guessFileName(url, disposition, mime)
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mime)
                .addRequestHeader("User-Agent", ua ?: userAgent)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            toast(getString(R.string.download_started, name))
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = start
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE_PERMISSION)
        } else start()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        when (requestCode) {
            REQ_MEDIA_PERMISSIONS -> {
                val request = pendingPermission ?: return
                pendingPermission = null
                val resources = request.resources.filter { resource ->
                    androidPermissionFor(resource)?.let { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED } == true
                }
                if (resources.isEmpty()) request.deny() else request.grant(resources.toTypedArray())
            }

            REQ_STORAGE_PERMISSION -> {
                val start = pendingDownload
                pendingDownload = null
                if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) start?.invoke()
            }
        }
    }

    private fun androidPermissionFor(resource: String) = when (resource) {
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
        else -> null
    }

    private inner class ChromeClient : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = callback
            val intent = params.createIntent()
            if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            if (!launch(intent, REQ_FILE_CHOOSER)) {
                fileChooserCallback = null
                return false
            }
            return true
        }

        /** Microphone and camera for voice and video calls, only ever for discord.com itself. */
        override fun onPermissionRequest(request: PermissionRequest) {
            if (!Discord.isDiscordPage(request.origin)) {
                request.deny()
                return
            }
            val wanted = request.resources.mapNotNull { androidPermissionFor(it) }.distinct()
            if (wanted.isEmpty()) {
                request.deny()
                return
            }
            val missing = wanted.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
            if (missing.isEmpty()) {
                request.grant(request.resources.filter { androidPermissionFor(it) != null }.toTypedArray())
                return
            }
            pendingPermission?.deny()
            pendingPermission = request
            requestPermissions(missing.toTypedArray(), REQ_MEDIA_PERMISSIONS)
        }
    }
}
