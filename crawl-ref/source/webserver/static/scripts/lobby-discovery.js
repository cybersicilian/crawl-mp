/* Discovery presents existing room/live rows; it never owns party or game state. */
define(function () {
    "use strict";
    var root, search, count, empty, notice;
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
        header.appendChild(tools);
        notice = el("p", "lobby-party-notice", "You have a party in preparation. ");
        var back = el("a", "", "Return to your party →"); back.href = "#party_lobby_panel";
        back.dataset.lobbySection = "party_lobby_panel"; notice.appendChild(back); header.appendChild(notice);
        root.insertBefore(header, document.getElementById("lobby_body"));
        var rooms = el("section", "lobby-discovery-rooms"); rooms.id = "lobby_rooms_panel";
        rooms.append(el("h2", "", "Gathering parties"), el("p", "lobby-section-intro", "Choose an open seat before the expedition begins."));
        rooms.appendChild(document.getElementById("party_rooms_list_view")); header.after(rooms);
        var live = document.getElementById("lobby_body"), heading = live.querySelector(":scope > span");
        heading.replaceWith(el("h2", "", "Live expeditions"));
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
        var query = search.value.trim().toLocaleLowerCase(), matched = 0, total = 0;
        ["party_rooms_table", "player_list"].forEach(function (id) {
            var table = document.getElementById(id); if (!table) return;
            var headers = Array.from(table.querySelectorAll("thead th")).map(function (node) { return node.textContent.trim(); });
            table.querySelectorAll("tbody tr").forEach(function (row) {
                var visible = !query || row.textContent.toLocaleLowerCase().includes(query);
                row.hidden = !visible;
                row.querySelectorAll("td").forEach(function (cell, i) {
                    if (cell.dataset.label !== headers[i]) cell.dataset.label = headers[i] || "Details";
                });
                if (id === "player_list" || !room) { total++; if (visible) matched++; }
            });
        });
        empty.hidden = !!document.querySelector("#player_list tbody tr") || !!query;
        document.getElementById("lobby_body").classList.toggle("has-live-games", !!document.querySelector("#player_list tbody tr"));
        var message = query ? matched + " matching " + (matched === 1 ? "result" : "results")
            : total ? total + " " + (total === 1 ? "listing" : "listings") + " available" : "No parties or expeditions available";
        if (count.textContent !== message) count.textContent = message;
        root.querySelector(".lobby-discovery-no-results").hidden = !query || matched > 0;
    }
    return { init: init, refresh: refresh };
});
