define(["jquery", "./party-model", "./quickbar-model", "./workflow-actions", "./hud-inventory", "./status-icons", "./party-power-cards", "./power-art", "spell-cost", "./menu-keyboard", "client", "./frame-update", "./quickbar-commands", "./context-menu", "./item-context-menu", "./native-tile-art"],
function ($, party, model, actions, inventory, icons, powerCards, powerArt, spellCost, keyboard, client, frameUpdate, commands, menus, itemMenus, nativeArt) {
    "use strict";
    var slots = model.normalize(), heroKey = "", memory = {}, selected = null;
    var kind = "command", query = "", signature = "", searchOnOpen = false;
    var storagePrefix = "dcss.quickbar.v1.";
    var heldShortcuts = new Set();
    function releaseShortcuts() { heldShortcuts.clear(); }
    function shortcutEvent(event) {
        var physicalKey = event.code || event.key;
        // Keep a held shortcut from becoming native input after its action
        // changes the input mode (for example, entering targeting).
        if (heldShortcuts.has(physicalKey)) {
            if (event.type === "keyup") heldShortcuts.delete(physicalKey);
            keyboard.consume(event); return;
        }
        if (event.type !== "keydown" || event.defaultPrevented || event.isComposing
            || event.ctrlKey || event.altKey || event.metaKey
            || event.location === 3 || /^Numpad/.test(event.code || "")
            || keyboard.typing(event.target) || $(event.target).closest("#chat").length
            || !$("#dcss_quick_dock").is(":visible") || !actions.ready() || client.is_watching()
            || $("#ui-stack > *, dialog[open]").length) return;
        var index = model.keyIndex(event.shiftKey && /^Digit[0-9]$/.test(event.code || "")
            ? event.code.slice(-1) : event.key), hero = member();
        if (index < 0 || !hero) return;
        load(hero);
        if (!slots[index] || event.shiftKey && !quickCast(slots[index], model.resolve(hero, slots[index]))) return;
        heldShortcuts.add(physicalKey);
        keyboard.consume(event);
        if (!event.repeat) activate(slots[index], event.shiftKey);
    }
    function bindShortcuts(enabled) {
        var method = enabled ? "addEventListener" : "removeEventListener";
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            document[method](type, shortcutEvent, true);
        });
        window[method]("blur", releaseShortcuts);
        releaseShortcuts();
    }
    function member() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (hero) { return hero.slot === party.controlledSlot(state); });
    }
    function fitTray() {
        var dock = document.getElementById("dcss_quick_dock"), tray = document.getElementById("quickbar_more_content");
        if (!dock || !tray) return;
        var edge = dock.classList.contains("hud-floating") || getComputedStyle(dock).position === "fixed" ? window.innerWidth - 8
            : Math.min(dock.parentElement.getBoundingClientRect().right, window.innerWidth - 8);
        tray.style.maxWidth = Math.max(26, edge - dock.getBoundingClientRect().left - 6) + "px";
    }
    function identity(hero) { return hero && (hero.player_id || "session:" + hero.slot); }
    function load(hero) {
        var key = identity(hero); if (heroKey === key) return;
        heroKey = key; selected = null;
        var saved = memory[key];
        if (!saved && hero.player_id) {
            try { saved = JSON.parse(localStorage.getItem(storagePrefix + key)); } catch (_) { /* Session-only storage. */ }
        }
        slots = model.normalize(saved);
    }
    function save() {
        memory[heroKey] = slots;
        var hero = member();
        if (hero && hero.player_id) {
            try { localStorage.setItem(storagePrefix + heroKey, JSON.stringify(slots)); } catch (_) { /* Keep the live assignment. */ }
        }
    }
    function blocked(hero, binding, entry) {
        if (!entry) return binding.kind === "item" && binding.last_item
            ? hero.inventory_known === false ? "Inventory information unavailable." : "Out of stock. This slot will be ready when replenished."
            : "This inventory slot is empty or this power is no longer available.";
        return binding.kind === "item" ? actions.reason(hero) || (binding.action && entry.blocked_reason) : actions.powerReason(hero, entry, binding.kind);
    }
    function quickCast(binding, entry) {
        return binding && binding.kind === "spell" && binding.quick_cast === true && entry && entry.quick_cast === true;
    }
    function activate(binding, manualAim) {
        var hero = member(), entry = model.resolve(hero, binding);
        if (!entry || blocked(hero, binding, entry)) return;
        var focused = document.activeElement;
        if (focused && $(focused).closest("#dcss_quick_dock").length) focused.blur();
        document.getElementById("quickbar_more").open = false;
        if (binding.kind === "item") actions.itemAction(hero, entry, false);
        else actions.usePower(hero, entry, binding.kind, Boolean(!manualAim && quickCast(binding, entry)));
    }
    function assign(index, value) {
        if (!member() || index < 0 || index >= model.count) return;
        var valid = model.binding(value);
        if (value && (!valid || !model.resolve(member(), valid))) return;
        slots[index] = model.remember(member(), valid); save(); selected = null; update(true);
    }
    function edit(index) {
        selected = index;
        if (kind === "command") {
            kind = "item"; query = ""; document.getElementById("quickbar_search").value = "";
        }
        var more = document.getElementById("quickbar_more");
        more.open = true; update(true);
        document.getElementById("quickbar_search").focus({ preventScroll: true });
    }
    function symbol(hero, binding, entry, remembered) {
        if (binding.kind !== "item") return powerArt.create(entry, binding.kind);
        var fallback = inventory.itemIcon(entry);
        if (binding.kind === "item") {
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            canvas.setAttribute("aria-hidden", "true");
            if (remembered ? nativeArt.draw(canvas, entry.art) : inventory.drawTile(canvas, entry, hero)) return canvas;
        }
        return icons.icon(fallback);
    }
    function contextMenu(hero, binding, entry, extras) {
        var expected = JSON.stringify([hero.slot, hero.place, hero.pos, binding, entry]);
        var contextItem = binding && binding.action && entry
            ? hero.inventory.find(function (item) { return item.uid === entry.uid; }) : entry;
        var spec = binding && binding.kind === "item" && contextItem ? itemMenus.inventory(hero, contextItem)
            : { title: entry ? entry.name : binding && binding.last_item ? binding.last_item.name : "Quick action", entries: entry ? [{ label: quickCast(binding, entry) ? "Quick cast" : binding.kind === "spell" ? "Cast" : "Use",
                disabled: blocked(hero, binding, entry), run: function () { activate(binding); } }] : [] };
        if (quickCast(binding, entry)) spec.entries.push({ label: "Aim spell manually", disabled: blocked(hero, binding, entry),
            run: function () { activate(binding, true); } });
        var valid = spec.valid;
        spec.valid = function () {
            var latest = member();
            return latest && expected === JSON.stringify([latest.slot, latest.place, latest.pos, binding, model.resolve(latest, binding)])
                && (!valid || valid());
        };
        spec.entries = spec.entries.concat(extras);
        return spec;
    }
    function castingPreference(index, binding, entry) {
        if (!binding || binding.kind !== "spell" || !entry || entry.quick_cast !== true) return [];
        return [{ label: binding.quick_cast ? "Use manual aiming" : "Enable Quick cast",
            detail: "One activation uses the native target. Shift+number aims manually. Native warnings still apply.",
            run: function () {
                assign(index, Object.assign({}, binding, { quick_cast: !binding.quick_cast }));
            } }];
    }
    function decorate($button, hero, binding, entry, remembered) {
        if (binding.kind !== "item") powerCards.attach($button, entry, binding.kind === "spell" ? "Spell" : "Ability");
        else $button.attr({ "data-tip-title": entry.name, "data-tip-body": [entry.cost, entry.description].filter(Boolean).join(" · ") || (entry.letter ? "Inventory slot " + entry.letter : "Remembered item"),
            "data-tip-badge": entry.kind_name || "Item" });
        return $button.append(symbol(hero, binding, entry, remembered));
    }
    function renderSlots(hero) {
        var focused = document.activeElement.id;
        var $bank = $("#quickbar_slots");
        if (window.dcss_tooltips && $bank.find("[aria-describedby~='dcss_rich_tooltip']").length)
            window.dcss_tooltips.hide();
        $bank.empty();
        var firstEmpty = slots.indexOf(null);
        slots.forEach(function (binding, index) {
            // Empty capacity stays in storage, with one visible add/drop target.
            if (!binding && index !== firstEmpty && index !== selected) return;
            var entry = model.resolve(hero, binding), unavailable = binding && blocked(hero, binding, entry);
            var displayEntry = entry || binding && binding.last_item;
            var depleted = binding && binding.kind === "item" && !entry && displayEntry && hero.inventory_known;
            var key = model.shortcut(index);
            var quick = quickCast(binding, entry);
            var label = !binding ? "Add quick action" : displayEntry ? displayEntry.name : "Unavailable action";
            var hint = quick ? "Quick cast · Shift+" + key + " to aim · Right-click for actions · Shift+click to reassign"
                : "Click to use · Right-click for actions · Shift+click to reassign";
            var $button = $("<button type='button' class='hud-quick-slot'></button>")
                .attr({ id: "quickbar_slot_" + index, "data-quick-slot": index,
                    "aria-label": label + (depleted ? " · 0 remaining" : "") + (binding ? " · quick slot " + (index + 1) + " · key " + key : "")
                        + (quick ? " · Quick cast · Shift+" + key + " to aim manually" : ""),
                    "aria-keyshortcuts": binding ? key + (quick ? " Shift+" + key : "") : "", "data-tip-key": binding ? key : "",
                    "aria-disabled": String(Boolean(unavailable)), "data-tip-title": label,
                    "data-tip-meta": unavailable || "Click to use · Right-click for actions · Shift+click to reassign · Drag an item or power here" })
                .toggleClass("is-empty", !binding).toggleClass("is-selected", selected === index)
                .on("click", function (event) {
                    event.stopPropagation();
                    if (!binding || event.shiftKey) edit(index); else activate(binding);
                })
                .on("keydown", function (event) {
                    if (event.shiftKey && event.key === "Enter") { event.preventDefault(); edit(index); }
                });
            menus.bind($button, function () {
                var spec = contextMenu(hero, binding, entry, castingPreference(index, binding, entry).concat([
                    { label: binding ? "Reassign quick slot" : "Assign quick action", run: function () { edit(index); } }
                ]));
                if (binding) spec.entries.push({ label: "Clear quick slot", run: function () { assign(index, null); } });
                return spec;
            });
            if (binding && displayEntry) {
                decorate($button, hero, binding, displayEntry, !entry);
                $button.attr("data-tip-meta", unavailable || hint);
                if (quick) $button.append($("<span class='quickbar-cast-mode' aria-hidden='true'>Q</span>"));
                if (binding.kind === "item" && (depleted || entry && entry.qty > 1))
                    $button.append($("<span class='quickbar-quantity quickbar-item-quantity'></span>").text(depleted ? 0 : entry.qty));
                if (binding.kind === "spell") $button.append($("<span class='quickbar-quantity'></span>").text(spellCost.format(entry)));
            } else $button.append(icons.icon(binding ? "slot-missing" : "slot-add"));
            if (binding) $button.append($("<kbd class='quickbar-key' aria-hidden='true'></kbd>").text(key));
            $bank.append($button);
        });
        var previous = document.getElementById(focused); if (previous) previous.focus({ preventScroll: true });
        $(document).trigger("quickbar_bindings_changed", [slots.map(function (binding, index) {
            return binding ? model.shortcut(index) : "";
        }).filter(Boolean)]);
    }
    function pin(binding) {
        var index = selected === null ? slots.indexOf(null) : selected;
        if (index < 0) { edit(0); return; }
        assign(index, binding);
    }
    function renderCatalog() {
        var hero = member(); if (!hero || !document.getElementById("quickbar_catalog")) return;
        var $list = $("#quickbar_catalog"), scroll = $list.scrollTop(), focused = document.activeElement.id;
        var commandCount = commands.update(query, kind === "command", selected !== null);
        $("#quickbar_picker_hint").text(selected === null ? kind === "command" ? "Choose a command · Search names or shortcuts" : "Use · Shift-click to pin · Drag to bar"
            : slots[selected] ? "Choose a replacement for slot " + (selected + 1) : "Choose an action for slot " + (selected + 1));
        $("#quickbar_more_content").toggleClass("is-assigning", selected !== null);
        $("#quickbar_clear").prop("hidden", selected === null);
        $("#quickbar_categories button").each(function () {
            $(this).attr("aria-pressed", String(this.dataset.quickCategory === kind))
                .prop("disabled", selected !== null && this.dataset.quickCategory === "command");
        });
        $list.empty();
        (kind === "command" ? [] : model.catalog(hero, kind, query)).forEach(function (entry) {
            var binding = { kind: kind, id: kind === "item" ? entry.slot : entry.id };
            if (kind === "item" && entry.action) { binding.action = entry.action; binding.uid = entry.uid; }
            var label = (kind === "item" ? (entry.letter || "?") + ") " : "") + entry.name;
            var $use = $("<button type='button' class='quickbar-catalog-action'></button>")
                .attr({ id: "quickbar_entry_" + kind + "_" + binding.id + (binding.action ? "_" + binding.action : ""), draggable: "true",
                    "data-quick-kind": kind, "data-quick-id": binding.id,
                    "data-quick-action": binding.action || "", "data-quick-uid": binding.uid || "",
                    "aria-label": (selected === null ? "Use " : "Assign ") + label,
                    "aria-disabled": String(selected === null && Boolean(blocked(hero, binding, entry))) })
                .on("click", function (event) {
                    if (selected !== null) { assign(selected, binding); document.getElementById("quickbar_more").open = false; }
                    else if (event.shiftKey) pin(binding);
                    else activate(binding);
                })
                .on("keydown", function (event) {
                    if (event.shiftKey && event.key === "Enter") { event.preventDefault(); pin(binding); }
                });
            menus.bind($use, function () {
                return contextMenu(hero, binding, entry, [{ label: "Add to quickbar", run: function () { pin(binding); } }]);
            });
            decorate($use, hero, binding, entry);
            $use.attr("data-tip-meta", [$use.attr("data-tip-meta"), blocked(hero, binding, entry),
                selected !== null ? "Click to assign" : "Click to use · Shift-click to pin · Drag to the bar"].filter(Boolean).join(" · "));
            if (kind === "item" && entry.qty > 1) $use.append($("<span class='quickbar-quantity quickbar-item-quantity'></span>").text(entry.qty));
            if (kind === "spell") $use.append($("<span class='quickbar-quantity'></span>").text(spellCost.format(entry)));
            $list.append($use);
        });
        if (!$list.children().length && !commandCount) $list.append($("<p class='quickbar-empty'></p>").text(
            kind === "command" ? "No matching commands." : !hero[kind === "item" ? "inventory_known" : kind === "spell" ? "spells_known" : "abilities_known"]
                ? "Action information unavailable." : query ? "No matching actions."
                : kind === "item" ? "No carried items." : kind === "spell" ? "No spells memorised." : "No active abilities."));
        $list.scrollTop(scroll);
        var previous = document.getElementById(focused); if (previous) previous.focus({ preventScroll: true });
    }
    function update(force) {
        var hero = member(); if (!hero || !document.getElementById("quickbar_slots")) return;
        party.normalize(hero); load(hero);
        var remembered = slots.map(function (binding) { return model.remember(hero, binding); });
        if (JSON.stringify(remembered) !== JSON.stringify(slots)) { slots = remembered; save(); }
        var next = JSON.stringify([hero.player_id, hero.slot, hero.inventory, hero.spells, hero.abilities,
            hero.xl, hero.hp, hero.mp, actions.reason(hero), slots, selected, kind, query, inventory.artState(hero)]);
        if (!force && next === signature) return;
        signature = next; renderSlots(hero);
        if (document.getElementById("quickbar_more").open) renderCatalog();
    }
    var refresh = frameUpdate(update);
    function init() {
        var $dock = $("#dcss_quick_dock"); if (!$dock.length) return;
        bindShortcuts(true);
        if (!document.getElementById("quickbar_slots")) {
            $dock.prepend($("<div id='quickbar_primary' role='group' aria-label='Frequent actions'></div>"),
                $("<div id='quickbar_slots' role='group' aria-label='Assigned quick actions'></div>"));
            var $more = $("<details id='quickbar_more'><summary aria-label='Command palette' data-tip-title='Command palette and quick slot assignments'></summary>"
                + "<div id='quickbar_more_content' data-tip-inline='quickbar_help'>"
                + "<div class='quickbar-picker-tools'><div id='quickbar_categories' role='group' aria-label='Action category'></div>"
                + "<input id='quickbar_search' type='search' placeholder='Find actions or commands…' aria-label='Find an action or command'>"
                + "<button id='quickbar_clear' type='button' hidden>Clear slot</button></div>"
                + "<p id='quickbar_picker_hint'></p><div class='quickbar-picker-results'>"
                + "<div id='quickbar_catalog' role='group' aria-label='Available actions'></div>"
                + "<div id='quickbar_commands' role='group' aria-label='Other game actions'></div></div>"
                + "<div id='quickbar_help' tabindex='0' aria-label='Action help'></div></div></details>");
            $more.find("summary").append(icons.icon("tray-expand")).on("click", function (event) {
                // Pointer browsing leaves gameplay keys available. Keyboard
                // activation explicitly enters the searchable command palette.
                searchOnOpen = !(event.originalEvent && event.originalEvent.detail);
            });
            $more.find("#quickbar_clear").empty().append(icons.icon("slot-clear"))
                .attr({ "aria-label": "Clear quick action", "data-tip-title": "Clear quick action" });
            [["command", "Commands", "question"], ["item", "Items", "inventory"], ["ability", "Abilities", "abilities"], ["spell", "Spells", "spells"]].forEach(function (entry) {
                $("<button type='button'></button>").append(icons.icon(entry[2]), document.createTextNode(entry[1])).attr("data-quick-category", entry[0])
                    .on("click", function () { kind = entry[0]; renderCatalog(); }).appendTo($more.find("#quickbar_categories"));
            });
            $more.on("toggle", function () {
                if (!this.open) selected = null;
                update(true);
                fitTray();
                if (window.dcss_tooltips) window.dcss_tooltips.hide();
                if (this.open && selected === null && searchOnOpen && document.activeElement === this.querySelector("summary"))
                    document.getElementById("quickbar_search").focus({ preventScroll: true });
                searchOnOpen = false;
                $(window).trigger("resize");
            });
            $more.find("#quickbar_search").on("input", function () { query = this.value; renderCatalog(); });
            $more.find("#quickbar_search").on("keydown", function (event) {
                if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || selected !== null
                    || (kind !== "command" && !query.trim()) || !["Enter", "ArrowDown"].includes(event.key)) return;
                var first = $(".quickbar-catalog-action, #quickbar_commands .dcss-dock-btn, #quickbar_commands .hud-expedition-menu > a")
                    .filter(function () { return keyboard.available(this); })[0];
                if (!first) return;
                event.preventDefault(); event.stopPropagation();
                if (!event.repeat) { if (event.key === "Enter") first.click(); else first.focus(); }
            });
            $more.find("#quickbar_clear").on("click", function () { if (selected !== null) assign(selected, null); });
            $dock.append($more);
        }
        // Move existing controls, preserving their handlers and native shortcuts.
        $dock.find(".workflow-action-group").appendTo("#quickbar_commands");
        // Primary row: the eight verbs a hero uses every floor, in play order.
        ["o", "\t", "5", "g", "<", ">", "i", "z", "a"].forEach(function (key) {
            $dock.find("[data-dock-key]").filter(function () { return this.dataset.dockKey === key; }).appendTo("#quickbar_primary");
        });
        var $commands = $("#quickbar_commands");
        $commands.find("[data-action-group='combat']").children().appendTo($commands.find("[data-action-group='character']"));
        $("#dock_chat_btn, #dock_codex_btn, #dock_save_btn, #workflow_expedition_details")
            .appendTo($commands.find("[data-action-group='expedition']"));
        var groupLabels = { exploration: "Move", character: "Inspect", expedition: "Expedition" };
        Object.keys(groupLabels).forEach(function (group) {
            $commands.find("[data-action-group='" + group + "']")
                .attr({ "data-label": groupLabels[group], "aria-label": groupLabels[group] });
        });
        commands.init();
        $dock.off(".quickbarInput").on("keydown.quickbarInput keypress.quickbarInput keyup.quickbarInput", function (event) {
            event.stopPropagation();
            if (event.key === "Escape" && document.getElementById("quickbar_more").open) {
                event.preventDefault(); document.getElementById("quickbar_more").open = false;
                document.querySelector("#quickbar_more > summary").focus();
            }
        }).on("click.quickbarInput", "#quickbar_commands .dcss-dock-btn, #quickbar_commands .hud-expedition-menu > a", function () {
            document.getElementById("quickbar_more").open = false;
            if (document.activeElement === this) this.blur();
        }).on("dragover.quickbarInput", "[data-quick-slot]", function (event) { event.preventDefault(); })
            .on("drop.quickbarInput", "[data-quick-slot]", function (event) {
                event.preventDefault();
                try {
                    var payload = JSON.parse(event.originalEvent.dataTransfer.getData("application/x-dcss-action"));
                    if (payload.hero === identity(member())) assign(Number(this.dataset.quickSlot), payload.binding);
                } catch (_) { /* Ignore unrelated drag payloads. */ }
            });
        $(document).off(".quickbar").on("dragstart.quickbar", "[data-quick-kind]", function (event) {
            var raw = { kind: this.dataset.quickKind, id: Number(this.dataset.quickId) };
            if (this.dataset.quickAction) { raw.action = this.dataset.quickAction; raw.uid = Number(this.dataset.quickUid); }
            var binding = model.binding(raw);
            if (!binding || !model.resolve(member(), binding)) { event.preventDefault(); return; }
            event.originalEvent.dataTransfer.setData("application/x-dcss-action", JSON.stringify({ hero: identity(member()), binding: binding }));
            event.originalEvent.dataTransfer.effectAllowed = "copy";
        }).on("party_state_rendered.quickbar game_actions_changed.quickbar player_state_changed.quickbar inventory_art_ready.quickbar", refresh)
            .on("game_cleanup.quickbar", function () {
                refresh.cancel(); bindShortcuts(false); slots = model.normalize();
                heroKey = ""; memory = {}; selected = null; signature = ""; searchOnOpen = false;
            });
        signature = ""; update(true);
        $(window).off("resize.quickbar").on("resize.quickbar", fitTray);
        fitTray();
    }
    return { init: init, update: update };
});
