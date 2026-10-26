/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageInstaller
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.util.concurrent.Executors

/**
 * The manager, a separate launcher icon like Aliucord Manager: installs Vencord and BetterDiscord step by step,
 * shows what is installed, checks for updates of the components and of the app itself, imports plugins and themes.
 */
class ManagerActivity : Activity() {

    companion object {
        const val EXTRA_AUTO_INSTALL = "auto_install"
        private const val REQ_IMPORT = 10

        private val BG = Color.parseColor("#1E1F22")
        private val CARD = Color.parseColor("#2B2D31")
        private val TEXT = Color.parseColor("#F2F3F5")
        private val MUTED = Color.parseColor("#B5BAC1")
        private val ACCENT = Color.parseColor("#5865F2")
        private val SUCCESS = Color.parseColor("#23A55A")
        private val WARN = Color.parseColor("#F0B232")
        private val ERROR = Color.parseColor("#F23F43")
    }

    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var prefs: Prefs
    private lateinit var components: Components

    private lateinit var vencordRow: TextView
    private lateinit var bdRow: TextView
    private lateinit var appRow: TextView
    private lateinit var installButton: Button
    private lateinit var openButton: Button
    private lateinit var appUpdateButton: Button
    private lateinit var logView: TextView
    private val stepIcons = mutableListOf<TextView>()
    private val stepDetails = mutableListOf<TextView>()
    private val stepBars = mutableListOf<ProgressBar>()

    private var running = false
    private var pendingUpdate: AppUpdater.Update? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        components = Components(this)
        setContentView(buildUi())
        refresh()

