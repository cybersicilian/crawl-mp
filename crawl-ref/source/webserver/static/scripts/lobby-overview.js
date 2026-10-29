/* Read-only overview of authoritative library entries. Resume retains the source URL. */
define(function () {
    "use strict";
    var home, recent, signature;
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text) node.textContent = text;
        return node;
    }
    function dailyBroth() {
        var iso = new Date().toISOString().slice(0, 10), hash = 2166136261;
        for (var i = 0; i < iso.length; i++) {
            hash ^= iso.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0;
        }
        var recipes = [
            ["Charred Hydra Consommé", ["fast_boil", "friendly_fire"]],
            ["Saffron Lair Bisque", ["heavy_pebbles"]],
            ["Three-Pebble Iron Kettle", ["shared_ladle", "fast_boil"]],
            ["Peppercorn Vaults Reduction", ["friendly_fire", "heavy_pebbles"]],
            ["Smoked Kobold Bone Broth", ["fast_boil"]]
        ];
        var pick = recipes[hash % recipes.length];
        return { date: iso, seed: String(100000000 + hash % 900000000), name: pick[0], seasonings: pick[1] };
    }
    function sectionLink(text, section, className) {
        var link = el("a", className || "lobby-home-link", text);
        var view = section === "game_library_panel" ? "saved" : section === "lobby_friends_panel" ? "friends" : "play";
        link.href = "/?view=" + view + "#lobby"; link.dataset.lobbySection = section;
        return link;
    }
    function init(root) {
        home = el("section", "lobby-home"); home.id = "lobby_home";
        home.setAttribute("aria-labelledby", "lobby_home_title");
        var copy = el("div", "lobby-home-copy");
        copy.appendChild(el("p", "lobby-eyebrow", "Pebble Broth · 1–4 heroes"));
        var title = el("h1", "", "Your expeditions"); title.id = "lobby_home_title";
        copy.append(title, el("p", "lobby-home-intro", "Continue your journey, gather a party, or join friends in the dungeon."));
        var actions = el("div", "lobby-home-actions"), create = el("button", "lobby-primary-action", "New expedition");
        create.type = "button"; create.dataset.lobbyCreate = "true";
        actions.append(create, sectionLink("Join friends →", "lobby_friends_panel")); copy.appendChild(actions);
        home.appendChild(copy);
        var art = el("div", "lobby-home-art"); art.setAttribute("aria-hidden", "true");
        art.appendChild(el("span", "", "Toss your pebble. Stir the pot.")); home.appendChild(art);
        var board = el("div", "lobby-home-board");
        recent = el("section", "lobby-recent"); recent.setAttribute("aria-label", "Recent expeditions");
        board.appendChild(recent);
        var daily = dailyBroth(); window.__PEBBLE_DAILY_BROTH = daily;
        var card = el("section", "lobby-daily-broth"); card.setAttribute("aria-label", "Daily seeded expedition");
        var info = el("div", "lobby-daily-broth-copy");
        info.append(el("span", "lobby-daily-broth-kicker", "Soup of the day · " + daily.date),
            el("strong", "lobby-daily-broth-title", daily.name),
            el("span", "lobby-daily-broth-meta", "The same dungeon seed for everyone today."),
            el("span", "lobby-daily-broth-seed", "Seed #" + daily.seed));
        var button = el("button", "lobby-daily-broth-btn", "Play today's seed →");
        button.type = "button"; button.dataset.dailySeed = daily.seed;
        card.append(info, button); board.appendChild(card); home.appendChild(board);
        root.insertBefore(home, document.getElementById("party_lobby_panel"));
        refresh();
    }
    function refresh() {
        if (!home) return;
        var entries = Array.from(document.querySelectorAll("#game_library_panel .game-library-entry"));
        var games = entries.filter(function (entry) { return entry.querySelector("[data-library-load]"); }).slice(0, 2);
        home.classList.toggle("has-recent-expeditions", games.length > 0);
        var tutorial = document.querySelector('#play_now a[href="#play-tut-web-trunk"]');
        var next = games.map(function (entry) { return entry.textContent + entry.querySelector("[data-library-load]").href; }).join("|") + entries.length + Boolean(tutorial);
        if (signature === next) return;
        signature = next;
        var header = el("div", "lobby-recent-heading");
        header.append(el("h2", "", games.length ? "Continue playing" : "Saved expeditions"), sectionLink("View all →", "game_library_panel"));
        recent.replaceChildren(header);
        if (!games.length) {
            recent.append(el("p", "lobby-recent-empty", entries.length
                ? "No expeditions are ready to resume. Check your saved expeditions for details."
                : "A fresh page in your story. Your saved expeditions will be waiting here when you return."));
            var learn = sectionLink("New to the dungeon? Try the tutorial →", "play_now");
            if (tutorial) { learn.href = tutorial.getAttribute("href"); delete learn.dataset.lobbySection; }
            recent.appendChild(learn);
        }
        games.forEach(function (source) {
            var row = el("article", "lobby-recent-entry"), copy = el("div");
            var title = source.querySelector("h3"), meta = source.querySelector("small");
            copy.append(el("h3", "", title.textContent), el("p", "", meta ? meta.textContent : "Saved expedition"));
            var original = source.querySelector("[data-library-load]"), resume = el("a", "dcss-btn lobby-resume", original.textContent);
            resume.href = original.getAttribute("href"); resume.dataset.libraryLoad = original.dataset.libraryLoad;
            resume.setAttribute("aria-label", original.textContent + " " + title.textContent);
            row.append(copy, resume); recent.appendChild(row);
        });
    }
    return { init: init, refresh: refresh };
});
