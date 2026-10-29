define(["jquery", "chat", "./map_knowledge", "./player"], function ($, chat, map, player) {
    "use strict";
    var party = null;

    function snapshot(item, id, source) {
        var note = String(item.description || item.desc || "").trim();
        var facts = [];
        if (item.kind_name) facts.push(item.kind_name);
        if (item.qty > 1) facts.push("Quantity: " + item.qty);
        if (item.equipped) facts.push("Equipped");
        return { id: id, name: item.name, source: source,
            description: note + (facts.length ? (note ? "\n\n" : "") + facts.join(" · ") : "") };
    }
    function collect() {
        var result = [];
        if (party && party.members) party.members.forEach(function (member) {
            if (!member.inventory_known || !Array.isArray(member.inventory)) return;
            member.inventory.forEach(function (item, index) {
                if (!item.name) return;
                result.push(inventoryItem(item, member, index));
            });
        });
        Object.keys(player.inv || {}).forEach(function (slot) {
            var item = player.inv[slot];
            if (item && item.name && item.quantity !== 0)
                result.push(snapshot(item, "inventory:" + slot, "Your inventory"));
        });
        var bounds = map.bounds();
        if (bounds) for (var y = bounds.top; y <= bounds.bottom; y++)
            for (var x = bounds.left; x <= bounds.right; x++) {
                var cell = map.get(x, y);
                if (cell.item_name && map.visible(cell)) result.push({ id: "ground:" + x + ":" + y,
                    name: cell.item_name, description: cell.item_description || "",
                    source: "Nearby ground · " + x + ", " + y });
            }
        chat.set_items(result);
        return result;
    }
    function inventoryItem(item, member, index) {
        return snapshot(item, "party:" + member.slot + ":" + (item.slot === undefined ? index : item.slot),
            member.name + (item.equipped ? " · Equipped" : " · Inventory"));
    }
    $(document).on("chat_items_requested.context", collect)
        .on("game_cleanup.context", function () { party = null; chat.set_items([]); });
    return {
        update: function (state) {
            party = state;
            var picker = document.getElementById("chat_item_picker");
            if (picker && !picker.hidden) collect();
        },
        collect: collect,
        inventory_item: inventoryItem
    };
});
