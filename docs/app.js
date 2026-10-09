(function () {
    "use strict";

    var REPO = "kolyagames/better_vesktop";

    // ---------- text ----------
    var TEXT = {
        en: {
            "nav.plugins": "Plugins", "nav.security": "Security", "nav.install": "Install", "nav.releases": "Releases", "nav.faq": "FAQ",
            "hero.title": "Two clients. One window.",
            "hero.sub": "<strong>Better Vesktop</strong> runs Vencord and BetterDiscord together, sandboxed.",
            "hero.download": "Download for Windows", "hero.source": "View the source",
            "hero.note": "Portable, no installer. Windows 10 and 11, 64-bit.",
            "plugins.title": "One plugin list for both clients",
            "plugins.lead": "Vencord and BetterDiscord plugins sit side by side in one page, with one search and one set of filters. This is a small working copy of it: try the filters and the switches.",
            "plugins.note": "Sample data. In the app the list shows your own plugins, and the switches turn them on and off for real.",
            "demo.search": "Search plugins…", "demo.all": "All", "demo.vencord": "Vencord", "demo.bd": "BetterDiscord", "demo.on": "Enabled", "demo.off": "Disabled", "demo.empty": "Nothing found",
            "security.title": "Plugins can't reach your computer",
            "security.lead": "Stock BetterDiscord gives plugins full access to Node.js. Better Vesktop keeps Discord's window sandboxed, like Vesktop does, and gives BetterDiscord a small bridge instead.",
            "security.can": "Plugins can", "security.cannot": "Plugins can't",
            "security.can1": "read and write inside the BetterDiscord folder", "security.can2": "open files you pick yourself in a file dialog",
            "security.can3": "fetch websites and APIs on the internet", "security.can4": "open links in your browser",
            "security.no1": "touch any other file or folder", "security.no2": "reach localhost or devices on your network",
            "security.no3": "start programs or open executables", "security.no4": "post to Discord webhooks or send commands to the app",
            "security.fine": "A plugin is still code running inside your Discord page, so it can see and change what the page shows. Install plugins from the BetterDiscord store or from authors you trust. You can loosen the limits in <code>Data/settings.json</code> under <code>betterDiscord</code>.",
            "install.title": "Install in a minute", "install.lead": "There's nothing to install. Unpack the folder and run it.",
            "install.s1t": "Download", "install.s1": "Get the latest zip from the releases page.",
            "install.s2t": "Unpack and run", "install.s2": "Put the folder anywhere except Program Files and start <code>better-vesktop.exe</code>. If Windows SmartScreen warns you, choose More info, then Run anyway: the build isn't signed.",
            "install.s3t": "Log in", "install.s3": "Sign in to Discord as usual. Everything is stored next to the app, so deleting the folder removes it.",
            "releases.title": "Releases", "releases.lead": "Every version with its changelog.",
            "releases.update": "Update", "releases.latest": "Latest", "releases.pre": "Pre-release", "releases.sample": "Preview", "releases.github": "Open on GitHub", "releases.installer": "Installer", "releases.loading": "Loading releases from GitHub…", "releases.error": "Couldn't reach GitHub. Showing what we know.", "releases.synced": "Synced with GitHub at", "releases.none": "No releases published yet. This card is a preview.", "releases.sub": "<strong>Better Vesktop</strong> update, changelog below.", "releases.download": "Download", "releases.notes": "Changelog",
            "releases.first": "First release: BetterDiscord inside a sandboxed Vesktop, one settings section, one plugin list.",
            "faq.title": "Questions",
            "footer.team": "Owner: <a href=\"https://github.com/kolyagames\">kolyagames</a>. Developer: Claude (Anthropic).",
            "footer.unofficial": "Better Vesktop is an unofficial project. It isn't affiliated with Discord, Vencord, Vesktop or BetterDiscord.",
            "footer.license": "Licensed under GPL-3.0-or-later. Built on <a href=\"https://github.com/Vencord/Vesktop\">Vesktop</a>, <a href=\"https://github.com/Vendicated/Vencord\">Vencord</a> and <a href=\"https://github.com/BetterDiscord/BetterDiscord\">BetterDiscord</a>."
        },
        ru: {
            "nav.plugins": "Плагины", "nav.security": "Безопасность", "nav.install": "Установка", "nav.releases": "Релизы", "nav.faq": "Вопросы",
            "hero.title": "Два клиента. Одно окно.",
            "hero.sub": "<strong>Better Vesktop</strong> запускает Vencord и BetterDiscord вместе, в песочнице.",
            "hero.download": "Скачать для Windows", "hero.source": "Исходный код",
            "hero.note": "Портативная версия без установщика. Windows 10 и 11, 64-бит.",
            "plugins.title": "Один список плагинов для обоих клиентов",
            "plugins.lead": "Плагины Vencord и BetterDiscord лежат рядом на одной странице: общий поиск и общие фильтры. Ниже её маленькая рабочая копия, попробуй фильтры и переключатели.",
            "plugins.note": "Тестовые данные. В приложении здесь твои плагины, а переключатели включают и выключают их по-настоящему.",
            "demo.search": "Поиск по плагинам…", "demo.all": "Все", "demo.vencord": "Vencord", "demo.bd": "BetterDiscord", "demo.on": "Включённые", "demo.off": "Выключенные", "demo.empty": "Ничего не найдено",
            "security.title": "Плагины не достают до твоего компьютера",
            "security.lead": "Обычный BetterDiscord даёт плагинам полный доступ к Node.js. Better Vesktop оставляет окно Discord в песочнице, как это делает Vesktop, а BetterDiscord получает небольшой мост с ограничениями.",
            "security.can": "Плагины могут", "security.cannot": "Плагины не могут",
            "security.can1": "читать и писать внутри папки BetterDiscord", "security.can2": "открывать файлы, которые ты выбрал сам в диалоге",
            "security.can3": "загружать сайты и API из интернета", "security.can4": "открывать ссылки в браузере",
            "security.no1": "трогать любые другие файлы и папки", "security.no2": "обращаться к localhost и устройствам в твоей сети",
            "security.no3": "запускать программы и открывать исполняемые файлы", "security.no4": "писать в вебхуки Discord и слать команды приложению",
            "security.fine": "Плагин всё равно остаётся кодом внутри страницы Discord, поэтому видит и может менять то, что показывает страница. Ставь плагины из каталога BetterDiscord или от авторов, которым доверяешь. Ограничения можно ослабить в <code>Data/settings.json</code>, раздел <code>betterDiscord</code>.",
            "install.title": "Установка за минуту", "install.lead": "Ничего устанавливать не нужно. Распакуй папку и запусти.",
            "install.s1t": "Скачай", "install.s1": "Возьми последний zip на странице релизов.",
            "install.s2t": "Распакуй и запусти", "install.s2": "Положи папку куда угодно, кроме Program Files, и запусти <code>better-vesktop.exe</code>. Если SmartScreen предупредит, выбери «Подробнее», затем «Выполнить в любом случае»: сборка не подписана.",
            "install.s3t": "Войди", "install.s3": "Войди в Discord как обычно. Всё хранится рядом с приложением, поэтому удаление папки убирает всё.",
            "releases.title": "Релизы", "releases.lead": "Все версии со списком изменений.",
            "releases.update": "Обновление", "releases.latest": "Последняя", "releases.pre": "Пре-релиз", "releases.sample": "Предпросмотр", "releases.github": "Открыть на GitHub", "releases.installer": "Установщик", "releases.loading": "Загружаю релизы с GitHub…", "releases.error": "GitHub недоступен. Показываю то, что известно.", "releases.synced": "Синхронизировано с GitHub в", "releases.none": "Релизов пока нет. Эта карточка для примера.", "releases.sub": "Обновление <strong>Better Vesktop</strong>, список изменений ниже.", "releases.download": "Скачать", "releases.notes": "Список изменений",
            "releases.first": "Первый релиз: BetterDiscord внутри Vesktop в песочнице, один раздел настроек, один список плагинов.",
            "faq.title": "Вопросы",
            "footer.team": "Владелец: <a href=\"https://github.com/kolyagames\">kolyagames</a>. Разработчик: Claude (Anthropic).",
            "footer.unofficial": "Better Vesktop неофициальный проект и не связан с Discord, Vencord, Vesktop и BetterDiscord.",
            "footer.license": "Лицензия GPL-3.0-or-later. Основан на <a href=\"https://github.com/Vencord/Vesktop\">Vesktop</a>, <a href=\"https://github.com/Vendicated/Vencord\">Vencord</a> и <a href=\"https://github.com/BetterDiscord/BetterDiscord\">BetterDiscord</a>."
        }
    };

    var FAQ = {
        en: [
            ["Can I get banned?", "Discord's rules forbid client mods, and that includes Vencord and BetterDiscord. In practice, bans for themes and cosmetic plugins aren't known; the risk comes from plugins that automate actions or send requests for you. Better Vesktop changes nothing about what Discord's servers see."],
            ["Will my BetterDiscord plugins work?", "Most do. Plugins that need the desktop Discord's own native features (DiscordNative) can't work in Vesktop, and plugins that read files outside the BetterDiscord folder are blocked by the sandbox. You can allow extra folders in the settings."],
            ["Do I need to install Vencord or BetterDiscord separately?", "No. Both are built in. If you already use BetterDiscord, your plugins and themes can be copied into the BetterDiscord folder next to the app."],
            ["How do I update?", "The app checks the releases of this repository. You can also download a newer zip and replace the program files; your Data and BetterDiscord folders stay as they are."],
            ["Where is my data?", "In the Data and BetterDiscord folders next to better-vesktop.exe. Delete the folder and nothing is left on the computer."],
            ["Is it safe to give the zip to a friend?", "Yes, as long as you don't include your Data folder: it holds your Discord login. Share only the downloaded release."]
        ],
        ru: [
            ["Могут ли забанить?", "Правила Discord запрещают моды клиента, в том числе Vencord и BetterDiscord. На практике баны за темы и косметические плагины неизвестны, риск дают плагины, которые автоматизируют действия или отправляют запросы за тебя. Better Vesktop ничего не меняет в том, что видят серверы Discord."],
            ["Будут ли работать мои плагины BetterDiscord?", "Большинство будет. Плагины, которым нужны родные функции десктопного Discord (DiscordNative), в Vesktop работать не могут, а плагины, читающие файлы вне папки BetterDiscord, блокирует песочница. Дополнительные папки можно разрешить в настройках."],
            ["Нужно ли отдельно ставить Vencord или BetterDiscord?", "Нет. Оба встроены. Если ты уже пользуешься BetterDiscord, плагины и темы можно скопировать в папку BetterDiscord рядом с приложением."],
            ["Как обновляться?", "Приложение проверяет релизы этого репозитория. Можно и вручную скачать новый zip и заменить файлы программы, а папки Data и BetterDiscord останутся нетронутыми."],
            ["Где мои данные?", "В папках Data и BetterDiscord рядом с better-vesktop.exe. Удали папку, и на компьютере ничего не останется."],
            ["Можно ли передать zip другу?", "Да, если не класть в него свою папку Data: в ней твой вход в Discord. Передавай только скачанный релиз."]
        ]
    };

    var lang = (navigator.language || "en").toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
    try {
        var saved = localStorage.getItem("bv-lang");
        if (saved === "ru" || saved === "en") lang = saved;
    } catch (e) { /* storage may be blocked */ }

    function t(key) { return TEXT[lang][key] || TEXT.en[key] || key; }

    function applyText() {
        document.documentElement.lang = lang;
        document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
        document.querySelectorAll("[data-i18n-html]").forEach(function (el) { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
        document.getElementById("lang").textContent = lang === "ru" ? "EN" : "RU";
        splitTitle();
        renderFaq();
        renderDemo();
        renderReleases();
        revealAll();
    }

    // each word of the hero title arrives on its own
    function splitTitle() {
        var el = document.getElementById("hero-title");
        var text = el.getAttribute("aria-label") || el.textContent;
        el.setAttribute("aria-label", text);
        el.innerHTML = text.split(" ").map(function (w, i) {
            return '<span class="w" aria-hidden="true" style="--i:' + i + '">' + w + "</span>";
        }).join(" ");
    }

    document.getElementById("lang").addEventListener("click", function () {
        lang = lang === "ru" ? "en" : "ru";
        try { localStorage.setItem("bv-lang", lang); } catch (e) { /* storage may be blocked */ }
        applyText();
    });

    // ---------- faq ----------
    function renderFaq() {
        document.getElementById("faq-list").innerHTML = FAQ[lang].map(function (qa) {
            return "<details><summary>" + qa[0] + "</summary><p>" + qa[1] + "</p></details>";
        }).join("");
    }

    // ---------- plugin demo ----------
    var PLUGINS = [
        ["CustomRPC", "vc", "Add a fully customisable Rich Presence (Game status) to your Discord profile", 1],
        ["Decor", "vc", "Create and use your own custom avatar decorations, or pick your favorite from the presets.", 1],
        ["CrashHandler", "vc", "Utility plugin for handling and possibly recovering from crashes without a restart", 1],
        ["Dearrow", "vc", "Makes YouTube embed titles and thumbnails less sensationalist, powered by Dearrow", 0],
        ["GameActivityToggle", "bd", "Adds a quick-toggle Game Activity button", 1],
        ["SpotifyEnhance", "bd", "All in one better spotify-discord experience.", 1],
        ["VoiceActivity", "bd", "Shows which users are talking in voice channels", 0],
        ["ServerDetails", "bd", "Shows extra details about the server on hover", 1]
    ];
    var demo = { filter: "all", query: "", state: PLUGINS.map(function (p) { return p[3]; }) };

    function renderDemo() {
        var root = document.getElementById("demo");
        var q = demo.query.trim().toLowerCase();
        var counts = {
            all: PLUGINS.length,
            vencord: PLUGINS.filter(function (p) { return p[1] === "vc"; }).length,
            bd: PLUGINS.filter(function (p) { return p[1] === "bd"; }).length,
            on: demo.state.filter(Boolean).length,
            off: demo.state.filter(function (s) { return !s; }).length
        };
        var pills = ["all", "vencord", "bd", "on", "off"].map(function (k) {
            return '<button class="bdvk-pill" type="button" data-f="' + k + '" aria-pressed="' + (demo.filter === k) + '">' +
                t("demo." + k) + '<span class="bdvk-count">' + counts[k] + "</span></button>";
        }).join("");

        var shown = 0;
        var cards = PLUGINS.map(function (p, i) {
            var on = demo.state[i];
            var src = p[1] === "vc" ? "vencord" : "bd";
            var ok = (demo.filter === "all" || demo.filter === src || (demo.filter === "on" && on) || (demo.filter === "off" && !on)) &&
                (!q || (p[0] + " " + p[2]).toLowerCase().indexOf(q) !== -1);
            if (!ok) return "";
            return '<div class="bdvk-card" style="--i:' + (shown++) + '" data-on="' + (on ? 1 : 0) + '"><div class="bdvk-head"><span class="bdvk-name">' + p[0] +
                '</span><span class="bdvk-badge bdvk-badge--' + p[1] + '">' + (p[1] === "vc" ? "VENCORD" : "BD") +
                '</span><button class="bdvk-switch" type="button" role="switch" aria-label="' + p[0] + '" aria-checked="' + (on ? "true" : "false") +
                '" data-i="' + i + '"></button></div><div class="bdvk-desc">' + p[2] + "</div></div>";
        }).join("");

        var hadFocus = document.activeElement && document.activeElement.classList.contains("bdvk-search");
        root.innerHTML = '<div class="bdvk-bar"><input class="bdvk-search" type="text" placeholder="' + t("demo.search") + '" value="' +
            demo.query.replace(/"/g, "&quot;") + '"></div><div class="bdvk-pills">' + pills + '</div><div class="bdvk-grid">' +
            (cards || '<div class="bdvk-empty">' + t("demo.empty") + "</div>") + "</div>";
        if (hadFocus) {
            var input = root.querySelector(".bdvk-search");
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }

    document.getElementById("demo").addEventListener("click", function (e) {
        var pill = e.target.closest(".bdvk-pill");
        var sw = e.target.closest(".bdvk-switch");
        if (pill) { demo.filter = pill.getAttribute("data-f"); renderDemo(); }
        if (sw) {
            var i = +sw.getAttribute("data-i");
            demo.state[i] = demo.state[i] ? 0 : 1;
            // update in place, so the switch slides instead of the whole list being rebuilt
            sw.setAttribute("aria-checked", demo.state[i] ? "true" : "false");
            sw.closest(".bdvk-card").setAttribute("data-on", demo.state[i] ? 1 : 0);
            var on = demo.state.filter(Boolean).length;
            document.querySelector('[data-f="on"] .bdvk-count').textContent = on;
            document.querySelector('[data-f="off"] .bdvk-count').textContent = PLUGINS.length - on;
            if (demo.filter === "on" || demo.filter === "off") setTimeout(renderDemo, 320);
        }
    });
    document.getElementById("demo").addEventListener("input", function (e) {
        if (e.target.classList.contains("bdvk-search")) { demo.query = e.target.value; renderDemo(); }
    });

    // ---------- releases ----------
    // Every release of the repository, straight from GitHub: loaded on start, again when the tab is shown after a while,
    // and every few minutes. The unauthenticated API allows 60 requests an hour, so this stays well below that.
    var releases = null;          // null = not loaded yet, [] = loaded but nothing published
    var releaseState = "loading"; // loading | ok | error
    var lastFetch = 0;
    var openTag = null;

    function safeUrl(u) { return /^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(u) ? u : "https://github.com/" + REPO + "/releases"; }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    // a small, safe markdown subset for release notes: headings, lists, bold, code, links
    function inline(text) {
        var out = esc(text);
        out = out.replace(/\x60([^\x60]+)\x60/g, "<code>$1</code>");
        out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        out = out.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, function (m, label, url) { return '<a href="' + safeUrl(url) + '">' + label + "</a>"; });
        out = out.replace(/(^|[\s(])(https:\/\/github\.com\/[^\s<)]+)/g, function (m, pre, url) {
            var pr = url.match(/\/(pull|issues)\/(\d+)$/);
            return pre + '<a href="' + safeUrl(url) + '">' + (pr ? "#" + pr[2] : url.replace("https://github.com/", "")) + "</a>";
        });
        out = out.replace(/(^|[\s(])@([\w-]{1,39})\b/g, '$1<a href="https://github.com/$2">@$2</a>');
        return out;
    }

    function markdown(src) {
        var html = "", list = false;
        String(src || "").split(/\r?\n/).forEach(function (raw) {
            var line = raw.trim();
            var item = line.match(/^[-*]\s+(.*)/);
            if (item) { if (!list) { html += "<ul>"; list = true; } html += "<li>" + inline(item[1]) + "</li>"; return; }
            if (list) { html += "</ul>"; list = false; }
            if (!line) return;
            var h = line.match(/^#{1,6}\s+(.*)/);
            html += h ? "<h4>" + inline(h[1]) + "</h4>" : "<p>" + inline(line) + "</p>";
        });
        return html + (list ? "</ul>" : "");
    }

    function fmtDate(iso) {
        try { return new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", { year: "numeric", month: "long", day: "numeric" }); }
        catch (e) { return iso.slice(0, 10); }
    }

    function releaseCard(r, index) {
        var version = r.tag.replace(/^v/, "");
        var id = "rel-" + version.replace(/[^\w]/g, "-");
        var open = openTag === null ? index === 0 : openTag === r.tag;
        var badges = (index === 0 && !r.prerelease && !r.sample ? '<span class="chip chip--new">' + t("releases.latest") + "</span>" : "") +
            (r.prerelease ? '<span class="chip">' + t("releases.pre") + "</span>" : "") +
            (r.sample ? '<span class="chip">' + t("releases.sample") + "</span>" : "");
        var body = r.body ? markdown(r.body) : "<p>" + t("releases.first") + "</p>";
        var assets = r.assets.map(function (a, i) {
            return '<a class="btn' + (i === 0 ? " btn--main" : "") + '" href="' + esc(safeUrl(a.url)) + '">' + t(a.kind === "exe" ? "releases.installer" : "releases.download") + "</a>";
        }).join("");

        return '<details class="release"' + (open ? " open" : "") + ' data-tag="' + esc(r.tag) + '" id="' + id + '">' +
            '<summary class="vcard vcard--release"><div class="vcard__ghost" data-ghost aria-hidden="true"></div>' +
            '<div class="vcard__body"><div class="vcard__brand"><img src="assets/logo.svg" alt="">Better Vesktop' + badges + "</div>" +
            '<h3 class="vcard__title">' + t("releases.update") + " " + esc(version) + "</h3>" +
            '<p class="vcard__sub">' + t("releases.sub") + "</p>" +
            '<span class="vcard__date">' + esc(fmtDate(r.date)) + '</span><span class="vcard__toggle" aria-hidden="true"></span></div></summary>' +
            '<div class="release__panel"><div class="notes">' + body + "</div>" +
            '<div class="release__actions">' + assets +
            '<a class="btn" href="' + esc(safeUrl(r.url)) + '">' + t("releases.github") + "</a></div></div></details>";
    }

    function renderReleases() {
        var root = document.getElementById("releases-list");
        var status = document.getElementById("releases-status");
        var list = releases && releases.length ? releases : null;

        if (releaseState === "loading" && !list) {
            root.innerHTML = '<div class="release-skel" aria-hidden="true"></div>';
            status.textContent = t("releases.loading");
            return;
        }

        // nothing published yet (or GitHub can't be reached): show the built-in card so the page is never empty
        if (!list) {
            list = [{ tag: "v1.6.7", body: "", date: "2026-10-09", prerelease: false, sample: true, url: "https://github.com/" + REPO + "/releases",
                assets: [{ kind: "zip", url: "https://github.com/" + REPO + "/releases/latest" }] }];
        }

        root.innerHTML = list.map(releaseCard).join("");
        if (window.__ghost) window.__ghost();
        document.querySelectorAll(".release > summary").forEach(attachLight);
        revealAll();

        status.textContent = releaseState === "error" ? t("releases.error") :
            (releases && releases.length ? t("releases.synced") + " " + new Date(lastFetch).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : t("releases.none"));
    }

    // remember what the visitor opened, so a refresh from GitHub doesn't close it
    document.getElementById("releases-list").addEventListener("toggle", function (e) {
        var el = e.target;
        if (!el.classList || !el.classList.contains("release")) return;
        if (el.open) openTag = el.getAttribute("data-tag");
        else if (openTag === el.getAttribute("data-tag") || openTag === null) openTag = "";
    }, true);

    function loadReleases() {
        lastFetch = Date.now();
        fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=30", { headers: { Accept: "application/vnd.github+json" } })
            .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
            .then(function (data) {
                releases = data.filter(function (r) { return !r.draft; }).map(function (r) {
                    var assets = (r.assets || []).filter(function (a) { return /\.(zip|exe)$/i.test(a.name); }).sort(function (a, b) { return /\.zip$/i.test(b.name) - /\.zip$/i.test(a.name); })
                        .map(function (a) { return { kind: /\.zip$/i.test(a.name) ? "zip" : "exe", url: a.browser_download_url }; });
                    return { tag: r.tag_name, body: r.body || "", date: r.published_at || r.created_at || "", prerelease: !!r.prerelease, url: r.html_url,
                        assets: assets.length ? assets : [{ kind: "zip", url: r.html_url }] };
                });
                releaseState = "ok";
                var latest = releases.filter(function (r) { return !r.prerelease; })[0];
                if (latest) document.getElementById("download").setAttribute("href", safeUrl(latest.assets[0].url));
                renderReleases();
            })
            .catch(function (err) {
                // 404: the repository or its first release doesn't exist yet. Anything else is a real failure, keep what we had.
                if (!releases) releases = [];
                releaseState = err && err.message === "404" ? "ok" : "error";
                renderReleases();
            });
    }

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden && Date.now() - lastFetch > 60000) loadReleases();
    });
    setInterval(function () { if (!document.hidden) loadReleases(); }, 5 * 60 * 1000);

    // ---------- motion ----------
    var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }) : null;

    function revealAll() {
        var groups = ["section.block h2", ".lead", ".demo", ".demo-note", ".rules", ".fine", ".steps li", ".install-actions", ".release", "details"];
        groups.forEach(function (selector) {
            document.querySelectorAll(selector).forEach(function (el, i) {
                if (el.hasAttribute("data-reveal")) return;
                el.setAttribute("data-reveal", "");
                el.style.setProperty("--d", Math.min(i, 5) * 0.08 + "s");
                if (observer) observer.observe(el); else el.classList.add("in");
            });
        });
    }

    // The light is a damped spring chasing the pointer. It never keeps up: at speed it stretches along the direction of
    // travel and thins across it, then relaxes back into a round glow once it catches up.
    // the system setting wins; ?motion=on exists only so the physics can be checked on a machine that asks for reduced motion
    var motionOk = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) || /[?&]motion=on/.test(location.search);

    function attachLight(host) {
        if (!motionOk || host.__light) return;
        var el = document.createElement("i");
        el.className = "light";
        el.setAttribute("aria-hidden", "true");
        host.appendChild(el);
        host.__light = el;

        var x = 0, y = 0, vx = 0, vy = 0, tx = 0, ty = 0, running = false, last = 0, stretch = 0, angle = 0;
        var STIFFNESS = 70, DAMPING = 11;   // lower stiffness = lazier; damping below critical keeps a hint of overshoot

        function frame(now) {
            var dt = Math.min((now - last) / 1000, 0.032);
            last = now;

            // semi-implicit Euler integration of a spring pulling towards the pointer
            vx += (tx - x) * STIFFNESS * dt - vx * DAMPING * dt;
            vy += (ty - y) * STIFFNESS * dt - vy * DAMPING * dt;
            x += vx * dt;
            y += vy * dt;

            var speed = Math.sqrt(vx * vx + vy * vy);
            var target = Math.min(speed / 1900, 0.6);
            stretch += (target - stretch) * Math.min(dt * 9, 1);      // the shape itself eases, so it never snaps
            if (speed > 30) {
                var a = Math.atan2(vy, vx);
                var d = a - angle;
                d = Math.atan2(Math.sin(d), Math.cos(d));              // shortest way round
                angle += d * Math.min(dt * 10, 1);
            }

            el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) rotate(" + angle.toFixed(3) + "rad) scale(" +
                (1 + stretch).toFixed(3) + "," + (1 - stretch * 0.42).toFixed(3) + ")";

            if (speed > 0.4 || Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4 || stretch > 0.004) requestAnimationFrame(frame);
            else running = false;
        }

        function kick() {
            if (running) return;
            running = true;
            last = performance.now();
            requestAnimationFrame(frame);
        }

        host.addEventListener("pointermove", function (e) {
            var r = host.getBoundingClientRect();
            tx = e.clientX - r.left;
            ty = e.clientY - r.top;
            if (!el.classList.contains("on")) { x = tx; y = ty; vx = vy = 0; el.classList.add("on"); }   // appears where the pointer entered
            kick();
        });
        host.addEventListener("pointerleave", function () { el.classList.remove("on"); });
    }

    var hero = document.querySelector(".hero");
    var ghost = document.querySelector(".hero .vcard__ghost");
    attachLight(hero);
    window.addEventListener("scroll", function () {
        if (window.scrollY < 1200) ghost.style.setProperty("--py", window.scrollY * -0.12 + "px");
    }, { passive: true });

    // ---------- smooth scroll with motion blur ----------
    // Mouse wheels move the page in steps, so we ease towards a target position instead, and blur the sections on screen
    // vertically by how fast they are moving. Trackpads and touch already scroll smoothly, so they are left alone, and so is
    // anyone who asked for reduced motion.
    (function () {
        var wants = motionOk && !(window.matchMedia && matchMedia("(pointer: coarse)").matches);
        if (!wants) return;

        var blurNode = document.getElementById("vblur-dev");
        var blockSelector = ".hero, section.block, footer";
        var current = window.scrollY, target = current, last = current, running = false, lastTime = 0, lastSet = current, boost = 1, lastNotch = 0;
        var blurred = [];

        function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
        function clamp(v) { return Math.max(0, Math.min(v, maxScroll())); }

        function setBlur(px) {
            blurNode.setAttribute("stdDeviation", "0 " + px.toFixed(2));
            var seen = [];
            if (px > 0.35) {
                document.querySelectorAll(blockSelector).forEach(function (el) {
                    var r = el.getBoundingClientRect();
                    if (r.bottom > -40 && r.top < window.innerHeight + 40) { el.classList.add("mb"); seen.push(el); }
                });
            }
            blurred.forEach(function (el) { if (seen.indexOf(el) === -1) el.classList.remove("mb"); });
            blurred = seen;
        }

        function frame(now) {
            var dt = Math.min((now - lastTime) / 1000, 0.05);
            lastTime = now;

            // frame-rate independent easing: covers ~90% of the distance in about 160ms
            current += (target - current) * (1 - Math.exp(-dt * 15));
            if (Math.abs(target - current) < 0.4) current = target;

            lastSet = current;
            window.scrollTo(0, current);

            var velocity = Math.abs(current - last) / Math.max(dt, 0.001); // px per second
            last = current;
            setBlur(Math.min(velocity / 260, 9));

            if (current !== target) requestAnimationFrame(frame);
            else { running = false; setBlur(0); document.documentElement.classList.remove("smooth"); }
        }

        function start() {
            if (running) return;
            running = true;
            last = current;
            lastTime = performance.now();
            document.documentElement.classList.add("smooth");
            requestAnimationFrame(frame);
        }

        // a notched mouse wheel reports whole numbers in big steps; trackpads report small fractional ones
        function isWheelNotch(e) { return e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 40 && Math.abs(e.deltaY) % 1 === 0); }

        function insideScrollable(node) {
            if (!(node instanceof Element)) return false;
            for (; node && node !== document.body; node = node.parentElement) {
                var s = getComputedStyle(node);
                if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight) return true;
            }
            return false;
        }

        window.addEventListener("wheel", function (e) {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.deltaX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // zoom and sideways scrolling
            if (!isWheelNotch(e) || insideScrollable(e.target)) return;
            e.preventDefault();
            var px = e.deltaMode === 1 ? e.deltaY * 34 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
            var now = performance.now();
            boost = now - lastNotch < 140 ? Math.min(boost + 0.3, 2.6) : 1;   // notches in quick succession accelerate
            lastNotch = now;
            px *= 1.6 * boost;
            if (!running) current = window.scrollY;
            target = clamp((running ? target : current) + px);
            start();
        }, { passive: false });

        // anything else that moves the page (keyboard, scrollbar, find, links) is adopted as the new position
        window.addEventListener("scroll", function () {
            // our own scrollTo reports back a moment later at the position we set; anything else moved the page
            if (Math.abs(window.scrollY - lastSet) < 2) return;
            current = target = last = lastSet = window.scrollY;
        }, { passive: true });

        // in-page links glide with the same motion
        document.addEventListener("click", function (e) {
            var a = e.target.closest && e.target.closest('a[href^="#"]');
            if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey) return;
            var el = document.querySelector(a.getAttribute("href"));
            if (!el) return;
            e.preventDefault();
            if (!running) current = window.scrollY;
            target = clamp(el.getBoundingClientRect().top + window.scrollY - 60);
            history.replaceState(null, "", a.getAttribute("href"));
            start();
        });
    })();

    applyText();
    loadReleases();
})();
