/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getStrings, Strings } from "./i18n";
import { UNIFIED_CSS } from "./unified.css";

/*
 * One settings section ("Better Vesktop") instead of a Vencord one and a BetterDiscord one, and one Plugins page that
 * lists the plugins of both clients side by side.
 *
 * Vencord builds its section in `Settings.buildLayout`, BetterDiscord splices its own section into Discord's settings
 * layout. We wrap Vencord's function (it runs after BetterDiscord's patch) and merge the two sections there.
 */

declare const BdApi: any;

const TITLE = "Better Vesktop";
const STYLE_ID = "bdvk-unified-style";
const LOG = "[Better Vesktop]";

type Source = "vencord" | "bd";
type Filter = "all" | "vencord" | "bd" | "on" | "off";

interface PluginItem {
    src: Source;
    key: string;
    id?: string;
    name: string;
    desc: string;
    author: string;
    version?: string;
    enabled: boolean;
    required: boolean;
    hasSettings: boolean;
    raw: any;
}

interface PageState {
    restart: boolean;
    filter: Filter;
    query: string;
}

const strings: Strings = getStrings();

function toast(message: string, error = false) {
    try {
        const { Toasts } = Vencord.Webpack.Common;
        Toasts.show({ message, type: error ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS, id: Toasts.genId() });
    } catch {
        try {
            BdApi.UI.showToast(message, { type: error ? "error" : "info" });
        } catch {}
    }
}

// ---- data ------------------------------------------------------------------------------------------------------

function vencordPlugins(): PluginItem[] {
    const P: any = Vencord.Plugins;
    return (Object.values(P.plugins) as any[])
        .filter(p => !p.hidden && !/API$/.test(p.name))
        .map(p => ({
            src: "vencord" as const,
            key: "vc:" + p.name,
            name: p.name,
            desc: p.description ?? "",
            author: (p.authors ?? [])
                .map((a: any) => a?.name ?? a)
                .filter(Boolean)
                .join(", "),
            enabled: P.isPluginEnabled(p.name),
            required: !!p.required,
            hasSettings: !!(p.options && P.hasAnyVisibleSettings?.(p)) || !!p.settingsAboutComponent,
            raw: p
        }));
}

function bdPlugins(): PluginItem[] {
    if (typeof BdApi === "undefined") return [];
    const B = BdApi.Plugins;
    return B.getAll().map((p: any) => {
        const id = p.id ?? p.name;
        return {
            src: "bd" as const,
            key: "bd:" + id,
            id,
            name: p.name ?? id,
            desc: p.description ?? "",
            author: p.author ?? "",
            version: p.version,
            enabled: B.isEnabled(id),
            required: false,
            hasSettings: typeof B.get(id)?.instance?.getSettingsPanel === "function",
            raw: p
        };
    });
}

// ---- actions ---------------------------------------------------------------------------------------------------

function toggleVencord(item: PluginItem, state: PageState) {
    const P: any = Vencord.Plugins;
    const plugin = item.raw;
    const settings = Vencord.Settings.plugins[plugin.name];
    const restart = P.pluginRequiresRestart(plugin);

    if (!P.isPluginEnabled(plugin.name)) {
        let depsRestart = false;
        try {
            const res = P.startDependenciesRecursive(plugin);
            if (res?.failures?.length) return toast(strings.depsFailed + res.failures.join(", "), true);
            depsRestart = !!res?.restartNeeded;
        } catch (e) {
            console.error(LOG, "dependencies", e);
        }

        settings.enabled = true;
        if (restart || depsRestart) state.restart = true;
        else if (!P.startPlugin(plugin)) {
            settings.enabled = false;
            toast(strings.startFailed + plugin.name, true);
        }
    } else if (restart) {
        settings.enabled = false;
        state.restart = true;
    } else if (P.stopPlugin(plugin)) {
        settings.enabled = false;
    } else {
        toast(strings.stopFailed + plugin.name, true);
    }
}

function toggleBd(item: PluginItem) {
    try {
        BdApi.Plugins.toggle(item.id);
    } catch (e: any) {
        toast(strings.error + (e?.message ?? e), true);
    }
}

