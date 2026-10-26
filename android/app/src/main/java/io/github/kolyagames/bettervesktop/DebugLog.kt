/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Small log of what went wrong inside the Discord page (JavaScript errors, renderer crashes), kept in a file so it can
 * be sent with the manager's "Share log" button. Nothing here leaves the phone unless the user shares it.
 */
object DebugLog {
    private const val MAX_BYTES = 200_000L
    private const val SHARE_BYTES = 40_000
    private val stamp = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US)

    private fun file(context: Context) = File(context.filesDir, "bdvk.log")

    @Synchronized
    fun add(context: Context, line: String) {
        try {
            val f = file(context)
            if (f.length() > MAX_BYTES) f.writeText(f.readText().takeLast((MAX_BYTES / 2).toInt()))
            f.appendText("${stamp.format(Date())} ${line.take(2000)}\n")
        } catch (_: Exception) {
        }
    }

    /** The newest part of the log, ready to put in a message. */
    @Synchronized
    fun tail(context: Context): String = try {
        file(context).takeIf { it.exists() }?.readText()?.takeLast(SHARE_BYTES) ?: ""
    } catch (_: Exception) {
        ""
    }
}
