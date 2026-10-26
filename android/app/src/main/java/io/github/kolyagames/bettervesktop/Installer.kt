/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

package io.github.kolyagames.bettervesktop

import android.content.Context
import java.io.File

/**
 * The install / update run, step by step like Aliucord Manager shows it. Used with a UI by [ManagerActivity] and
 * silently by [MainActivity] every 12 hours. Blocking: run it off the main thread.
 */
class Installer(private val context: Context) {

    enum class State { WAITING, RUNNING, DONE, SKIPPED, WARNING, FAILED }

    interface Listener {
        fun step(index: Int, state: State, detail: String) {}
        fun progress(index: Int, fraction: Float) {}
        fun log(line: String) {}

        companion object {
            val NONE = object : Listener {}
        }
    }

    companion object {
        val STEPS = listOf(R.string.step_check, R.string.step_vencord, R.string.step_betterdiscord, R.string.step_folders)

        /** Only one run at a time, whether it comes from the manager or the background check. */
        private val lock = Any()
    }

    private val components = Components(context)
    private val prefs = Prefs(context)
    private fun s(id: Int, vararg args: Any) = context.getString(id, *args)

    /** Returns true when something new was installed. */
    fun run(listener: Listener): Boolean = synchronized(lock) {
        var changed = false
        STEPS.indices.forEach { listener.step(it, State.WAITING, "") }

        // 1. what is new on GitHub
        listener.step(0, State.RUNNING, s(R.string.detail_contacting_github))
        val vencordRelease = runCatching { components.latestRelease(Components.VENCORD_REPO) }
            .onFailure { listener.log("Vencord: ${it.message}") }.getOrNull()
        val bdRelease = runCatching { components.latestRelease(Components.BD_REPO) }
            .onFailure { listener.log("BetterDiscord: ${it.message}") }.getOrNull()
        if (vencordRelease == null && bdRelease == null) listener.step(0, State.FAILED, s(R.string.detail_no_network))
        else listener.step(0, State.DONE, s(R.string.detail_checked))

        // 2. Vencord
        when {
            vencordRelease == null -> listener.step(
                1,
                if (components.vencordInstalled()) State.WARNING else State.FAILED,
                if (components.vencordInstalled()) s(R.string.detail_kept, components.vencordVersion() ?: "?") else s(R.string.detail_unavailable)
            )

            !components.vencordUpdateAvailable(vencordRelease) ->
                listener.step(1, State.SKIPPED, s(R.string.detail_current, components.vencordVersion() ?: "?"))

            else -> {
                listener.step(1, State.RUNNING, s(R.string.detail_downloading))
                try {
                    val version = components.installVencord(vencordRelease) { done, total ->
                        if (total > 0) listener.progress(1, done.toFloat() / total)
                    }
                    listener.log("Vencord $version")
                    listener.step(1, State.DONE, s(R.string.detail_installed, version))
                    changed = true
                } catch (e: Exception) {
                    listener.log("Vencord: ${e.message}")
                    listener.step(1, if (components.vencordInstalled()) State.WARNING else State.FAILED, e.message ?: "")
                }
            }
        }

        // 3. BetterDiscord: the newest release if it still fits the patches, otherwise the bundled one
        val bundled = components.bundledBetterDiscordVersion()
        when {
            prefs.useBundledBetterDiscord -> listener.step(2, State.SKIPPED, s(R.string.detail_bundled_selected, bundled))
            bdRelease == null -> listener.step(2, State.WARNING, s(R.string.detail_kept, components.activeBetterDiscord().first))
            !components.betterDiscordUpdateAvailable(bdRelease) -> {
                val (version, isBundled) = components.activeBetterDiscord()
                listener.step(2, State.SKIPPED, if (isBundled) s(R.string.detail_bundled_kept, version) else s(R.string.detail_current, version))
            }

            else -> {
                listener.step(2, State.RUNNING, s(R.string.detail_downloading))
                try {
                    when (val result = components.installBetterDiscord(bdRelease) { done, total ->
                        if (total > 0) listener.progress(2, done.toFloat() / total)
                    }) {
                        is Components.BdResult.Installed -> {
                            listener.log("BetterDiscord ${result.version}")
                            listener.step(2, State.DONE, s(R.string.detail_installed, result.version))
                            changed = true
                        }

                        is Components.BdResult.AlreadyCurrent -> listener.step(2, State.SKIPPED, s(R.string.detail_current, result.version))
                        is Components.BdResult.Incompatible -> {
                            listener.log("BetterDiscord ${result.version}: ${result.reason}")
                            listener.step(2, State.WARNING, s(R.string.detail_incompatible, result.version, components.activeBetterDiscord().first))
                        }
                    }
                } catch (e: Exception) {
                    listener.log("BetterDiscord: ${e.message}")
                    listener.step(2, State.WARNING, s(R.string.detail_kept, components.activeBetterDiscord().first))
                }
            }
        }

        // 4. BetterDiscord's folders
        listener.step(3, State.RUNNING, "")
        val bd = Dirs.betterDiscord(context)
        listOf("", "data/stable", "plugins", "themes").forEach { File(bd, it).mkdirs() }
        listener.step(3, State.DONE, bd.path)

        // a failed check is retried on the next start instead of waiting another 12 hours
        if (vencordRelease != null || bdRelease != null) prefs.lastUpdateCheck = System.currentTimeMillis()
        if (components.vencordInstalled()) prefs.setupDone = true
        changed
    }
}
