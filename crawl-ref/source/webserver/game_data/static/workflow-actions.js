define(["jquery", "comm", "client", "./enums", "./party-model", "spell-cost", "./inspection-dialog"], function ($, comm, client, enums, model, spellCost, inspection) {
    "use strict";
    var ready = false, returning = null;
    var planning = function () { return false; };
    function state() { return window.crawl_party && window.crawl_party.state; }
    function controlledSlot() {
        return model.controlledSlot(state());
    }
    function inspectionReason(member) {
        if (!state() || !(state().snapshot_version >= 2)) return "This view needs updated game data.";
        return member && state().members.some(function (hero) { return hero.slot === member.slot; })
            ? "" : "Hero information is unavailable.";
    }
    function reason(member, queueable) {
        if (client.is_watching()) return "Join the party to use a hero's actions.";
        if (!state() || !(state().snapshot_version >= 2)) return "This action needs updated game data.";
        if (!member || member.slot !== controlledSlot())
            return member && model.canControl(state(), member.slot) ? "Take control of this hero to use their actions."
                : "You can use only your own hero's actions.";
        if (typeof member.alive !== "boolean") return "Hero availability is unavailable.";
        if (member.alive === false || member.ghost_haunting) return "This hero is downed.";
        if (!(queueable && planning()) && model.inCombat(state(), member) && (state().multiplayer ? member.can_act === false
            : !state().simultaneous_turns && member.slot !== state().active_slot))
            return "Wait for this hero's turn in the combat queue.";
        if (!ready) return "Finish or cancel the current action first.";
        return "";
    }
    function notice(text) {
        var area = document.getElementById("workflow_action_notice");
        var dialog = document.getElementById("party_inspector_modal");
        var root = document.getElementById(dialog && dialog.open ? "party_insp_body" : "dcss_quick_dock");
        if (!area) {
            area = document.createElement("p"); area.id = "workflow_action_notice";
            area.setAttribute("role", "status");
        }
        area.textContent = text;
        if (root) root.prepend(area);
        if (root && root.id === "dcss_quick_dock") $(window).trigger("resize");
    }
    function leaveFolio(restore, focusId) {
        var dialog = document.getElementById("party_inspector_modal");
        if (!dialog || !dialog.open) return;
        if (restore) returning = { slot: window.crawl_party.inspector_slot,
            tab: window.crawl_party.inspector_tab, focus: focusId || document.activeElement.id, seen: false };
        dialog.close("native-action");
    }
    function clearNotice() {
        var area = document.getElementById("workflow_action_notice");
        if (!area) return;
        var docked = area.parentNode && area.parentNode.id === "dcss_quick_dock";
        area.remove();
        if (docked) $(window).trigger("resize");
    }
    function restore() {
        if (!returning || !returning.seen || !ready || $("#ui-stack").children().length) return;
        var target = returning; returning = null;
        if (window.crawl_party.open_inspector) {
            window.crawl_party.open_inspector(target.slot, target.tab);
            var button = document.getElementById(target.focus);
            window.crawl_party.inspector_focus = target.focus;
            if (button) button.focus({ preventScroll: true });
        }
    }
    function describe(member, item) {
        var unavailable = inspectionReason(member);
        if (unavailable) { notice(unavailable); return; }
        if (!item || !Number.isInteger(item.slot)) { notice("Item identity is unavailable."); return; }
        clearNotice();
        // Snapshot descriptions are personal browser views. They never acquire
        // the engine's shared prompt or wait behind a turn-consuming action.
        if (reason(member)) {
            inspection.show(item.name, item.description || item.desc,
                "Known inventory of " + member.name + ". Viewing takes no turn.");
            return;
        }
        var focusId = document.activeElement && document.activeElement.id;
        leaveFolio(true, /^party_(item|loadout)_/.test(focusId) ? focusId : "party_item_" + member.slot + "_" + item.slot);
        comm.send_message("inv_item_describe", { slot: item.slot, expected_slot: member.slot,
            expected_name: item.name });
    }
    function power(member, entry, kind, quickCast) {
        var unavailable = powerReason(member, entry, kind);
        if (!unavailable && quickCast && (kind !== "spell" || entry.quick_cast !== true))
            unavailable = "Quick cast is unavailable for this spell. Use manual aiming.";
        if (unavailable) { notice(unavailable); return; }
        if (!Number.isInteger(entry.id)) { notice("Power identity is unavailable."); return; }
        clearNotice();
        var picker = document.getElementById("power_picker_dialog");
        if (picker && picker.open) picker.close("native-action");
        leaveFolio(false);
        var fields = { expected_slot: member.slot, id: entry.id,
            letter: kind === "spell" ? entry.letter : entry.hotkey, kind: kind };
        if (quickCast) fields.quick_cast = true;
        comm.send_message("power_action", fields);
    }
    function powerReason(member, entry, kind) {
        var blocked = reason(member, true) || (!Number.isInteger(entry.id) ? "Power identity is unavailable." : "");
        if (!blocked && !/^[a-zA-Z]$/.test(kind === "spell" ? entry.letter : entry.hotkey)) blocked = "Power shortcut is unavailable.";
        if (!blocked && typeof entry.blocked_reason === "string") blocked = entry.blocked_reason;
        if (!blocked && kind === "spell") {
            if (!Number.isInteger(member.xl) || !Number.isInteger(entry.level))
                blocked = "Spell level information unavailable.";
            else if (entry.level > member.xl)
                blocked = "Requires experience level " + entry.level + " (currently " + member.xl + ").";
            else blocked = spellCost.reason(member, entry);
        }
        return blocked;
    }
    function itemAction(member, item, describeOnly, operation) {
        if (describeOnly || state() && state().inventory_use !== true) { describe(member, item); return; }
        var blocked = reason(member);
        if (blocked) { notice(blocked); return; }
        if (!item || !Number.isInteger(item.slot)) return;
        var action = operation || item.action || "use";
        if (action === "assimilate") {
            blocked = assimilationReason(member, item);
            if (blocked) { notice(blocked); return; }
        } else if (action === "weave") {
            if (!item.can_weave || !Number.isInteger(item.weave_uid) || item.weave_uid <= 0) {
                notice("Enchanting is unavailable for this item."); return;
            }
        } else if (action !== "use") {
            var nativeAction = Array.isArray(item.device_actions) && item.device_actions.find(function (entry) { return entry.key === action; });
            if (!nativeAction || nativeAction.blocked_reason) { notice(nativeAction ? nativeAction.blocked_reason : "Device action is unavailable."); return; }
        }
        clearNotice(); leaveFolio(action === "assimilate" || action === "weave");
        var fields = { slot: item.slot, expected_slot: member.slot,
            expected_name: item.source_name || item.name, action: action,
            expected_uid: item.uid, expected_workshop: item.workshop_stamp };
        if (action === "assimilate") {
            fields.expected_uid = item.assimilation.uid;
            fields.expected_qty = item.qty;
        }
        if (action === "weave") fields.expected_uid = item.weave_uid;
        comm.send_message("inv_item_use", fields);
    }
    function assimilationReason(member, item) {
        var blocked = reason(member);
        if (blocked) return blocked;
        var data = item && item.assimilation;
        var ability = (member.abilities || []).find(function (entry) { return entry.name === "Assimilate"; });
        if (!data || !Number.isInteger(data.uid) || data.uid <= 0 || !Number.isInteger(item.qty) || item.qty <= 0 || !ability)
            return "Assimilation is unavailable for this item.";
        return ability.blocked_reason || data.blocked_reason || "";
    }
    function itemUnequipVerb(item) {
        return /weapon|stave|staff/i.test(item.kind_name || "") ? "Unwield"
            : /armour|armor/i.test(item.kind_name || "") ? "Take off" : "Remove";
    }
    function itemVerb(item) {
        if (!state() || state().inventory_use !== true) return "Inspect";
        var kind = item.kind_name || "";
        return /potion/i.test(kind) ? "Quaff" : /scroll/i.test(kind) ? "Read"
            : /wand|miscellan/i.test(kind) ? "Evoke"
            : item.equipped ? itemUnequipVerb(item)
            : /armour|armor/i.test(kind) ? "Wear" : /weapon|stave|staff/i.test(kind) ? "Wield"
            : /jewel/i.test(kind) ? "Put on" : /missile|ammunition/i.test(kind) ? "Fire"
            : /talisman/i.test(kind) ? "Transform" : "Use";
    }
    function itemSecondaryHint(item) {
        return state() && state().inventory_secondary === true
            ? "Shift-click: " + (item.equipped ? "unequip" : "drop") + "." : "";
    }
    function itemSecondaryAction(member, item) {
        var blocked = reason(member);
        if (blocked) { notice(blocked); return; }
        if (!item || !Number.isInteger(item.slot)) return;
        if (state().inventory_secondary !== true) {
            notice("Shift-click actions need updated game data."); return;
        }
        clearNotice(); leaveFolio(true);
        if (returning) returning.waitForState = true;
        comm.send_message("inv_item_use", { slot: item.slot, expected_slot: member.slot,
            expected_name: item.name, action: item.equipped ? "unequip" : "drop" });
    }
    function button(member, entry, kind) {
        var blocked = powerReason(member, entry, kind);
        var label = kind === "spell" ? "Cast" : "Use";
        return $("<button type='button' class='workflow-button'></button>").text(label)
            .attr({ title: blocked || "Native targeting, costs, and warnings apply.",
                "data-folio-key": (kind === "spell" ? entry.letter : entry.hotkey) || "", "data-power-kind": kind,
                "aria-label": label + " " + entry.name }).prop("disabled", Boolean(blocked))
            .append($("<kbd></kbd>").text(kind === "spell" ? entry.letter : entry.hotkey))
            .on("click", function (event) { event.stopPropagation(); power(member, entry, kind); });
    }
    function context(member) {
        var controlled = member.slot === controlledSlot();
        var row = $("<div class='workflow-hero-context' role='status'></div>")
            .append($("<span></span>").text((controlled ? "Controlling " : "Inspecting ") + member.name));
        if (!controlled && !client.is_watching() && model.canControl(state(), member.slot))
            row.append($("<button type='button' class='workflow-button'>Control this hero</button>")
                .prop("disabled", member.alive === false || Boolean(member.ghost_haunting))
                .on("click", function () { comm.send_message("switch_player", { slot: member.slot }); }));
        var blocked = reason(member);
        if (blocked) row.append($("<small></small>").text(blocked));
        return row;
    }
    $(document).on("game_input_changed.workflow", function (event, mode) {
        ready = mode === enums.mouse_mode.COMMAND; restore();
        if (!ready) clearNotice();
        $(document).trigger("game_actions_changed");
    }).on("game_popup_changed.workflow", function (event, count) {
        if (returning && count) returning.seen = true;
        restore();
    }).on("party_state_rendered.workflow", function () {
        if (returning && returning.waitForState) returning.seen = true;
        restore();
    }).on("game_cleanup.workflow", function () { ready = false; returning = null; });
    comm.register_handlers({ game_action_error: function (data) {
        $(document).trigger("game_action_error", [data]);
        if (returning) returning.seen = true;
        restore(); notice(data.message || "That action is no longer available.");
    } });
    return { reason: reason, inspectionReason: inspectionReason, notice: notice, powerReason: powerReason, describe: describe, itemAction: itemAction,
        setPlanning: function (predicate) { planning = predicate; },
        itemVerb: itemVerb, itemUnequipVerb: itemUnequipVerb, assimilationReason: assimilationReason,
        itemSecondaryAction: itemSecondaryAction, itemSecondaryHint: itemSecondaryHint, usePower: power,
        powerButton: button, context: context, controlledSlot: controlledSlot,
        ready: function () { return ready; }, leaveFolio: leaveFolio };
});