function openSettings(item: PluginItem) {
    if (item.src === "vencord") return (Vencord.Components as any).openPluginModal(item.raw);

    const { React } = Vencord.Webpack.Common;
    const instance = BdApi.Plugins.get(item.id)?.instance;
    let panel: any;
    try {
        panel = instance.getSettingsPanel();
    } catch (e: any) {
        return toast(strings.error + (e?.message ?? e), true);
    }

    let content = panel;
    if (panel instanceof Node) {
        content = React.createElement("div", {
            ref: (el: HTMLElement | null) => {
                if (el && !el.contains(panel)) el.appendChild(panel);
            }
        });
    } else if (typeof panel === "function") content = React.createElement(panel);

    BdApi.UI.showConfirmationModal(`${item.name} — ${strings.settingsOf}`, content, {
        confirmText: strings.close,
        cancelText: null
    });
}

// ---- UI --------------------------------------------------------------------------------------------------------

function makePage() {
    const { React } = Vencord.Webpack.Common;
    const h = React.createElement;
    const state: PageState = { restart: false, filter: "all", query: "" };

    const FILTERS: [Filter, string][] = [
        ["all", strings.filterAll],
        ["vencord", strings.filterVencord],
        ["bd", strings.filterBd],
        ["on", strings.filterOn],
        ["off", strings.filterOff]
    ];

    function Card({ item, rerender }: { item: PluginItem; rerender(): void }) {
        const toggle = () => {
            if (item.src === "vencord") toggleVencord(item, state);
            else toggleBd(item);
            rerender();
        };

        return h(
            "div",
            { className: "bdvk-card", "data-on": item.enabled ? "1" : "0" },
            h(
                "div",
                { className: "bdvk-head" },
                h("span", { className: "bdvk-name", title: item.name }, item.name),
                h(
                    "span",
                    { className: "bdvk-badge " + (item.src === "vencord" ? "bdvk-badge--vc" : "bdvk-badge--bd") },
                    item.src === "vencord" ? "VENCORD" : "BD"
                ),
                h("button", {
                    className: "bdvk-switch",
                    role: "switch",
                    "aria-checked": item.enabled ? "true" : "false",
                    disabled: item.required,
                    title: item.required ? strings.required : item.enabled ? strings.disable : strings.enable,
                    onClick: toggle
                })
            ),
            h("div", { className: "bdvk-desc", title: item.desc }, item.desc || strings.noDescription),
            h(
                "div",
                { className: "bdvk-foot" },
                h(
                    "span",
                    { className: "bdvk-author" },
                    [item.author && `${strings.by} ${item.author}`, item.version && `v${item.version}`].filter(Boolean).join(" · ")
                ),
                h(
                    "button",
                    { className: "bdvk-icon", disabled: !item.hasSettings, title: strings.settings, onClick: () => openSettings(item) },
                    "⚙"
                )
            )
        );
    }

    return function UnifiedPlugins() {
        const [, force] = React.useReducer((n: number) => n + 1, 0);
        const rerender = () => force();

        const items: PluginItem[] = [];
        for (const get of [vencordPlugins, bdPlugins]) {
            try {
                items.push(...get());
            } catch (e) {
                console.error(LOG, "failed to list plugins", get.name, e);
            }
        }
        items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        const counts: Record<Filter, number> = {
            all: items.length,
            vencord: items.filter(i => i.src === "vencord").length,
            bd: items.filter(i => i.src === "bd").length,
            on: items.filter(i => i.enabled).length,
            off: items.filter(i => !i.enabled).length
        };

        const query = state.query.trim().toLowerCase();
        const matchesFilter = (i: PluginItem) =>
            state.filter === "all" ||
            state.filter === i.src ||
            (state.filter === "on" && i.enabled) ||
            (state.filter === "off" && !i.enabled);
        const shown = items.filter(
            i =>
                matchesFilter(i) &&
                (!query ||
                    i.name.toLowerCase().includes(query) ||
                    i.desc.toLowerCase().includes(query) ||
                    i.author.toLowerCase().includes(query))
        );

        return h(
            "div",
            { className: "bdvk-wrap" },
            state.restart &&
                h(
                    "div",
                    { className: "bdvk-notice" },
                    h("span", null, strings.restartNotice),
                    h(
                        "button",
                        { className: "bdvk-btn bdvk-btn--brand", onClick: () => VesktopNative.app.relaunch() },
                        strings.restart
                    )
                ),
            h(
                "div",
                { className: "bdvk-bar" },
                h("input", {
                    className: "bdvk-search",
                    type: "text",
                    placeholder: strings.search,
                    defaultValue: state.query,
                    onChange: (e: any) => {
                        state.query = e.target.value;
                        rerender();
                    }
                }),
                h(
                    "div",
                    { className: "bdvk-actions" },
                    h(
                        "button",
                        {
                            className: "bdvk-btn",
                            onClick: () =>
                                (Vencord.Webpack.Common as any).SettingsRouter.openUserSettings("betterdiscord_plugins_panel")
                        },
                        strings.bdStore
                    )
                )
            ),
            h(
                "div",
                { className: "bdvk-pills" },
                FILTERS.map(([key, label]) =>
                    h(
                        "button",
                        {
                            key,
                            className: "bdvk-pill",
                            "data-on": state.filter === key ? "1" : "0",
                            onClick: () => {
                                state.filter = key;
                                rerender();
                            }
                        },
                        label,
                        h("span", { className: "bdvk-count" }, counts[key])
                    )
                )
            ),
            shown.length
                ? h("div", { className: "bdvk-grid" }, shown.map(item => h(Card, { key: item.key, item, rerender })))
                : h("div", { className: "bdvk-empty" }, strings.empty)
        );
    };
}

