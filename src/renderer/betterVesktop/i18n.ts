/*
 * Better Vesktop, a Vesktop fork with BetterDiscord built in
 * Copyright (c) 2026 Better Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const en = {
    filterAll: "All",
    filterVencord: "Vencord",
    filterBd: "BetterDiscord",
    filterOn: "Enabled",
    filterOff: "Disabled",
    search: "Search plugins…",
    bdStore: "BetterDiscord store",
    empty: "Nothing found",
    noDescription: "No description",
    by: "by",
    settings: "Settings",
    required: "Required plugin",
    enable: "Enable",
    disable: "Disable",
    restartNotice: "Some Vencord plugin changes only apply after a restart.",
    restart: "Restart",
    depsFailed: "Could not enable dependencies: ",
    startFailed: "Could not start ",
    stopFailed: "Could not stop ",
    error: "Error: ",
    settingsOf: "settings",
    close: "Close",
    bdPrefix: "BD · ",
    vencordPrefix: "Vencord · ",
    bdStoreItem: "Plugin store"
};

const ru: typeof en = {
    filterAll: "Все",
    filterVencord: "Vencord",
    filterBd: "BetterDiscord",
    filterOn: "Включённые",
    filterOff: "Выключенные",
    search: "Поиск по плагинам…",
    bdStore: "Каталог BetterDiscord",
    empty: "Ничего не найдено",
    noDescription: "Без описания",
    by: "от",
    settings: "Настройки",
    required: "Обязательный плагин",
    enable: "Включить",
    disable: "Выключить",
    restartNotice: "Часть изменений Vencord-плагинов вступит в силу только после перезапуска.",
    restart: "Перезапустить",
    depsFailed: "Не удалось включить зависимости: ",
    startFailed: "Не удалось запустить ",
    stopFailed: "Не удалось остановить ",
    error: "Ошибка: ",
    settingsOf: "настройки",
    close: "Закрыть",
    bdPrefix: "BD · ",
    vencordPrefix: "Vencord · ",
    bdStoreItem: "Каталог плагинов"
};

export type Strings = typeof en;

export function getStrings(): Strings {
    return navigator.language?.toLowerCase().startsWith("ru") ? ru : en;
}
