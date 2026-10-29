/* Native descriptions stay readable by pointer, touch and keyboard in the lobby. */
define(["jquery", "tooltip-layout", "tooltip-policy", "tooltip-source", "tooltip-content"], function ($, layout, policy, sources, content) {
    return function create(api) {
        var active = null, dismissed = null, hideTimer, listenersBound = false;
        var openTimer = null, pending = null;
        var anchor = sources.track(hide);
        function cancelOpen() { clearTimeout(openTimer); openTimer = pending = null; if (!active) anchor.clear(); }
        function queueShow(target) {
            if (api.in_game() || !sources.visible(target)) { hide(); return; }
            if (active === target) { cancelHide(); return; }
            if (pending === target || dismissed === target) return;
            hide(); pending = target;
            anchor.set(target);
            openTimer = setTimeout(function () {
                openTimer = pending = null;
                if (sources.visible(target)) show(target, true);
            }, policy.hover_ms);
        }
        function cancelHide() { clearTimeout(hideTimer); }
        function unlink() {
            if (!active) return;
            var ids = (active.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) { return id && id !== "lobby_rich_tooltip"; });
            if (ids.length) active.setAttribute("aria-describedby", ids.join(" "));
            else active.removeAttribute("aria-describedby");
        }
        function hide() {
            anchor.clear();
            cancelOpen(); cancelHide(); unlink(); active = null;
            $("#lobby_rich_tooltip").attr("aria-hidden", "true").hide().removeClass("is-readable").appendTo(document.body);
        }
        function containsTip(node) { return node && $("#lobby_rich_tooltip")[0] && $("#lobby_rich_tooltip")[0].contains(node); }
        function queueHide() {
            cancelOpen();
            cancelHide(); hideTimer = setTimeout(function () {
                if (document.activeElement !== active && !containsTip(document.activeElement)) hide();
            }, policy.travel_ms);
        }
        function position(target) {
            var $tip = $("#lobby_rich_tooltip");
            if (!$tip.length || !sources.visible(target)) { hide(); return; }
            var rect = target.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) { hide(); return; }
            var panel = target.closest(".party-slot-box, .character-guide-card, .starting-sheet-entry");
            var avoid = Array.from(document.querySelectorAll(".lobby-nav, .party-staging-controls, .character-guide-tabs, dialog[open] > header"))
                .map(function (node) { return node.getBoundingClientRect(); });
            layout.place($tip[0], rect, { edge: panel && panel.getBoundingClientRect(), avoid: avoid });
        }
        function show(target, fromPointer) {
            cancelOpen();
            if (api.in_game() || !sources.visible(target)) { hide(); return; }
            if (fromPointer && dismissed === target) return;
            dismissed = null;
            var $target = $(target), title = $target.attr("data-tip-title"), $tip = $("#lobby_rich_tooltip");
            if (!title || !$tip.length) return;
            cancelHide();
            if (active === target && $tip.attr("aria-hidden") === "false") { position(target); return; }
            unlink(); active = target;
            anchor.set(target);
            var host = target.closest("dialog[open]") || document.body;
            if ($tip[0].parentElement !== host) host.appendChild($tip[0]);
            var ids = ($target.attr("aria-describedby") || "").split(/\s+/).filter(Boolean); ids.push("lobby_rich_tooltip");
            $target.attr("aria-describedby", ids.join(" "));
            var readable = target.hasAttribute("data-native-tooltip");
            $tip.empty().attr("role", "tooltip").toggleClass("is-readable", true);
            var $header = $("<div class='dcss-tip-header'></div>");
            var $title = $("<div class='lobby-tip-title'></div>");
            content.renderTitle($title[0], title); $header.append($title);
            var badge = $target.attr("data-tip-badge");
            if (badge) $header.append($("<span class='dcss-tip-badge'></span>").text(badge));
            $tip.append($header);
            var body = $target.attr("data-tip-body"), meta = $target.attr("data-tip-meta");
            if (body || meta) {
                var $body = $("<div class='lobby-tip-body'></div>");
                meta = content.render($body[0], body, meta); $tip.append($body);
            }
            if (meta) {
                var $meta = $("<div class='lobby-tip-meta'></div>");
                content.renderMeta($meta[0], meta); $tip.append($meta);
            }
            if (readable) $tip.append($("<div class='lobby-tip-reading-hint'></div>").text("Scroll to read · ↑ / ↓ or PgUp / PgDn while focused · Esc to close"));
            $tip.attr("aria-hidden", "false").show(); $tip[0].scrollTop = 0; position(target);
        }
        function init() {
            sources.observe(document.body);
            hide();
            $(document).off(".lobbytip"); $(window).off(".lobbytip"); $("#lobby_rich_tooltip").off(".lobbytip");
            $(document).on("game_layer_changed.lobbytip game_cleanup.lobbytip", hide);
            $(document).on("mouseover.lobbytip focusin.lobbytip", "[data-tip-title], [title]", function (event) {
                var target = sources.upgrade(event.target);
                if (event.type === "mouseover") queueShow(target); else show(target);
            });
            $(document).on("mouseout.lobbytip", "[data-tip-title]", function (event) {
                if (this.contains(event.relatedTarget)) return;
                if (dismissed === this && !this.contains(event.relatedTarget)) dismissed = null;
                if (containsTip(event.relatedTarget)) { cancelHide(); return; }
                var next = event.relatedTarget && $(event.relatedTarget).closest("[data-tip-title]")[0];
                if (next) queueShow(next); else queueHide();
            });
            $(document).on("focusout.lobbytip", "[data-tip-title]", function (event) { if (active === this && !containsTip(event.relatedTarget)) hide(); });
            $(document).on("click.lobbytip", "[data-native-tooltip]", function (event) {
                var target = $(event.target).closest("[data-tip-title]")[0];
                if (target) { target.focus({ preventScroll: true }); show(target); }
            });
            $("#lobby_rich_tooltip").on("mouseenter.lobbytip", cancelHide).on("mouseleave.lobbytip", queueHide)
                .on("tooltip-content-resize.lobbytip", function () { if (active) position(active); });
            if (!listenersBound) {
                listenersBound = true;
                document.addEventListener("keydown", function (event) {
                    if (!active) { if (event.key === "Escape") cancelOpen(); return; }
                    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); dismissed = active; hide(); return; }
                    if (!active.hasAttribute("data-native-tooltip") || document.activeElement !== active) return;
                    var amounts = { ArrowDown: 40, ArrowUp: -40, PageDown: 240, PageUp: -240 };
                    if (amounts[event.key] === undefined) return;
                    var tip = document.getElementById("lobby_rich_tooltip"), body = tip.querySelector(".lobby-tip-body");
                    var scroll = body && body.scrollHeight > body.clientHeight ? body : tip;
                    if (scroll.scrollHeight > scroll.clientHeight) { event.preventDefault(); scroll.scrollTop += amounts[event.key]; }
                }, true);
                document.addEventListener("pointerdown", function (event) { cancelOpen(); if (active && !active.contains(event.target) && !containsTip(event.target)) hide(); }, true);
                document.addEventListener("lobby-tooltip-dismiss", hide);
                document.addEventListener("visibilitychange", function () { if (document.hidden) hide(); });
                document.addEventListener("close", hide, true);
                document.addEventListener("scroll", function (event) {
                    if (!active || containsTip(event.target)) return;
                    if (document.activeElement === active) position(active); else hide();
                }, true);
            }
            $(window).on("blur.lobbytip", hide).on("resize.lobbytip", function () { cancelOpen(); if (active) position(active); });
        }
        return { position_lobby_tooltip: position, show_lobby_tooltip: show, hide_lobby_tooltip: hide, init_lobby_tooltips: init };
    };
});
