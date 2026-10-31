/* Play home: Continue, New expedition, Join friends. It reads authoritative
 * library entries, room rows and live rows; resume keeps the source URL. */
define(["hero-role"], function (heroRole) {
    "use strict";
    var home, recent, recentList, friends, friendsList, signature, friendsSignature;
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
    function heading(level, text, count) {
        var node = el(level, "", text);
        if (count !== undefined) {
            var badge = el("span", "lobby-section-count tr-badge", String(count));
            badge.setAttribute("aria-label", count + (count === 1 ? " entry" : " entries"));
            node.appendChild(badge);
        }
        return node;
    }
    function badge(text, kind) {
        var node = el("span", "tr-badge lobby-friend-badge", text);
        if (kind) node.dataset.kind = kind;
        return node;
    }
    function init(root) {
        home = el("section", "lobby-home"); home.id = "lobby_home";
        home.setAttribute("aria-labelledby", "lobby_home_title");
        recent = el("section", "lobby-recent"); recent.setAttribute("aria-labelledby", "lobby_recent_title");
        home.appendChild(recent);
        var banner = el("div", "lobby-home-banner");
        var copy = el("div", "lobby-home-copy");
        copy.appendChild(el("p", "lobby-eyebrow", "Pebble Broth · 1–4 heroes"));
        var title = el("h1", "", "Your expeditions"); title.id = "lobby_home_title";
        copy.append(title, el("p", "lobby-home-intro", "Gather a party of up to four heroes, continue a saved campaign, or join friends already in the dungeon."));
        var actions = el("div", "lobby-home-actions"), create = el("button", "lobby-primary-action tr-btn", "New expedition");
        create.type = "button"; create.dataset.lobbyCreate = "true";
        create.setAttribute("aria-describedby", "lobby_home_create_hint");
        var access = el("select"); access.id = "lobby_creation_visibility"; access.setAttribute("aria-label", "New lobby access");
        [["public", "Public lobby"], ["private", "Private lobby"]].forEach(function (item) { var option = el("option", "", item[1]); option.value = item[0]; access.appendChild(option); });
        actions.append(access, create, sectionLink("Join friends →", "lobby_friends_panel")); copy.appendChild(actions);
        var hint = el("p", "lobby-home-hint", "Opens the party builder: choose heroes, friendly-fire rule and seasonings.");
        hint.id = "lobby_home_create_hint"; copy.appendChild(hint);
        banner.appendChild(copy);
        var daily = dailyBroth(); window.__PEBBLE_DAILY_BROTH = daily;
        var card = el("section", "lobby-daily-broth tr-card"); card.setAttribute("aria-label", "Daily seeded expedition");
        var info = el("div", "lobby-daily-broth-copy");
        info.append(el("span", "lobby-daily-broth-kicker", "Daily seed · " + daily.date),
            el("strong", "lobby-daily-broth-title", daily.name),
            el("span", "lobby-daily-broth-meta", "The same dungeon for everyone today. Compare runs with friends."),
            el("span", "lobby-daily-broth-seed", "Seed #" + daily.seed));
        var players = el("span", "lobby-daily-broth-players"); players.hidden = true; info.appendChild(players);
        var button = el("button", "lobby-daily-broth-btn tr-btn", "Play today's seed");
        button.type = "button"; button.dataset.dailySeed = daily.seed;
        card.append(info, button); banner.appendChild(card);
        var art = el("div", "lobby-home-art"); art.setAttribute("aria-hidden", "true");
        art.appendChild(el("span", "", "Toss your pebble. Stir the pot.")); banner.appendChild(art);
        home.appendChild(banner);
        friends = el("section", "lobby-home-friends"); friends.setAttribute("aria-labelledby", "lobby_home_friends_title");
        var friendsHead = el("div", "lobby-recent-heading");
        friendsHead.append(heading("h2", "Join friends"), sectionLink("All parties and live games →", "lobby_friends_panel"));
        friendsHead.querySelector("h2").id = "lobby_home_friends_title";
        friendsList = el("div", "lobby-friend-list");
        friends.append(friendsHead, friendsList); home.appendChild(friends);
        root.insertBefore(home, document.getElementById("party_lobby_panel"));
        refresh();
    }
    function continueCard(source) {
        var card = source.cloneNode(true);
        card.className = "lobby-recent-entry expedition-card tr-card";
        card.removeAttribute("hidden"); card.removeAttribute("data-game-id");
        card.querySelectorAll(".library-entry-danger, .library-record-link, .library-unavailable").forEach(function (node) { node.remove(); });
        var resume = card.querySelector("[data-library-load]"), title = card.querySelector("h3");
        if (resume && title) resume.setAttribute("aria-label", resume.textContent + " " + title.textContent);
        return card;
    }
    function refreshContinue() {
        var library = document.getElementById("game_library_panel");
        if (library) heroRole.decorate(library);
        var entries = Array.from(document.querySelectorAll("#game_library_panel .game-library-entry"));
        entries.sort(function (left, right) {
            return Number(right.dataset.saved || 0) - Number(left.dataset.saved || 0)
                || Number(left.dataset.order || 0) - Number(right.dataset.order || 0);
        });
        var games = entries.filter(function (entry) { return entry.querySelector("[data-library-load]"); }).slice(0, 3);
        home.classList.toggle("has-recent-expeditions", games.length > 0);
        var tutorial = document.querySelector('#play_now a[href="#play-tut-web-trunk"]');
        var next = games.map(function (entry) { return entry.innerHTML; }).join("|") + entries.length + Boolean(tutorial);
        if (signature === next) return;
        signature = next;
        var header = el("div", "lobby-recent-heading");
        var title = heading("h2", "Continue", games.length ? games.length : undefined);
        title.id = "lobby_recent_title";
        header.append(title, sectionLink("All saved expeditions →", "game_library_panel"));
        recentList = el("div", "lobby-recent-list");
        recent.replaceChildren(header, recentList);
        if (!games.length) {
            var empty = el("div", "lobby-recent-empty tr-callout");
            empty.appendChild(el("p", "", entries.length
                ? "No expeditions are ready to resume. Check your saved expeditions for details."
                : "Nothing to continue yet. Start a new expedition below, or learn the ropes first."));
            var learn = sectionLink("New to the dungeon? Try the tutorial →", "play_now");
            if (tutorial) { learn.href = tutorial.getAttribute("href"); delete learn.dataset.lobbySection; }
            empty.appendChild(learn); recentList.appendChild(empty);
        }
        games.forEach(function (source) { recentList.appendChild(continueCard(source)); });
        heroRole.decorate(recent);
    }
    function roomCards() {
        return Array.from(document.querySelectorAll("#party_rooms_tbody tr")).map(function (row) {
            var cells = row.querySelectorAll("td"), join = row.querySelector(".btn-join-party-room");
            if (cells.length < 6 || !join) return null;
            var seats = /(\d+)\s*\/\s*(\d+)/.exec(cells[2].textContent);
            var card = el("article", "lobby-friend-card tr-card"); card.dataset.kind = "room";
            var head = el("div", "lobby-friend-head");
            head.append(el("h3", "", cells[0].textContent.trim() || "Gathering party"),
                badge(join.dataset.roomStatus === "launched" ? "Live" : "Gathering", join.dataset.roomStatus === "launched" ? "live" : "room"));
            card.appendChild(head);
            card.appendChild(el("p", "lobby-friend-meta", "Host " + cells[1].textContent.trim()));
            var roster = cells[3].textContent.trim();
            if (roster) card.appendChild(el("p", "lobby-friend-roster", roster.replace(/\s*\|\s*/g, " · ")));
            var badges = el("div", "lobby-friend-badges");
            if (seats) badges.appendChild(badge((Number(seats[2]) - Number(seats[1])) + " open of " + seats[2] + " seats", "seats"));
            badges.appendChild(badge(cells[4].textContent.trim() || "Friendly fire", /on/i.test(cells[4].textContent) ? "warn" : "safe"));
            if (row.dataset.roomSeed) badges.appendChild(badge("Seed #" + row.dataset.roomSeed, "seed"));
            card.appendChild(badges);
            var action = el("button", "dcss-btn dcss-btn-primary tr-btn lobby-friend-action", join.textContent.trim() || "Join party");
            action.type = "button"; action.dataset.roomId = join.dataset.roomId;
            action.addEventListener("click", function () { join.click(); });
            card.appendChild(el("div", "lobby-friend-actions")).appendChild(action);
            card.dataset.seed = row.dataset.roomSeed || "";
            return card;
        }).filter(Boolean);
    }
    function liveCards() {
        return Array.from(document.querySelectorAll("#player_list tbody tr")).map(function (row) {
            var cell = function (name) { var node = row.querySelector("." + name); return node ? node.textContent.trim() : ""; };
            var original = row.querySelector(".coop_join a");
            var card = el("article", "lobby-friend-card tr-card"); card.dataset.kind = "live";
            var head = el("div", "lobby-friend-head");
            head.append(el("h3", "", cell("username") + "'s expedition"), badge("Live", "live"));
            card.appendChild(head);
            var hero = [cell("char"), cell("place") ? "on " + cell("place") : "", cell("xl") ? "level " + cell("xl") : ""].filter(Boolean).join(" · ");
            if (hero) card.appendChild(el("p", "lobby-friend-roster", hero));
            var badges = el("div", "lobby-friend-badges");
            if (cell("game_id")) badges.appendChild(badge(cell("game_id"), "mode"));
            if (cell("turn")) badges.appendChild(badge("Turn " + cell("turn"), "turn"));
            if (cell("spectator_count")) badges.appendChild(badge(cell("spectator_count") + " watching", "watch"));
            card.appendChild(badges);
            if (original) {
                var action = el("a", "dcss-btn dcss-btn-primary tr-btn lobby-friend-action", original.textContent.trim());
                action.href = original.getAttribute("href");
                if (/join/i.test(original.textContent)) action.addEventListener("click", function () { window.pending_auto_join_party = true; });
                card.appendChild(el("div", "lobby-friend-actions")).appendChild(action);
            }
            return card;
        });
    }
    function refreshFriends() {
        // Idle timers tick every second; only card content changes rebuild the list.
        var cards = roomCards().concat(liveCards());
        var next = cards.map(function (card) { return card.outerHTML; }).join("|");
        if (friendsSignature === next) return;
        friendsSignature = next;
        friendsList.replaceChildren();
        if (!cards.length) {
            var empty = el("p", "lobby-friend-empty tr-callout", "No parties are gathering and no expedition is live right now. Start one and invite a friend, or check back later.");
            friendsList.appendChild(empty);
        }
        cards.slice(0, 4).forEach(function (card) { friendsList.appendChild(card); });
        if (cards.length > 4) friendsList.appendChild(sectionLink("+" + (cards.length - 4) + " more →", "lobby_friends_panel", "lobby-friend-more"));
        home.classList.toggle("has-friends", cards.length > 0);
        var daily = window.__PEBBLE_DAILY_BROTH, players = home.querySelector(".lobby-daily-broth-players");
        var onSeed = cards.filter(function (card) { return daily && card.dataset.seed === daily.seed; }).length;
        players.hidden = !onSeed;
        players.textContent = onSeed ? onSeed + (onSeed === 1 ? " party is gathering on today's seed" : " parties are gathering on today's seed") : "";
    }
    function refresh() {
        if (!home) return;
        refreshContinue(); refreshFriends();
    }
    return { init: init, refresh: refresh };
});
