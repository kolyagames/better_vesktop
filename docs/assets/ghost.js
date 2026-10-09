// Draws a CSS copy of the real "Plugins" page (same class names as the in-app page) for the blurred window on the version card.
(function () {
    var plugins = [
        ["CustomRPC", "vc", 1], ["GameActivityToggle", "bd", 1], ["Decor", "vc", 1], ["VoiceActivity", "bd", 0],
        ["CrashHandler", "vc", 1], ["ServerDetails", "bd", 1]
    ];
    function card(p) {
        return '<div class="g-card"><div class="g-head"><i class="g-name">' + p[0] + '</i><i class="g-badge ' + p[1] + '">' +
            (p[1] === "vc" ? "VENCORD" : "BD") + '</i><i class="g-sw' + (p[2] ? " on" : "") + '"></i></div><i class="g-l"></i><i class="g-l s"></i></div>';
    }
    var html = '<div class="g-win"><div class="g-side"><i></i><i></i><i class="a"></i><i></i><i></i><i></i><i class="a2"></i><i></i></div>' +
        '<div class="g-main"><div class="g-pills"><i class="on"></i><i></i><i></i><i></i></div><div class="g-grid">' + plugins.map(card).join("") + '</div></div></div>';
    function draw() { document.querySelectorAll("[data-ghost]").forEach(function (el) { if (!el.firstChild) el.innerHTML = html; }); }
    window.__ghost = draw;
    draw();
})();
