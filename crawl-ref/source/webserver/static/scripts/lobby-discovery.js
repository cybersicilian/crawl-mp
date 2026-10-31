/* Discovery presents existing room/live rows; it never owns party or game state. */
define(["text-query"], function (textQuery) {
    "use strict";
    var root, search, clear, count, empty, notice, listingFilter = "all", filters;
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text) node.textContent = text;
        return node;
    }
    function init(lobby) {
        root = lobby;
        var header = el("section", "lobby-discovery-header"); header.id = "lobby_friends_panel";
        header.append(el("p", "lobby-eyebrow", "Better with company"), el("h1", "", "Join friends"),
            el("p", "lobby-section-intro", "Find a gathering party, join an expedition, or watch a live adventure."));
        var tools = el("div", "lobby-discovery-tools"), label = el("label", "lobby-search");
        label.appendChild(el("span", "visually-hidden", "Find a friend or expedition"));
        search = el("input"); search.type = "search"; search.placeholder = "Search host, hero, or expedition…";
        search.addEventListener("input", refresh); label.appendChild(search);
        count = el("span", "lobby-discovery-count"); count.setAttribute("role", "status"); tools.append(label, count);
        clear = el("button", "dcss-btn collection-clear", "Clear filters"); clear.type = "button";
        clear.disabled = true;
        clear.addEventListener("click", function () { search.value = ""; listingFilter = "all"; refresh(); search.focus(); });
        search.addEventListener("keydown", function (event) {
            if (event.key !== "Escape" || !search.value) return;
            event.preventDefault(); event.stopPropagation(); search.value = ""; refresh();
        });
        tools.appendChild(clear); header.appendChild(tools);
        filters = el("div", "lobby-filter-group lobby-listing-filters"); filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "Expedition listings");
        [["all", "All listings"], ["open", "Open seats"], ["gathering", "Gathering parties"], ["live", "Live expeditions"]].forEach(function (item) {
            var button = el("button", "", item[1]); button.type = "button"; button.dataset.listingFilter = item[0];
            button.addEventListener("click", function () { listingFilter = item[0]; refresh(); }); filters.appendChild(button);
        }); header.appendChild(filters);
        notice = el("p", "lobby-party-notice", "You have a party in preparation. ");
        var back = el("a", "", "Return to your party →"); back.href = "#party_lobby_panel";
        back.dataset.lobbySection = "party_lobby_panel"; notice.appendChild(back); header.appendChild(notice);
        root.insertBefore(header, document.getElementById("lobby_body"));
        var rooms = el("section", "lobby-discovery-rooms"); rooms.id = "lobby_rooms_panel";
        rooms.setAttribute("aria-labelledby", "lobby_rooms_title");
        var roomsTitle = el("h2", "", "Gathering parties"); roomsTitle.id = "lobby_rooms_title";
        rooms.append(roomsTitle, el("p", "lobby-section-intro", "Claim an open seat before the expedition sets out. The host chooses the friendly-fire rule."));
        rooms.appendChild(document.getElementById("party_rooms_list_view")); header.after(rooms);
        var live = document.getElementById("lobby_body"), heading = live.querySelector(":scope > span, :scope > h2");
        var liveTitle = el("h2", "", "Live expeditions"); liveTitle.id = "lobby_live_title";
        if (heading) heading.replaceWith(liveTitle); else live.prepend(liveTitle);
        live.setAttribute("aria-labelledby", liveTitle.id);
        var details = el("button", "lobby-live-details", "Show full details"); details.type = "button";
        details.setAttribute("aria-pressed", "false"); details.setAttribute("aria-controls", "player_list");
        details.addEventListener("click", function () {
            var expanded = live.classList.toggle("show-live-details");
            details.setAttribute("aria-pressed", String(expanded));
            details.textContent = expanded ? "Show fewer details" : "Show full details";
        });
        live.querySelector("h2").after(details);
        empty = el("p", "lobby-live-empty", "No live expeditions right now. Start a new party, or check back when your friends are playing.");
        live.insertBefore(empty, live.querySelector("table"));
        var noMatches = el("p", "lobby-discovery-no-results", "No matching friends or expeditions. Try a different host or hero name.");
        noMatches.hidden = true; header.appendChild(noMatches);
    }
    function refresh(room) {
        if (!root) return;
        // Input events pass an Event; room ownership is read from authoritative UI.
        room = typeof room === "boolean" ? room : document.getElementById("party_room_view").style.display !== "none";
        notice.hidden = !room; document.getElementById("lobby_rooms_panel").hidden = room;
        var query = search.value.trim(), matches = textQuery.compile(query), matched = 0, total = 0;
        clear.disabled = !search.value && listingFilter === "all";
        filters.querySelectorAll("button").forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.listingFilter === listingFilter)); });
        ["party_rooms_table", "player_list"].forEach(function (id) {
            var table = document.getElementById(id); if (!table) return;
            var headers = Array.from(table.querySelectorAll("thead th")).map(function (node) { return node.textContent.trim(); });
            table.querySelectorAll("tbody tr").forEach(function (row) {
                var enabled = listingFilter === "all" || listingFilter === "live" && id === "player_list"
                    || listingFilter === "gathering" && id === "party_rooms_table" && row.dataset.roomStatus !== "launched"
                    || listingFilter === "open" && id === "party_rooms_table" && row.dataset.joinable === "true";
                var visible = enabled && matches(row.textContent);
                if (row.hidden === visible) row.hidden = !visible;
                row.querySelectorAll("td").forEach(function (cell, i) {
                    if (cell.dataset.label !== headers[i]) cell.dataset.label = headers[i] || "Details";
                });
                if (id === "player_list" || !room) { total++; if (visible) matched++; }
            });
        });
        empty.hidden = !!document.querySelector("#player_list tbody tr") || !!query || !["all", "live"].includes(listingFilter);
        document.getElementById("lobby_body").classList.toggle("has-live-games", !!document.querySelector("#player_list tbody tr"));
        var message = query || listingFilter !== "all" ? matched + " matching " + (matched === 1 ? "result" : "results")
            : total ? total + " " + (total === 1 ? "listing" : "listings") + " available" : "No parties or expeditions available";
        if (count.textContent !== message) count.textContent = message;
        root.querySelector(".lobby-discovery-no-results").hidden = (!query && listingFilter === "all") || matched > 0;
    }
    return { init: init, refresh: refresh };
});
