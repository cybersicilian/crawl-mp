define(["require", "jquery", "comm", "./party-model", "./party-trade-model", "./workflow-actions", "./status-icons", "item-properties", "./native-tile-art"],
function (require, $, comm, party, model, actions, icons, properties, art) {
    "use strict";
    var recipientSlot = null, query = "", pending = false, quantities = Object.create(null);
    var signature = "", opener = "", folio = null, giverSlot = null;
    function state() { return window.crawl_party && window.crawl_party.state; }
    function giver() { return model.member(state(), actions.controlledSlot()); }
    function blocked(target) { return actions.reason(giver()) || model.reason(state(), giver(), target); }
    function ensure() {
        if (document.getElementById("party_trade_dialog")) return;
        $("<link rel='stylesheet'>").attr("href", require.toUrl("./styles/party-trade.css")).appendTo("head");
        var dialog = $("<dialog id='party_trade_dialog' closedby='any' aria-labelledby='party_trade_heading'></dialog>");
        var close = $("<button type='button' id='party_trade_close'>Close · Esc</button>").on("click", function () { dialog[0].close(); });
        dialog.append($("<header class='trade-heading'></header>").append(
            $("<div><h1 id='party_trade_heading'>Trade with party</h1><p>Give items to a companion in your hero’s line of sight.</p></div>"), close));
        var recipient = $("<select id='party_trade_recipient'></select>").on("change", function () {
            recipientSlot = Number(this.value); signature = ""; render();
        });
        var search = $("<input type='search' id='party_trade_search' placeholder='Find an item…' aria-label='Search items to trade'>")
            .on("input", function () { query = this.value; filter(); });
        var swap = $("<button type='button' id='party_trade_swap'></button>").on("click", function () {
            var target = model.member(state(), recipientSlot);
            if (pending || blocked(target) || !party.canControl(state(), target.slot)) return;
            comm.send_message("switch_player", { slot: target.slot });
        });
        dialog.append($("<div class='trade-tools'></div>").append(
            $("<label>Give to </label>").append(recipient), swap, search),
            $("<p id='party_trade_context'></p>"),
            $("<p id='party_trade_notice' role='status' aria-live='polite'></p>"),
            $("<div id='party_trade_items' role='group' aria-label='Your inventory'></div>"),
            $("<p class='trade-help'>Each transfer takes one action. Unequip worn items first. Gold is shared by the party. Each player sends from their own hero.</p>"));
        dialog.on("keydown keypress keyup", function (event) { event.stopPropagation(); });
        dialog.on("close", function () {
            var restore = folio; folio = null;
            if (restore && window.crawl_party.open_inspector) window.crawl_party.open_inspector(restore.slot, restore.tab);
            var previous = document.getElementById(opener);
            if (previous) previous.focus({ preventScroll: true });
        });
        dialog.appendTo("body");
    }
    function filter() {
        var count = 0;
        $("#party_trade_items .trade-item").each(function () {
            var visible = this.dataset.itemName.toLowerCase().includes(query.toLowerCase());
            $(this).toggle(visible); if (visible) count++;
        });
        $("#party_trade_empty").text(query ? "No matching items." : "Your pack is empty.").toggle(!count);
    }
    function send(slot, all) {
        if (pending) return;
        var source = giver(), target = model.member(state(), recipientSlot);
        var item = source && source.inventory.find(function (entry) { return entry.slot === slot; });
        var reason = blocked(target) || model.itemReason(item);
        var quantity = item && (all ? item.qty : Number($("#trade_quantity_" + slot).val()));
        var packet = !reason && model.packet(source, target, item, quantity);
        if (!packet) {
            $("#party_trade_notice").text(reason || "Choose a whole quantity within this stack."); return;
        }
        pending = Date.now() + "-" + Math.random().toString(36).slice(2);
        packet.request_id = pending; signature = "";
        $("#party_trade_notice").text("Transferring…"); render();
        if (comm.send_message("party_trade", packet) === false) {
            pending = false; signature = "";
            $("#party_trade_notice").text("Connection unavailable. Reconnect before trading."); render();
        }
    }
    function row(source, target, item) {
        var reason = blocked(target) || model.itemReason(item);
        var root = $("<div class='trade-item'></div>").attr("data-item-name", item.name);
        var profile = source.equipment_profile;
        var native = profile && (profile.items || []).find(function (entry) { return entry.inv_slot === item.slot; });
        var picture = native ? art.create(native.art, "", "trade-item-art", icons.icon("inventory")) : icons.icon("inventory");
        root.append(picture, $("<div class='trade-item-copy'></div>").append(
            $("<strong></strong>").append(properties.render(item.name, { focusable: false })),
            $("<small></small>").text(reason || item.kind_name || "In pack")));
        var quantity = Math.min(item.qty, quantities[item.slot] || 1);
        var count = $("<input type='number' inputmode='numeric' min='1' step='1'>")
            .attr({ id: "trade_quantity_" + item.slot, max: item.qty, "aria-label": "Quantity of " + item.name })
            .val(quantity).prop("disabled", pending || Boolean(reason)).on("input", function () { quantities[item.slot] = Number(this.value); })
            .on("keydown", function (event) {
                if (event.key === "Enter") { event.preventDefault(); send(item.slot, false); }
            });
        var controls = $("<div class='trade-item-actions'></div>").append(count,
            $("<button type='button'>Give</button>").attr({ id: "trade_give_" + item.slot, "aria-label": "Give " + item.name,
                title: reason || "Give the selected quantity to " + target.name })
                .prop("disabled", pending || Boolean(reason)).on("click", function () { send(item.slot, false); }));
        if (item.qty > 1) controls.append($("<button type='button'>All</button>")
            .attr({ id: "trade_all_" + item.slot, "aria-label": "Give all " + item.name, title: reason || "Give the whole stack" })
            .prop("disabled", pending || Boolean(reason)).on("click", function () { send(item.slot, true); }));
        return root.append(controls);
    }
    function render() {
        var dialog = document.getElementById("party_trade_dialog");
        if (!dialog || !dialog.open) return;
        var source = giver(), target = model.member(state(), recipientSlot);
        if (!source) { dialog.close(); return; }
        if (giverSlot !== source.slot) {
            if (recipientSlot === source.slot) recipientSlot = giverSlot;
            target = model.member(state(), recipientSlot);
            giverSlot = source.slot; quantities = Object.create(null);
            $("#party_trade_notice").text("Hero changed. Trading from " + source.name + ".");
        }
        var next = JSON.stringify([source, target, (state().members || []).map(function (hero) {
            return [hero.slot, hero.name, model.reason(state(), source, hero)];
        }), state().controllable_slots, actions.reason(source), pending]);
        if (signature === next) return;
        signature = next;
        var focused = document.activeElement.id, cursor = document.activeElement.selectionStart;
        var list = $("#party_trade_items"), scroll = list.scrollTop();
        var select = $("#party_trade_recipient").empty().prop("disabled", pending);
        (state().members || []).filter(function (hero) { return hero.slot !== source.slot; }).forEach(function (hero) {
            var reason = model.reason(state(), source, hero);
            select.append($("<option></option>").val(hero.slot).text(hero.name + (reason ? " — " + reason : ""))
                .prop("disabled", Boolean(reason)));
        });
        select.val(recipientSlot);
        var reason = blocked(target);
        $("#party_trade_swap").text(target ? "Control " + target.name + " to give back" : "Control companion")
            .toggle(Boolean(target && party.canControl(state(), target.slot)))
            .prop("disabled", pending || Boolean(reason));
        $("#party_trade_context").text(source.name + " → " + (target ? target.name : "Choose a companion")
            + " · " + (reason || "In line of sight · " + target.inventory.length + " carried stacks"));
        list.empty();
        (source.inventory || []).forEach(function (item) { list.append(row(source, target, item)); });
        list.append($("<p id='party_trade_empty'></p>")); filter(); list.scrollTop(scroll);
        var previous = document.getElementById(focused);
        if (!previous || previous.disabled) previous = document.getElementById("party_trade_search");
        previous.focus({ preventScroll: true });
        if (typeof cursor === "number" && previous.type === "search") previous.setSelectionRange(cursor, cursor);
    }
    function open(slot, itemSlot) {
        ensure();
        var source = giver(); if (!source) return;
        opener = document.activeElement.id;
        var inspector = document.getElementById("party_inspector_modal");
        if (inspector && inspector.open) folio = { slot: window.crawl_party.inspector_slot, tab: window.crawl_party.inspector_tab };
        actions.leaveFolio(false);
        var preferred = model.member(state(), slot);
        var target = preferred || (state().members || []).find(function (hero) { return !model.reason(state(), source, hero); });
        recipientSlot = target ? target.slot : null;
        giverSlot = source.slot; signature = "";
        $("#party_trade_search").val(query);
        $("#party_trade_notice").text(pending ? "Transferring…" : "");
        var dialog = document.getElementById("party_trade_dialog");
        if (!dialog.open) dialog.showModal();
        render();
        var focus = document.getElementById("trade_quantity_" + itemSlot);
        if (focus && !focus.disabled) { focus.focus(); focus.select(); }
    }
    function button(slot) {
        return $("<button type='button' class='party-mini-btn party-trade-btn'>Trade</button>")
            .attr({ "data-trade-slot": slot, "aria-label": "Trade with " + model.member(state(), slot).name })
            .on("click", function (event) { event.stopPropagation(); open(slot); });
    }
    function update() {
        $(".party-trade-btn").each(function () {
            var reason = blocked(model.member(state(), Number(this.dataset.tradeSlot)));
            $(this).prop("disabled", Boolean(reason)).attr("title", reason || "Give items to this party member");
        });
        var source = giver();
        $("#hud_trade_open, #folio_trade_open").prop("disabled", !source || Boolean(actions.reason(source)) || state().party_trade !== true);
        render();
    }
    comm.register_handlers({ party_trade_result: function (data) {
        if (!pending || data.request_id !== pending) return;
        pending = false; signature = "";
        $("#party_trade_notice").text(data.message || (data.ok ? "Item transferred." : "Transfer failed."));
        render();
    } });
    // Early native input gates report through the existing action-error channel.
    $(document).on("game_action_error.partyTrade", function (event, data) {
        if (!pending || data.request_id !== pending) return;
        pending = false; signature = ""; $("#party_trade_notice").text(data.message); render();
    }).on("party_state_rendered.partyTrade game_actions_changed.partyTrade hud_inventory_ready.partyTrade", update)
        .on("party_trade_open.partyTrade", function (event, slot, itemSlot) { open(slot, itemSlot); })
        .on("game_cleanup.partyTrade", function () {
            pending = false; folio = null; query = ""; quantities = Object.create(null); signature = "";
            var dialog = document.getElementById("party_trade_dialog"); if (dialog && dialog.open) dialog.close();
        });
    return { open: open, button: button, update: update };
});
