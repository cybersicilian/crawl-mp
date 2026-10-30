/* Read-only room presentation. Seat availability comes from the server. */
define(["jquery", "character-catalog", "class-art"], function ($, catalog, classArt) {
    "use strict";
    function render(rooms) {
        var body = document.getElementById("party_rooms_tbody"); if (!body) return;
        body.replaceChildren();
        var list = (rooms || []).slice().sort(function (a, b) {
            function rank(room) { return room.status === "launched" ? 1 : Array.isArray(room.available_slots) && !room.available_slots.length ? 2 : 0; }
            return rank(a) - rank(b) || (a.name || a.host || "").localeCompare(b.name || b.host || "");
        });
        $("#party_rooms_empty").toggle(!list.length); $("#party_rooms_table").toggle(!!list.length);
        list.forEach(function (room) {
            var slots = room.slots || [], live = room.status === "launched";
            var known = Array.isArray(room.available_slots), full = !live && known && !room.available_slots.length;
            var row = $("<tr class='party-room-listing'></tr>").attr({ "data-joinable": full ? "false" : known && !live ? "true" : "unknown", "data-room-status": room.status || "staging" });
            var title = $("<td class='room-name'></td>").append($("<strong></strong>").text(room.name || room.host + "'s party"),
                $("<small class='room-phase'></small>").text(live ? "In the dungeon" : "Preparing to depart"));
            row.append(title, $("<td class='room-host'></td>").text(room.host));
            var active = slots.filter(function (slot, index) { return (room.launch_slots || [0]).includes(index); });
            var ready = active.filter(function (slot) { return slot.ready !== false; }).length;
            row.append($("<td class='room-seats'></td>").append($("<strong></strong>").text(live ? "Live expedition" : known ? room.available_slots.length + " open " + (room.available_slots.length === 1 ? "seat" : "seats") : "Check availability"),
                $("<small></small>").text(active.length + " joining · " + ready + " ready")));
            var roster = $("<td class='room-roster'></td>");
            active.forEach(function (slot) {
                var job = catalog.jobs[slot.job], item = $("<span class='room-roster-hero'></span>");
                if (job) item.append(classArt.render(job));
                item.append($("<span></span>").text((slot.hero_name || "Hero") + " · " + (slot.species || "") + " " + (slot.job || "")));
                roster.append(item);
            }); row.append(roster);
            row.append($("<td class='room-rules'></td>").text(room.friendly_fire === false ? "Safe projectiles" : "Friendly fire on"));
            var actions = $("<td class='room-actions'></td>");
            if (!live && known && room.available_slots.length) {
                var seat = $("<select class='party-room-seat'></select>").attr("aria-label", "Choose a seat in " + (room.name || room.host + "'s party"));
                room.available_slots.forEach(function (index) {
                    var slot = slots[index] || {};
                    seat.append($("<option></option>").val(index).text("P" + (Number(index) + 1) + (room.resume_id ? " · " + slot.hero_name : " · Open seat")));
                }); actions.append(seat);
            }
            var label = full ? "No open seats" : live ? "Join live expedition" : "Join party";
            actions.append($("<button type='button' class='dcss-btn dcss-btn-primary btn-join-party-room'></button>")
                .attr({ "data-room-id": room.room_id, "data-room-host": room.host, "data-room-status": room.status || "staging" })
                .prop("disabled", full).text(label));
            row.append(actions); $(body).append(row);
        });
    }
    return { render: render };
});
