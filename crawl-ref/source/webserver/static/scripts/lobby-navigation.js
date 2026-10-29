define(["jquery", "workspace-views", "lobby-browser", "lobby-overview", "lobby-discovery"],
function ($, createViews, browser, overview, discovery) {
    "use strict";
    var views = [
        { id: "play", title: "Play", sections: ["lobby_home", "party_lobby_panel", "play_now"] },
        { id: "saved", title: "Saved expeditions", shortTitle: "Saved", sections: ["game_library_panel"] },
        { id: "friends", title: "Join friends", shortTitle: "Join", sections: ["lobby_friends_panel", "lobby_rooms_panel", "lobby_body"] },
        { id: "chronicle", title: "Chronicle", sections: ["coop_chronicle_panel"] }
    ];
    var root, nav, primary, controller, pending = false, hadRoom = false, leftLobby = false, returnedFromGame = false;
    var settingsSignature = null;
    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function authenticated() {
        return !!document.querySelector(".welcome-entry.signed-in");
    }
    function hasRoom() {
        var room = document.getElementById("party_room_view");
        return !!room && room.style.display !== "none";
    }
    function text(node, value) { if (node && node.textContent !== value) node.textContent = value; }
    function jump(id, keyboard) {
        returnedFromGame = false;
        var view = views.find(function (entry) { return entry.sections.indexOf(id) !== -1; });
        if (id === "play_now") root.classList.add("show-party-modes");
        if (view) controller.show(view.id, keyboard, id);
    }
    function createParty(keyboard) {
        root.classList.remove("show-party-modes");
        controller.show("play", false);
        if (!hasRoom()) {
            var create = document.getElementById("btn_create_party_room");
            if (create && !create.disabled) create.click();
        }
        jump("party_lobby_panel", keyboard);
    }
    function account() {
        var details = element("details", "lobby-account"); details.id = "lobby_account";
        var summary = element("summary", "", "Account"); details.appendChild(summary);
        var menu = element("div", "lobby-account-menu");
        var gameSettings = element("div", "lobby-account-settings"); gameSettings.id = "lobby_account_settings";
        menu.appendChild(gameSettings);
        var graphics = element("a", "", "Graphics & interface"); graphics.href = "/settings/graphics"; menu.appendChild(graphics);
        var profile = element("a", "", "Profile & textures"); profile.href = "/profile"; menu.appendChild(profile);
        ["chem_link", "chpw_link"].forEach(function (id) {
            var link = document.getElementById(id); if (link) menu.appendChild(link);
        });
        var logout = document.getElementById("logout_form");
        if (logout) menu.appendChild(logout);
        details.appendChild(menu); nav.appendChild(details);
        details.addEventListener("keydown", function (event) {
            if (event.key === "Escape") { details.open = false; summary.focus(); }
        });
        // A form submission must finish before its containing menu is closed.
        menu.addEventListener("click", function (event) {
            if (event.target.closest("a")) details.open = false;
        });
        document.addEventListener("click", function (event) {
            if (!details.contains(event.target)) details.open = false;
        });
    }
    function refreshGameSettings() {
        var container = document.getElementById("lobby_account_settings");
        var links = Array.from(document.querySelectorAll("#play_now .edit_rc_link"));
        var signature = links.map(function (link) { return link.getAttribute("data-game_id"); }).join("|");
        if (signature === settingsSignature) return;
        settingsSignature = signature; container.replaceChildren();
        links.forEach(function (link) {
            var id = link.getAttribute("data-game_id");
            var button = element("button", "lobby-account-settings-button", links.length === 1 ? "Game settings" : "Game settings · " + id);
            button.type = "button";
            button.addEventListener("click", function () {
                document.getElementById("lobby_account").open = false;
                var current = Array.from(document.querySelectorAll("#play_now .edit_rc_link")).find(function (candidate) {
                    return candidate.getAttribute("data-game_id") === id;
                });
                if (current) current.click();
            });
            container.appendChild(button);
        });
    }
    function update() {
        pending = false;
        var signedIn = authenticated(), room = hasRoom();
        nav.hidden = !signedIn; root.classList.toggle("has-chapter-index", signedIn);
        document.getElementById("lobby_home").hidden = !signedIn || room;
        root.classList.toggle("has-party-room", room);
        if (signedIn && root.style.display === "none") {
            leftLobby = true; returnedFromGame = false;
        } else if (signedIn && leftLobby) {
            leftLobby = false; returnedFromGame = true;
        }
        if (room !== hadRoom) {
            root.classList.remove("show-party-modes");
            if (!returnedFromGame) controller.show("play", false, room ? "party_lobby_panel" : "lobby_home");
        }
        hadRoom = room;
        if (signedIn && root.style.display !== "none" && returnedFromGame &&
            controller.current() === "play" && document.querySelector("#game_library_panel [data-library-load]"))
            controller.show("saved", false);
        text(primary, room ? "Your party" : "New expedition");
        primary.dataset.hasRoom = String(room);
        primary.setAttribute("aria-label", room ? "Return to your current party" : "Create a new party");
        primary.title = room ? "Return to your party" : "New expedition";
        primary.hidden = controller.current() === "play" && !root.classList.contains("show-party-modes");
        var create = document.getElementById("btn_create_party_room");
        primary.disabled = !room && (!create || create.disabled);
        var accountName = (document.getElementById("login_message").textContent || "").replace(/^Logged in as\s*/i, "").trim();
        text(document.querySelector("#lobby_account summary"), accountName || "Account");
        refreshGameSettings();
        var live = document.getElementById("lobby_body");
        if (signedIn && live.style.display === "none") live.style.display = "block";
        text(document.querySelector("#party_lobby_panel .party-hall-title"), "Set up your party");
        controller.refresh(); browser.refresh(); overview.refresh(); discovery.refresh(room);
        var savedCount = document.querySelectorAll("#game_library_panel .game-library-entry").length;
        var badge = nav.querySelector('[data-workspace-target="saved"] .lobby-nav-count');
        text(badge, String(savedCount)); badge.hidden = !savedCount;
        var nextHeight = Math.ceil(nav.getBoundingClientRect().height) + "px";
        if (root.style.getPropertyValue("--lobby-navigation-height") !== nextHeight)
            root.style.setProperty("--lobby-navigation-height", nextHeight);
    }
    function schedule() {
        if (pending) return;
        pending = true; window.requestAnimationFrame(update);
    }
    function init() {
        root = document.getElementById("lobby");
        if (!root || document.getElementById("lobby_navigation")) return;
        nav = element("nav", "lobby-workspace-nav"); nav.id = "lobby_navigation"; nav.hidden = true;
        nav.setAttribute("aria-label", "Main navigation");
        var skip = element("a", "lobby-skip", "Skip to content"); skip.href = "#lobby_home";
        skip.addEventListener("click", function (event) { event.preventDefault(); controller.show(controller.current(), true); });
        root.insertBefore(skip, root.firstChild);
        var brand = element("a", "lobby-book-brand"); brand.href = "#lobby"; brand.dataset.workspaceTarget = "play";
        var mark = element("span", "lobby-book-emblem"); mark.setAttribute("aria-hidden", "true"); brand.appendChild(mark);
        var title = element("span", "lobby-book-title");
        title.appendChild(element("span", "lobby-book-kicker", "Field guide & tavern"));
        title.appendChild(element("strong", "", "Pebble Broth")); brand.appendChild(title); nav.appendChild(brand);
        var links = element("div", "lobby-chapters");
        views.forEach(function (view) {
            var link = element("a", "lobby-chapter-link");
            link.setAttribute("aria-label", view.title);
            link.append(element("span", "outgame-label-full", view.title),
                element("span", "outgame-label-short", view.shortTitle || view.title));
            link.href = "/?view=" + view.id + "#lobby"; link.dataset.workspaceTarget = view.id;
            if (view.id === "saved") {
                var badge = element("span", "lobby-nav-count"); badge.hidden = true; link.appendChild(badge);
            }
            links.appendChild(link);
        });
        var statsLink = element("a", "lobby-chapter-link lobby-chapter-external", "Stats ↗");
        statsLink.href = "/stats"; statsLink.target = "_blank"; statsLink.rel = "noopener";
        statsLink.setAttribute("aria-label", "Stats and reference (opens in a new tab)"); links.appendChild(statsLink);
        nav.appendChild(links);
        primary = element("button", "lobby-primary-action", "New expedition");
        primary.type = "button"; primary.id = "lobby_primary_action"; primary.dataset.lobbyCreate = "true";
        nav.appendChild(primary); root.insertBefore(nav, skip.nextSibling);
        overview.init(root); discovery.init(root); account(); browser.init(root);
        var requested = new URLSearchParams(location.search).get("view");
        controller = createViews({ initial: "play", views: views, enabled: authenticated,
            storageKey: "pebble-lobby-workspace", requested: requested });
        nav.querySelectorAll("[data-workspace-target]").forEach(function (link) { controller.register(link); });
        root.addEventListener("click", function (event) {
            if (event.target.closest(".btn-load-chronicle-comp") && hasRoom()) {
                jump("party_lobby_panel", event.detail === 0); schedule(); return;
            }
            var target = event.target.closest("[data-workspace-target], [data-lobby-section], [data-lobby-create], [data-daily-seed]");
            if (!target || !root.contains(target)) return;
            if (target.tagName === "A" && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)) return;
            event.preventDefault(); event.stopPropagation();
            returnedFromGame = false;
            var keyboard = event.detail === 0;
            if (target.dataset.dailySeed) {
                window.__PEBBLE_PENDING_DAILY = window.__PEBBLE_DAILY_BROTH;
                createParty(keyboard);
                window.dispatchEvent(new CustomEvent("pebble-apply-daily", { detail: window.__PEBBLE_DAILY_BROTH }));
            } else if (target.dataset.lobbyCreate) createParty(keyboard);
            else if (target.dataset.lobbySection) jump(target.dataset.lobbySection, keyboard);
            else if (target.dataset.workspaceTarget === "play" && hasRoom()) {
                root.classList.remove("show-party-modes"); jump("party_lobby_panel", keyboard);
            } else controller.show(target.dataset.workspaceTarget, keyboard);
            schedule();
        });
        new MutationObserver(schedule).observe(root, { childList: true, subtree: true,
            characterData: true, attributes: true, attributeFilter: ["style"] });
        new MutationObserver(schedule).observe(root.querySelector(".welcome-entry"), {
            attributes: true, attributeFilter: ["class"] });
        window.addEventListener("resize", schedule, { passive: true }); update();
    }
    $(document).ready(init);
    return { init: init };
});