        if (intent?.action == AppUpdater.ACTION_INSTALL_STATUS) handleInstallStatus(intent)
        else if (intent?.getBooleanExtra(EXTRA_AUTO_INSTALL, false) == true && (!prefs.setupDone || !components.vencordInstalled())) startInstall()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == AppUpdater.ACTION_INSTALL_STATUS) handleInstallStatus(intent)
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------------------------------------------------

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(value: CharSequence, size: Float = 15f, color: Int = TEXT, bold: Boolean = false) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun rounded(color: Int, radius: Int = 12) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }

    private fun card(title: String, parent: LinearLayout): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(CARD)
            setPadding(dp(16), dp(14), dp(16), dp(14))
        }
        card.addView(text(title.uppercase(), 12f, MUTED, bold = true).apply { letterSpacing = 0.06f })
        parent.addView(card, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
        return card
    }

    private fun row(card: LinearLayout, title: String): TextView {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, 0)
        }
        box.addView(text(title, 15f, TEXT, bold = true))
        val detail = text("", 13f, MUTED)
        box.addView(detail)
        card.addView(box)
        return detail
    }

    private fun button(label: String, primary: Boolean, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        setTextColor(Color.WHITE)
        textSize = 15f
        background = rounded(if (primary) ACCENT else Color.parseColor("#4E5058"), 8)
        setOnClickListener { onClick() }
    }

    private fun switch(card: LinearLayout, label: String, hint: String, checked: Boolean, onChange: (Boolean) -> Unit) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, 0)
        }
        box.addView(Switch(this).apply {
            text = label
            textSize = 15f
            setTextColor(TEXT)
            isChecked = checked
            setOnCheckedChangeListener { _, value -> onChange(value) }
        })
        if (hint.isNotEmpty()) box.addView(text(hint, 12f, MUTED))
        card.addView(box)
    }

    private fun buildUi(): View {
        val scroll = ScrollView(this).apply { setBackgroundColor(BG) }
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(20), dp(16), dp(24))
        }
        scroll.addView(column)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            scroll.setOnApplyWindowInsetsListener { v, insets ->
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(i.left, i.top, i.right, i.bottom)
                WindowInsets.CONSUMED
            }
        }

        column.addView(text("Better Vesktop", 26f, TEXT, bold = true))
        column.addView(text(getString(R.string.manager_subtitle, BuildConfig.VERSION_NAME), 14f, MUTED))

        // components
        val comps = card(getString(R.string.card_components), column)
        row(comps, "Discord").text = getString(R.string.discord_always_latest)
        vencordRow = row(comps, "Vencord")
        bdRow = row(comps, "BetterDiscord")

        // install steps
        val steps = card(getString(R.string.card_install), column)
        Installer.STEPS.forEach { titleRes ->
            val line = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(10), 0, 0)
            }
            val icon = text("○", 18f, MUTED).apply {
                gravity = Gravity.CENTER
                minWidth = dp(28)
            }
            val texts = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            texts.addView(text(getString(titleRes), 15f, TEXT))
            val detail = text("", 12f, MUTED).apply {
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
            }
            texts.addView(detail)
            val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
                max = 1000
                visibility = View.GONE
            }
            texts.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)))
            line.addView(icon)
            line.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(8) })
            steps.addView(line)
            stepIcons += icon
            stepDetails += detail
            stepBars += bar
        }
        logView = text("", 11f, MUTED).apply {
            typeface = Typeface.MONOSPACE
            setPadding(0, dp(10), 0, 0)
            visibility = View.GONE
        }
        steps.addView(logView)

        installButton = button(getString(R.string.install), primary = true) { startInstall() }
        steps.addView(installButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(16) })
        openButton = button(getString(R.string.open_discord), primary = false) { openDiscord() }
        steps.addView(openButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(8) })

        // settings
        val settings = card(getString(R.string.card_settings), column)
        switch(settings, getString(R.string.setting_bd), getString(R.string.setting_bd_hint), prefs.betterDiscordEnabled) {
            prefs.betterDiscordEnabled = it
        }
        switch(settings, getString(R.string.setting_bd_bundled), getString(R.string.setting_bd_bundled_hint), prefs.useBundledBetterDiscord) {
            prefs.useBundledBetterDiscord = it
            refresh()
        }
        switch(settings, getString(R.string.setting_local_network), getString(R.string.setting_local_network_hint), prefs.allowLocalNetwork) {
            prefs.allowLocalNetwork = it
        }
        switch(settings, getString(R.string.setting_debugging), getString(R.string.setting_debugging_hint), prefs.remoteDebugging) {
            prefs.remoteDebugging = it
        }

        // plugins and themes
        val addons = card(getString(R.string.card_addons), column)
        addons.addView(text(getString(R.string.addons_hint), 13f, MUTED).apply { setPadding(0, dp(8), 0, 0) })
        addons.addView(button(getString(R.string.import_files), primary = false) { importFiles() },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(12) })

        // log for bug reports
        addons.addView(button(getString(R.string.share_log), primary = false) { shareLog() },
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(8) })

        // the app itself
        val app = card(getString(R.string.card_app), column)
        appRow = row(app, "Better Vesktop")
        appUpdateButton = button(getString(R.string.check_app_update), primary = false) { appUpdate() }
        app.addView(appUpdateButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(12) })

        return scroll
    }

    private fun refresh() {
        if (!::vencordRow.isInitialized) return
        vencordRow.text = components.vencordVersion()?.let { getString(R.string.installed_version, it) } ?: getString(R.string.not_installed)
        val (bdVersion, bundled) = components.activeBetterDiscord()
        bdRow.text = getString(if (bundled) R.string.bd_bundled else R.string.bd_downloaded, bdVersion)
        if (pendingUpdate == null) appRow.text = getString(R.string.installed_version, BuildConfig.VERSION_NAME)
        val ready = components.vencordInstalled()
        openButton.isEnabled = ready
        openButton.alpha = if (ready) 1f else 0.5f
        installButton.isEnabled = !running
        installButton.alpha = if (running) 0.5f else 1f
        installButton.text = getString(if (prefs.setupDone && ready) R.string.check_updates else R.string.install)
    }

    // ---------------------------------------------------------------------------------------------------------------
    // install
    // ---------------------------------------------------------------------------------------------------------------

    private fun startInstall() {
        if (running) return
        running = true
        logView.text = ""
        logView.visibility = View.GONE
        refresh()

        val listener = object : Installer.Listener {
            override fun step(index: Int, state: Installer.State, detail: String) = runOnUiThread {
                val (glyph, color) = when (state) {
                    Installer.State.WAITING -> "○" to MUTED
                    Installer.State.RUNNING -> "◌" to ACCENT
                    Installer.State.DONE -> "✓" to SUCCESS
                    Installer.State.SKIPPED -> "✓" to MUTED
                    Installer.State.WARNING -> "!" to WARN
                    Installer.State.FAILED -> "✕" to ERROR
                }
                stepIcons[index].text = glyph
                stepIcons[index].setTextColor(color)
                stepDetails[index].text = detail
                stepBars[index].visibility = if (state == Installer.State.RUNNING && index in 1..2) View.VISIBLE else View.GONE
                stepBars[index].isIndeterminate = true
            }

            override fun progress(index: Int, fraction: Float) = runOnUiThread {
                stepBars[index].isIndeterminate = false
                stepBars[index].progress = (fraction.coerceIn(0f, 1f) * 1000).toInt()
            }

            override fun log(line: String) = runOnUiThread {
                logView.visibility = View.VISIBLE
                logView.append((if (logView.text.isEmpty()) "" else "\n") + line)
            }
        }

        worker.execute {
            val changed = try {
                Installer(applicationContext).run(listener)
            } catch (e: Exception) {
                listener.log(e.message ?: e.javaClass.simpleName)
                false
            }
            runOnUiThread {
                running = false
                refresh()
                when {
                    !components.vencordInstalled() -> toast(getString(R.string.install_failed))
                    changed -> toast(getString(R.string.install_done))
                    else -> toast(getString(R.string.nothing_to_update))
                }
            }
        }
    }

    private fun openDiscord() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        finish()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // importing plugins / themes
    // ---------------------------------------------------------------------------------------------------------------

    private fun shareLog() {
        val log = DebugLog.tail(this).ifBlank { getString(R.string.log_empty) }
        val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, log)
        startActivity(Intent.createChooser(intent, getString(R.string.share_log)))
    }

    private fun importFiles() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        try {
            startActivityForResult(intent, REQ_IMPORT)
        } catch (_: ActivityNotFoundException) {
            toast(getString(R.string.no_file_picker))
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_IMPORT || resultCode != RESULT_OK || data == null) return
        val uris = data.clipData?.let { clip -> (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri } } ?: listOfNotNull(data.data)
        worker.execute {
            val bd = Dirs.betterDiscord(this)
            var plugins = 0
            var themes = 0
            var skipped = 0
            for (uri in uris) {
                val name = displayName(uri).replace(Regex("[/\\\\]"), "_").trimStart('.')
                val dir = when {
                    name.endsWith(".plugin.js") -> File(bd, "plugins").also { plugins++ }
                    name.endsWith(".theme.css") -> File(bd, "themes").also { themes++ }
                    else -> {
                        skipped++
                        continue
                    }
                }
                dir.mkdirs()
                try {
                    contentResolver.openInputStream(uri)?.use { input -> File(dir, name).outputStream().use { input.copyTo(it) } }
                } catch (e: Exception) {
                    skipped++
                }
            }
            runOnUiThread { toast(getString(R.string.import_result, plugins, themes, skipped)) }
        }
    }

    private fun displayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.let { return it }
        }
        return uri.lastPathSegment?.substringAfterLast('/') ?: "file"
    }

    // ---------------------------------------------------------------------------------------------------------------
    // updating the app
    // ---------------------------------------------------------------------------------------------------------------

    private fun appUpdate() {
        val updater = AppUpdater(this)
        val update = pendingUpdate
        if (update == null) {
            appUpdateButton.isEnabled = false
            appRow.text = getString(R.string.checking)
            worker.execute {
                val result = runCatching { updater.check() }
                runOnUiThread {
                    appUpdateButton.isEnabled = true
                    result.onFailure { appRow.text = it.message ?: getString(R.string.no_network) }
                    result.onSuccess { found ->
                        pendingUpdate = found
                        if (found == null) {
                            appRow.text = getString(R.string.app_current, BuildConfig.VERSION_NAME)
                        } else {
                            appRow.text = getString(R.string.app_update_available, BuildConfig.VERSION_NAME, found.version)
                            appUpdateButton.text = getString(R.string.install_app_update, found.version)
                        }
                    }
                }
            }
            return
        }

        if (!updater.canInstall()) {
            toast(getString(R.string.allow_installs))
            updater.openInstallPermissionSettings()
            return
        }
        appUpdateButton.isEnabled = false
        worker.execute {
            try {
                updater.install(update) { f -> runOnUiThread { appRow.text = getString(R.string.downloading_percent, (f * 100).toInt()) } }
                runOnUiThread { appRow.text = getString(R.string.installing) }
            } catch (e: Exception) {
                runOnUiThread {
                    appUpdateButton.isEnabled = true
                    appRow.text = e.message ?: getString(R.string.install_failed)
                }
            }
        }
    }

    private fun handleInstallStatus(intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) startActivity(confirm)
            }

            PackageInstaller.STATUS_SUCCESS -> toast(getString(R.string.app_updated))
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                if (::appRow.isInitialized) {
                    appRow.text = getString(R.string.app_update_failed, message ?: "")
                    appUpdateButton.isEnabled = true
                }
            }
        }
    }

    private fun toast(message: String) = Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
