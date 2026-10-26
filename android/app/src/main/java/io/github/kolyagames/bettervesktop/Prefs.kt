/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.content.Context
import android.net.Uri
import java.io.File

/** App settings. The Android counterpart of Data/settings.json on desktop. */
class Prefs(context: Context) {
    private val sp = context.applicationContext.getSharedPreferences("better_vesktop", Context.MODE_PRIVATE)

    var betterDiscordEnabled: Boolean
        get() = sp.getBoolean("bd_enabled", true)
        set(v) = sp.edit().putBoolean("bd_enabled", v).apply()

    /** Same as "allowLocalNetwork" on desktop: plugins may reach localhost and private networks. Off by default. */
    var allowLocalNetwork: Boolean
        get() = sp.getBoolean("bd_allow_local_network", false)
        set(v) = sp.edit().putBoolean("bd_allow_local_network", v).apply()

    /** Ignore the downloaded BetterDiscord and use the one bundled with the app (checked against the patches). */
    var useBundledBetterDiscord: Boolean
        get() = sp.getBoolean("bd_use_bundled", false)
        set(v) = sp.edit().putBoolean("bd_use_bundled", v).apply()

    var setupDone: Boolean
        get() = sp.getBoolean("setup_done", false)
        set(v) = sp.edit().putBoolean("setup_done", v).apply()

    var lastUpdateCheck: Long
        get() = sp.getLong("last_update_check", 0L)
        set(v) = sp.edit().putLong("last_update_check", v).apply()

    var remoteDebugging: Boolean
        get() = sp.getBoolean("remote_debugging", false)
        set(v) = sp.edit().putBoolean("remote_debugging", v).apply()
}

object Dirs {
    /** BetterDiscord's folder: plugins, themes, data. Private to the app, like the portable folder on desktop. */
    fun betterDiscord(context: Context) = File(context.filesDir, "BetterDiscord")

    /** Downloaded Vencord and BetterDiscord builds. */
    fun components(context: Context) = File(context.filesDir, "components")
}

object Discord {
    /** Same list as DISCORD_HOSTNAMES in src/main/constants.ts: the only pages that get the bridge. */
    val HOSTS = setOf("discord.com", "canary.discord.com", "ptb.discord.com")

    /** Links that stay inside the app instead of opening the browser. */
    private val IN_APP_HOSTS = HOSTS + setOf("discord.gg", "discordapp.com", "www.discordapp.com", "discord.new")

    const val APP_URL = "https://discord.com/app"

    fun isDiscordHost(host: String?) = host != null && host.lowercase() in HOSTS

    fun isDiscordPage(uri: Uri?) = uri != null && uri.scheme == "https" && isDiscordHost(uri.host)

    fun staysInApp(uri: Uri) = uri.scheme == "https" && uri.host?.lowercase() in IN_APP_HOSTS
}
