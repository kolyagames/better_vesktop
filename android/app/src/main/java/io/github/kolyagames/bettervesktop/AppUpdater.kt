/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.File

/**
 * Updates the app itself from this repository's GitHub releases. Android builds are published as releases tagged
 * `android-v<version>` with the APK attached (see .github/workflows/android.yml). Installing goes through
 * PackageInstaller, so Android checks that the new APK is signed with the same key.
 */
class AppUpdater(private val activity: Activity) {
    data class Update(val version: String, val url: String, val size: Long, val pageUrl: String)

    companion object {
        const val ACTION_INSTALL_STATUS = "io.github.kolyagames.bettervesktop.INSTALL_STATUS"
        private const val TAG_PREFIX = "android-v"

        /** Plain numeric comparison of dotted versions, "1.10.0" > "1.9.3". */
        fun isNewer(candidate: String, current: String): Boolean {
            val a = candidate.split('.', '-').map { it.toIntOrNull() ?: 0 }
            val b = current.split('.', '-').map { it.toIntOrNull() ?: 0 }
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return false
        }
    }

    /** The newest Android release, or null when the installed version is current. Blocking. */
    fun check(): Update? {
        val release = Components(activity).releases(Components.APP_REPO)
            .firstOrNull { it.tag.startsWith(TAG_PREFIX) && it.assets.any { a -> a.name.endsWith(".apk") } } ?: return null
        val version = release.tag.removePrefix(TAG_PREFIX)
        if (!isNewer(version, BuildConfig.VERSION_NAME)) return null
        val apk = release.assets.first { it.name.endsWith(".apk") }
        return Update(version, apk.url, apk.size, release.htmlUrl)
    }

    /** Android asks once whether this app may install other apps; without that the session cannot start. */
    fun canInstall(): Boolean = activity.packageManager.canRequestPackageInstalls()

    fun openInstallPermissionSettings() {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
    }

    /** Downloads and hands the APK to PackageInstaller. Blocking; the result arrives as [ACTION_INSTALL_STATUS]. */
    fun install(update: Update, progress: (Float) -> Unit) {
        val apk = File(activity.cacheDir, "update.apk")
        try {
            Components(activity).download(update.url, apk) { done, total -> if (total > 0) progress(done.toFloat() / total) }

            val installer = activity.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(activity.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
            val sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                session.openWrite("base.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val intent = Intent(activity, ManagerActivity::class.java).setAction(ACTION_INSTALL_STATUS)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                val pending = PendingIntent.getActivity(activity, sessionId, intent, flags)
                session.commit(pending.intentSender)
            }
        } finally {
            apk.delete()
        }
    }
}