// ---- settings layout merge -------------------------------------------------------------------------------------

function prefixTitle(item: any, prefix: string) {
    const original = item.useTitle;
    if (typeof original === "function") item.useTitle = () => `${prefix}${original()}`;
    return item;
}

export function installUnifiedSettings() {
    const settingsPlugin: any = Vencord.Plugins.plugins.Settings;
    if (settingsPlugin.__bdvkMerged) return;
    settingsPlugin.__bdvkMerged = true;

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = UNIFIED_CSS;
        document.head.appendChild(style);
    }

    const UnifiedPlugins = makePage();
    const Boundary: any = (Vencord.Components as any).ErrorBoundary;
    const Page = Boundary?.wrap ? Boundary.wrap(UnifiedPlugins, { noop: true }) : UnifiedPlugins;
    const originalBuild = settingsPlugin.buildLayout;

    function merge(this: any, layout: any[]) {
        const vcIdx = layout.findIndex(s => s?.key === "vencord_section");
        if (vcIdx < 0) return layout;

        const vencord = layout[vcIdx];
        if (vencord.__bdvk) return layout;

        const bdIdx = layout.findIndex(s => typeof s?.key === "string" && /^betterdiscord_.*_section$/.test(s.key));
        const bdBuild = bdIdx >= 0 ? layout[bdIdx].buildLayout : null;
        const vencordBuild = vencord.buildLayout;
        const self = this;

        vencord.__bdvk = true;
        vencord.useTitle = () => TITLE;
        vencord.buildLayout = () => {
            const own: any[] = vencordBuild();
            const originalPlugins = own.find(i => i?.key === "vencord_plugins");
            const merged = own.filter(i => i?.key !== "vencord_plugins");

            const unified = self.buildEntry({ key: "bdvk_plugins", title: "Plugins", panelTitle: "Plugins", Component: Page, Icon: null });
            if (originalPlugins?.icon) unified.icon = originalPlugins.icon;
            merged.splice(merged.findIndex(i => i?.key === "vencord_main") + 1, 0, unified);

            for (const item of merged) if (item?.key === "vencord_themes") prefixTitle(item, strings.vencordPrefix);

            if (bdBuild) {
                for (const item of bdBuild() as any[]) {
                    if (!item) continue;
                    prefixTitle(item, strings.bdPrefix);
                    if (/plugins/i.test(String(item.key))) {
                        const title = item.useTitle;
                        item.useTitle = () => title().replace(/Плагины|Plugins/i, strings.bdStoreItem);
                    }
                    merged.push(item);
                }
            }
            return merged;
        };

        if (bdIdx >= 0) layout.splice(bdIdx, 1);
        return layout;
    }

    settingsPlugin.buildLayout = function (this: any, root: any) {
        const layout = originalBuild.call(this, root);
        try {
            return merge.call(this, layout);
        } catch (e) {
            console.error(LOG, "failed to merge the settings sections", e);
            return layout;
        }
    };
}
