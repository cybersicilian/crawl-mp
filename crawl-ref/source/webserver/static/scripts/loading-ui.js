define(["game-loading", "hero-roles"], function (loadingState, heroRoles) {
    "use strict";

    var loader, center, text, card, detail, recovery, roster, rosterList, steps;
    var waitingTimer = null, preparing = false;
    var lastProblem = null;
    var initialText = "Preparing your expedition…";
    var initialDetail = "Preparing the dungeon view. This may take a moment.";
    // Readiness keys come from game-loading.js; labels are presentation only.
    var stepLabels = { assets: "Tiles & textures", player: "Hero sheets", map: "Dungeon floor" };
    // Role vocabulary (Frontline / Striker / Caster / Support / Scout) comes from
    // the shared hero-roles module; the offline fixture loads this file without it.

    function element(tag, className, content) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (content) node.textContent = content;
        return node;
    }

    function roleFor(job) {
        if (!job || !heroRoles || typeof heroRoles.roleForBackground !== "function") return null;
        var role = heroRoles.roleForBackground(job);
        return role && role.key !== "unknown" ? role : null;
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

    // Hero names/builds already present in the lobby DOM (party staging) feed
    // the roster. Nothing is requested from the server for this.
    function partyFromDOM() {
        var heroes = [];
        var boxes = document.querySelectorAll("#party_slots_grid .party-slot-box");
        Array.prototype.forEach.call(boxes, function (box) {
            if (box.classList.contains("slot-state-closed")) return;
            var name = box.querySelector(".party-slot-name"), species = box.querySelector(".party-slot-species"),
                job = box.querySelector(".party-slot-job");
            var hero = { name: (name && name.value || "").trim(), species: species ? species.value : "",
                job: job ? job.value : "", slot: box.getAttribute("data-slot") };
            if (!hero.name && !hero.job) return;
            hero.role = roleFor(hero.job);
            heroes.push(hero);
        });
        return heroes;
    }

    function renderRoster() {
        var heroes = partyFromDOM();
        roster.hidden = !heroes.length;
        if (!heroes.length) { rosterList.replaceChildren(); return; }
        rosterList.replaceChildren();
        heroes.forEach(function (hero, index) {
            var row = element("li", "loading-hero");
            var token = element("span", "loading-hero-token", (hero.name || "?").charAt(0).toUpperCase());
            token.setAttribute("aria-hidden", "true");
            var copy = element("span", "loading-hero-copy");
            copy.appendChild(element("span", "loading-hero-name", hero.name || "Hero " + (index + 1)));
            var build = [hero.species, hero.job].filter(Boolean).join(" ");
            if (build) copy.appendChild(element("span", "loading-hero-build", build));
            row.append(token, copy);
            if (hero.role) {
                var badge = element("span", "loading-hero-role", hero.role.label);
                if (heroRoles.badgeClasses) badge.className += " " + heroRoles.badgeClasses(hero.role.key);
                badge.setAttribute("data-role", hero.role.key);
                row.appendChild(badge);
            }
            rosterList.appendChild(row);
        });
    }

    function renderSteps(problem) {
        var progress = loadingState.progress();
        var activeMarked = false;
        Array.prototype.forEach.call(steps.children, function (item) {
            var key = item.getAttribute("data-step");
            var done = progress.ready.indexOf(key) !== -1;
            var state = done ? "done" : problem ? "halted" : activeMarked ? "pending" : "active";
            if (!done && !problem) activeMarked = true;
            if (item.getAttribute("data-state") !== state) item.setAttribute("data-state", state);
            var label = item.querySelector(".loading-step-state");
            var word = state === "done" ? "ready" : state === "active" ? "loading" : state === "halted" ? "halted" : "waiting";
            if (label.textContent !== word) label.textContent = word;
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
        renderSteps(problem);
        if (!preparing) renderRoster();
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

    function buildCard() {
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

        roster = element("section", "loading-party");
        roster.setAttribute("aria-labelledby", "loading_party_title");
        roster.hidden = true;
        var rosterTitle = element("h2", "loading-party-title", "Your party");
        rosterTitle.id = "loading_party_title";
        rosterList = element("ol", "loading-party-list");
        roster.append(rosterTitle, rosterList);

        steps = element("ol", "loading-steps");
        steps.setAttribute("aria-label", "Loading progress");
        Object.keys(stepLabels).forEach(function (key) {
            var item = element("li", "loading-step");
            item.setAttribute("data-step", key);
            item.setAttribute("data-state", "pending");
            var mark = element("span", "loading-step-mark");
            mark.setAttribute("aria-hidden", "true");
            item.append(mark, element("span", "loading-step-label", stepLabels[key]),
                element("span", "loading-step-state", "waiting"));
            steps.appendChild(item);
        });

        copy.append(element("p", "loading-folio-kicker", "EXPEDITION LOADING"),
            title, ornament, text, detail, roster, steps);
        card.append(art, copy);
        center.insertBefore(card, center.firstChild);
    }

    function init() {
        loader = document.getElementById("loader");
        center = document.getElementById("loader_center");
        text = document.getElementById("loader_text");
        if (!loader || !center || !text || document.getElementById("loading_folio")) return;
        loader.classList.add("sourcebook-loading");
        buildCard();

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
    return { init: init, recoveryURL: recoveryURL, roleFor: roleFor };
});
