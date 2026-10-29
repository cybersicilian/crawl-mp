define(["game-loading"], function (loadingState) {
    "use strict";

    var loader, center, text, card, detail, recovery;
    var waitingTimer = null, preparing = false;
    var lastProblem = null;
    var initialText = "Preparing your expedition…";
    var initialDetail = "Preparing the dungeon view. This may take a moment.";

    function element(tag, className, content) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (content) node.textContent = content;
        return node;
    }

    function recoveryURL() {
        var url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        return url.href;
    }

    function displayed(node) {
        return !!node && !node.hidden && getComputedStyle(node).display !== "none"
            && getComputedStyle(node).visibility !== "hidden";
    }

    function nativePromptVisible() {
        return ["prompt", "stale_processes_message", "force_terminate"].some(function (id) {
            return displayed(document.getElementById(id));
        });
    }

    function resetWaiting() {
        window.clearTimeout(waitingTimer);
        waitingTimer = null;
        preparing = false;
        lastProblem = null;
        text.textContent = initialText;
        detail.textContent = initialDetail;
        card.classList.remove("is-waiting");
    }

    function update() {
        var blocking = loadingState.blocking();
        if (loader.classList.contains("is-game-loading") !== blocking)
            loader.classList.toggle("is-game-loading", blocking);
        var game = document.getElementById("game");
        if (game) {
            game.inert = blocking;
            game.setAttribute("aria-busy", String(blocking));
        }
        var promptVisible = nativePromptVisible();
        var loading = loader.getClientRects().length > 0 && displayed(center)
            && displayed(text) && !promptVisible;
        card.hidden = !loading;
        recovery.hidden = promptVisible;
        recovery.href = recoveryURL();
        if (!loading) {
            if (preparing || waitingTimer !== null) resetWaiting();
            return;
        }
        var problem = loadingState.problem();
        if (!problem && lastProblem) resetWaiting();
        if (problem) {
            lastProblem = problem;
            window.clearTimeout(waitingTimer);
            waitingTimer = null;
            text.textContent = "The dungeon view is unavailable.";
            detail.textContent = problem;
            card.classList.add("is-waiting");
            preparing = true;
            return;
        }
        if (preparing) return;
        preparing = true;
        waitingTimer = window.setTimeout(function () {
            waitingTimer = null;
            if (!preparing) return;
            text.textContent = "Still preparing your expedition.";
            detail.textContent = "You can keep waiting, or return to the party hall.";
            card.classList.add("is-waiting");
        }, 12000);
    }

    function observe() {
        var observer = new MutationObserver(function (records) {
            // A hide/show in the same message batch still starts a new wait.
            if (preparing && records.some(function (record) {
                return record.target === loader && record.attributeName === "style"
                    && /display\s*:\s*none/.test(record.oldValue || "");
            })) resetWaiting();
            update();
        });
        [loader, center, text, document.getElementById("prompt"),
            document.getElementById("stale_processes_message"),
            document.getElementById("force_terminate")].forEach(function (node) {
            if (node) observer.observe(node, { attributes: true, attributeOldValue: true,
                attributeFilter: ["style", "hidden", "class"] });
        });
        window.addEventListener("resize", update);
        window.addEventListener("hashchange", update);
        window.addEventListener("popstate", update);
        update();
    }

    function init() {
        loader = document.getElementById("loader");
        center = document.getElementById("loader_center");
        text = document.getElementById("loader_text");
        if (!loader || !center || !text || document.getElementById("loading_folio")) return;
        loader.classList.add("sourcebook-loading");
        card = element("section", "loading-folio");
        card.id = "loading_folio";
        card.setAttribute("aria-labelledby", "loading_folio_title");
        var art = element("div", "loading-folio-art");
        art.setAttribute("aria-hidden", "true");
        var copy = element("div", "loading-folio-copy");
        var title = element("h1", "loading-folio-title", "A new chapter awaits");
        title.id = "loading_folio_title";
        var ornament = element("div", "loading-folio-rule");
        ornament.setAttribute("aria-hidden", "true");
        text.textContent = initialText;
        text.setAttribute("role", "status");
        text.setAttribute("aria-live", "polite");
        text.setAttribute("aria-atomic", "true");
        detail = element("p", "loading-folio-detail", initialDetail);
        copy.append(element("p", "loading-folio-kicker", "BEYOND THE THRESHOLD"),
            title, ornament, text, detail);
        card.append(art, copy);
        center.insertBefore(card, center.firstChild);

        recovery = element("a", "loading-return", "Return to party hall");
        recovery.id = "loading_return";
        recovery.href = recoveryURL();
        var arrow = element("span", "loading-return-arrow", "←");
        arrow.setAttribute("aria-hidden", "true");
        recovery.prepend(arrow);
        // A normal browser navigation can recover even when the native
        // client's message queue is inhibited. It never sends a game command.
        recovery.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            window.history.replaceState(null, "", recoveryURL());
            window.location.reload();
        });
        recovery.addEventListener("keydown", function (event) { event.stopPropagation(); });
        recovery.addEventListener("keypress", function (event) { event.stopPropagation(); });
        loader.appendChild(recovery);
        observe();
        loadingState.subscribe(update);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
    return { init: init, recoveryURL: recoveryURL };
});
