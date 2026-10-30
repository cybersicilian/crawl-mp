/* Lobby sharing and checkpoint selection, backed by authenticated room commands. */
define(["comm", "party-url"], function (comm, links) {
    "use strict";
    var root, current, user, visibility, invite, saves, summary, fresh, copy, status, offer, pendingOffer;
    function el(tag, cls, text) {
        var node = document.createElement(tag); node.className = cls || "";
        if (text !== undefined) node.textContent = text; return node;
    }
    function button(text, action) { var node = el("button", "dcss-btn", text); node.type = "button"; node.addEventListener("click", action); return node; }
    function field(label, node) { var wrapper = el("label"); wrapper.append(el("span", "", label), node); return wrapper; }
    function newExpedition() {
        if (!current || !current.resume_id || current.status !== "staging"
            || current.host.toLowerCase() !== (user || "").toLowerCase()) return;
        var occupied = current.slots.some(function (slot) {
            return slot.username && slot.username.toLowerCase() !== current.host.toLowerCase();
        });
        if (occupied && !window.confirm("Start a new expedition and release your friends' lobby seats? This saved expedition will remain in Saved.")) return;
        comm.send_message("party_room_create", { room_id: current.room_id, replace_save: current.resume_id,
            hero_name: user, visibility: current.visibility || "public", friendly_fire: true });
    }
    function load(id) {
        if (!id) return;
        var occupied = current && current.slots.some(function (slot) { return slot.username && slot.username !== current.host; });
        if (occupied && !window.confirm("Load this saved party into your lobby? Your friends will keep seats where the save has room, and the saved heroes will replace these character builds.")) { saves.value = ""; return; }
        var preference = document.getElementById("lobby_creation_visibility");
        comm.send_message("party_room_load_save", { id: id, visibility: preference ? preference.value : "public" });
    }
    function refreshSaves() {
        if (!saves) return;
        var entries = Array.from(document.querySelectorAll("#game_library_panel [data-library-lobby]"));
        var key = entries.map(function (node) { return node.dataset.libraryLobby + node.dataset.saveName; }).join("|");
        if (saves.dataset.entries === key) return;
        saves.dataset.entries = key; var selected = saves.value;
        saves.replaceChildren(el("option", "", entries.length ? "Choose a saved expedition…" : "No saved expeditions yet")); saves.firstChild.value = "";
        entries.forEach(function (node) { var option = el("option", "", node.dataset.saveName); option.value = node.dataset.libraryLobby; saves.appendChild(option); });
        saves.value = entries.some(function (node) { return node.dataset.libraryLobby === selected; }) ? selected : "";
    }
    function init() {
        if (root) return;
        root = el("section", "party-lobby-tools"); root.setAttribute("aria-label", "Lobby access and saved expedition");
        visibility = el("select"); visibility.id = "party_lobby_visibility";
        [["public", "Public · listed for everyone"], ["private", "Private · invite link only"]].forEach(function (item) { var option = el("option", "", item[1]); option.value = item[0]; visibility.appendChild(option); });
        visibility.addEventListener("change", function () { if (current) comm.send_message("party_room_settings", { room_id: current.room_id, visibility: visibility.value }); });
        invite = el("input"); invite.type = "text"; invite.readOnly = true; invite.id = "party_lobby_link";
        invite.addEventListener("focus", function () { invite.select(); });
        copy = button("Copy lobby link", async function () {
            try { await navigator.clipboard.writeText(invite.value); status.textContent = "Lobby link copied."; }
            catch (error) { invite.focus(); invite.select(); status.textContent = "Copy the selected lobby link."; }
        });
        var reset = button("Reset invite link", function () {
            if (current && window.confirm("Replace this invite link? Earlier links will stop granting access.")) comm.send_message("party_room_settings", { room_id: current.room_id, rotate_invite: true });
        }); reset.id = "party_reset_invite";
        saves = el("select"); saves.id = "party_lobby_save"; saves.addEventListener("change", function () { load(saves.value); });
        summary = el("p", "party-loaded-summary"); summary.hidden = true;
        fresh = button("New expedition", newExpedition); fresh.id = "party_new_expedition"; fresh.hidden = true;
        fresh.title = "Start a fresh party and keep this checkpoint in Saved expeditions";
        status = el("span", "party-link-status"); status.setAttribute("role", "status");
        var actions = el("div", "party-lobby-link-actions"); actions.append(copy, reset, status);
        root.append(field("Lobby access", visibility), field("Lobby link", invite), actions, field("Load a save into this lobby", saves), summary, fresh);
        document.querySelector("#party_room_view .party-room-banner").after(root);
        window.addEventListener("saved-expeditions-updated", refreshSaves);
        document.addEventListener("click", function (event) {
            var target = event.target.closest("[data-library-lobby]"); if (!target) return;
            event.preventDefault(); load(target.dataset.libraryLobby);
        }); refreshSaves();
    }
    function render(room, username) {
        init(); current = room; user = username; fresh.hidden = true; if (!room) return;
        var host = room.host.toLowerCase() === (username || "").toLowerCase();
        visibility.value = room.visibility || "public"; visibility.disabled = !host;
        var value = links.url(room); if (invite.value !== value) invite.value = value;
        copy.disabled = room.visibility === "private" && !room.invite_token;
        document.getElementById("party_reset_invite").hidden = !host || room.visibility !== "private";
        saves.disabled = !host; refreshSaves();
        summary.hidden = !room.resume_id;
        fresh.hidden = !host || !room.resume_id || room.status !== "staging";
        if (room.resume_id) {
            var details = room.resume_summary || {};
            summary.textContent = "Saved expedition · " + (details.place || "Dungeon") + " · Turn " + (details.turns || 0)
                + " · " + (details.heroes || 1) + " saved heroes. Character builds and campaign rules are preserved."
                + (host ? " You can also start a new expedition and keep this checkpoint in Saved." : "");
        }
        document.getElementById("party_room_view").classList.toggle("has-saved-expedition", !!room.resume_id);
        if (offer && (room.host.toLowerCase() === (user || "").toLowerCase() || room.slots.some(function (slot) { return slot.username && slot.username.toLowerCase() === (user || "").toLowerCase(); }))) offer.hidden = true;
    }
    function showOffer(data) {
        var room = data.room, parent = document.getElementById("lobby_friends_panel"); if (!room) return;
        if (!parent) { pendingOffer = data; return; }
        pendingOffer = null;
        if (!offer) { offer = el("section", "party-invite-offer"); offer.id = "party_invite_offer"; parent.appendChild(offer); }
        offer.hidden = false; offer.replaceChildren(el("h2", "", room.name), el("p", "", "Invited by " + room.host + " · " + (room.visibility === "private" ? "Private lobby" : "Public lobby")));
        var seat = el("select"); seat.setAttribute("aria-label", "Choose your lobby seat");
        (room.available_slots || []).forEach(function (index) {
            var slot = room.slots[index], option = el("option", "", "P" + (index + 1) + (room.resume_id ? " · " + slot.hero_name + " · " + slot.species + " " + slot.job : " · Open seat")); option.value = index; seat.appendChild(option);
        });
        if (seat.options.length) {
            var join = button(room.status === "launched" ? "Join expedition" : "Join lobby", function () {
                var slot = Number(seat.value); comm.send_message("party_room_join", { room_id: room.room_id, slot: slot });
                if (room.status === "launched") {
                    window.pending_auto_join_party = true; window.pending_auto_join_slot = slot;
                    comm.send_message("watch", { username: room.host, expedition_id: room.expedition_id || room.resume_id });
                }
            }); offer.append(field("Your seat", seat), join);
        } else offer.appendChild(el("p", "", "No open player seats. The host can make room before beginning."));
        if (room.status === "launched") offer.appendChild(button("Watch expedition", function () { window.pending_auto_join_party = false; comm.send_message("watch", { username: room.host, expedition_id: room.expedition_id || room.resume_id }); }));
        window.dispatchEvent(new CustomEvent("party-invite-opened"));
    }
    comm.register_handlers({ party_room_offer: showOffer, party_room_loaded: function () { window.dispatchEvent(new CustomEvent("party-lobby-opened")); } });
    window.addEventListener("lobby-navigation-ready", function () { if (pendingOffer) showOffer(pendingOffer); });
    return { init: init, render: render };
});
