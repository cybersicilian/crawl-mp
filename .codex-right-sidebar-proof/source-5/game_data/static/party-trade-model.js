define([], function () {
    "use strict";
    function member(state, slot) {
        return state && (state.members || []).find(function (hero) { return hero.slot === slot; });
    }
    function reason(state, giver, recipient) {
        if (!state || state.party_trade !== true) return "Trading needs updated game data.";
        if (!giver || !recipient || giver.slot === recipient.slot) return "Choose another party member.";
        if (giver.alive !== true || recipient.alive !== true || giver.ghost_haunting || recipient.ghost_haunting)
            return "Downed heroes cannot trade.";
        if (giver.place !== recipient.place) return "This party member is on another floor.";
        if (!Array.isArray(giver.trade_targets) || !giver.trade_targets.includes(recipient.slot))
            return "This party member is outside your hero's line of sight.";
        return "";
    }
    function itemReason(item) {
        if (!item || !Number.isInteger(item.slot) || !Number.isInteger(item.qty) || item.qty < 1)
            return "Item information is unavailable.";
        return item.equipped ? "Remove this item from your loadout before trading it." : "";
    }
    function packet(giver, recipient, item, quantity) {
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.qty) return null;
        return { expected_slot: giver.slot, recipient_slot: recipient.slot, slot: item.slot,
            expected_name: item.name, expected_qty: item.qty, quantity: quantity };
    }
    return { member: member, reason: reason, itemReason: itemReason, packet: packet };
});
