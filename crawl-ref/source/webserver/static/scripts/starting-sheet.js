/* Native snapshots presented with the same folio components as the game. */
define(["character-catalog", "item-properties", "native-start", "player-doll", "character-stat-help", "starting-entry-help", "spell-cost"], function (catalog, artwork, native, portrait, help, entries, spellCost) {
    "use strict";
    var views = new Map();
    var sections = [["character", "Character"], ["spells", "Spells"], ["traits", "Traits"], ["equipment", "Equipment"], ["skills", "Skills"]];
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function read(card) {
        function value(selector) { var node = card.querySelector(selector); return node ? node.value : ""; }
        return {
            name: value(".party-slot-name") || "Your hero", species: catalog.species[value(".party-slot-species")],
            job: catalog.jobs[value(".party-slot-job")], weapon: value(".party-slot-weapon"), trait: value(".party-slot-trait") || "none",
            seed: card.dataset.startingSeed || "", gameId: card.dataset.gameId || "", companion: card.dataset.slot !== "0",
            multiplayer: card.dataset.multiplayer === "true",
            modifiers: card.dataset.startingModifiers || "", active: !card.matches(".slot-state-open, .slot-state-closed")
        };
    }
    function heading(parent, text) { parent.appendChild(el("h3", "party-insp-section-title", text)); }
    function list(parent, values, fallback) {
        if (!values.length) { parent.appendChild(el("p", "character-guide-note", fallback)); return; }
        var node = el("ul", "character-guide-list");
        values.forEach(function (value) { node.appendChild(el("li", "", value)); }); parent.appendChild(node);
    }
    function stats(parent, keys, snapshot, name) {
        var grid = el("div", "party-insp-stat-grid starting-stat-grid");
        keys.forEach(function (key) {
            var definition = help.stats[key], value = snapshot[key];
            var box = help.explain(el("div", "party-insp-stat-box"), definition, value, name + " · Native starting value");
            box.dataset.startingStat = key;
            box.append(el("span", "lbl", definition.label), el("strong", "val", value)); grid.appendChild(box);
        });
        parent.appendChild(grid);
    }
    function resistances(parent, snapshot) {
        heading(parent, "Resistances & defenses");
        var grid = el("div", "party-insp-res-grid");
        help.resistances.filter(function (definition) { return definition.start; }).forEach(function (definition) {
            var value = snapshot.resists[definition.start], levels = help.levels(definition, value), known = levels !== null;
            var row = help.explain(el("div", "party-insp-res-row"), definition, known ? value : "Unavailable");
            var label = el("span", "party-insp-res-lbl", definition.label);
            row.setAttribute("aria-label", definition.title + ": " + (known ? value : "Unavailable"));
            row.append(label, artwork.levelIcons(definition.icon, levels)); grid.appendChild(row);
        });
        parent.appendChild(grid);
    }
    function table(parent, headers, rows, decorate) {
        var result = el("table", "party-insp-table"), head = el("thead"), tr = el("tr"), body = el("tbody");
        headers.forEach(function (text) { var th = el("th", "", text); th.scope = "col"; tr.appendChild(th); });
        head.appendChild(tr); result.append(head, body);
        rows.forEach(function (cells, index) {
            var row = el("tr"); cells.forEach(function (content) { var cell = el("td"); cell.append(content); row.appendChild(cell); });
            if (decorate) decorate(row, index);
            body.appendChild(row);
        });
        parent.appendChild(result);
    }
    function spells(parent, names, snapshot, memorized) {
        if (!names.length) { parent.appendChild(el("p", "character-guide-note", memorized ? "No memorized spells." : "No additional spells in the library.")); return; }
        table(parent, ["Spell", "Level / Cost", "Schools"], names.map(function (name) {
            var detail = (snapshot.spell_details || {})[name] || {};
            return [name, Number.isFinite(detail.level) ? "Lv " + detail.level + " / " + spellCost.format(detail) : "Unavailable", detail.schools || "Unavailable"];
        }), function (row, index) { var name = names[index]; entries.spell(row, name, (snapshot.spell_details || {})[name], memorized); });
    }
    function capture(body, card) {
        var container = body.querySelector(".starting-sheet-panels"), active = body.querySelector(".starting-sheet-tabs [aria-selected='true']");
        if (!container || !active) return;
        var id = card.dataset.slot + "|" + card.dataset.startingSeed, state = views.get(id) || { scroll: {} };
        state.tab = active.dataset.sheetTab; state.scroll[state.tab] = container.scrollTop; views.set(id, state);
    }
    function render(body, card, options) {
        var build = read(card), race = build.species, job = build.job;
        if (!race || !job) return;
        var record = native.get(build);
        if (record.status !== "ready") {
            var pending = el("p", "starting-sheet-boundary", record.status === "loading" ? "Preparing your starting character…"
                : record.status === "unavailable" ? "Reconnect to the lobby to prepare this starting character." : "The starting sheet is temporarily unavailable.");
            pending.setAttribute("role", "status"); body.appendChild(pending);
            if (record.status === "error") {
                var retry = el("button", "character-guide-close", "Try again"); retry.type = "button";
                retry.addEventListener("click", function () { native.retry(read(card)); body.replaceChildren(); render(body, card, options); }); body.appendChild(retry);
            }
            return;
        }
        var snapshot = record.snapshot, id = card.dataset.slot + "|" + build.seed;
        var state = views.get(id) || { tab: "character", scroll: {} }; views.set(id, state);
        if (views.size > 32) views.delete(views.keys().next().value);
        var tabs = el("nav", "party-insp-tab-bar starting-sheet-tabs"), container = el("div", "starting-sheet-panels");
        tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Starting character sections");
        var panels = {}, mounted = false;
        function select(key, focus) {
            if (mounted) state.scroll[state.tab] = container.scrollTop;
            mounted = true; state.tab = key;
            tabs.querySelectorAll("button").forEach(function (button) {
                var active = button.dataset.sheetTab === key;
                button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
                if (active && focus) button.focus();
            });
            Object.keys(panels).forEach(function (name) { panels[name].hidden = name !== key; });
            container.scrollTop = state.scroll[key] || 0;
            document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss"));
        }
        sections.forEach(function (section, index) {
            var button = el("button", "party-insp-tab-btn", section[1]); button.type = "button";
            button.id = "starting_tab_" + section[0]; button.dataset.sheetTab = section[0]; button.setAttribute("role", "tab");
            button.setAttribute("aria-controls", "starting_panel_" + section[0]);
            var panel = el("section", "party-insp-panel"); panel.id = "starting_panel_" + section[0]; panel.setAttribute("role", "tabpanel");
            panel.tabIndex = 0;
            panel.setAttribute("aria-labelledby", button.id); panels[section[0]] = panel;
            button.addEventListener("click", function () { select(section[0]); });
            button.addEventListener("keydown", function (event) {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                var next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowLeft" ? sections.length - 1 : 1)) % sections.length;
                select(sections[next][0], true);
            });
            tabs.appendChild(button); container.appendChild(panel);
        });
        body.append(tabs, container);
        var overview = panels.character, banner = el("div", "party-insp-banner starting-sheet-banner");
        banner.style.setProperty("--hero-accent", "var(--tt-folio-crimson)"); banner.appendChild(portrait(build));
        var identity = el("div", "starting-sheet-identity");
        identity.append(el("div", "party-insp-hero-headline", race.name + " " + job.name), el("div", "party-insp-hero-meta", "Level 1 · " + job.category));
        if (options && options.onGuide) {
            var links = el("div", "starting-guide-links");
            [["species", "Species guide"], ["jobs", "Background guide"]].forEach(function (entry) {
                var link = el("button", "party-edit-hero", entry[1]); link.type = "button";
                link.addEventListener("click", function () { options.onGuide(entry[0]); }); links.appendChild(link);
            }); identity.appendChild(links);
        }
        banner.appendChild(identity); overview.appendChild(banner);
        heading(overview, "Vitals & defenses"); stats(overview, help.combat, snapshot, build.name);
        heading(overview, "Attributes"); stats(overview, ["str", "int", "dex"], snapshot, build.name);
        resistances(overview, snapshot);
        overview.appendChild(el("p", "character-guide-note", "Your starting roll is reserved for the expedition. Values shown on neutral ground, before temporary effects."));
        heading(panels.spells, "Memorized spells"); spells(panels.spells, snapshot.memorized, snapshot, true);
        heading(panels.spells, "Other starting spell access");
        spells(panels.spells, (snapshot.library || []).filter(function (name) { return snapshot.memorized.indexOf(name) === -1; }), snapshot, false);
        panels.spells.appendChild(el("p", "character-guide-note", "The party shares its spell library, including spells brought by other heroes."));
        heading(panels.traits, "Species traits"); list(panels.traits, (race.traits || []).filter(function (trait) { return !/^At XL /.test(trait); }), "See the species guide for details.");
        heading(panels.equipment, "Starting equipment");
        table(panels.equipment, ["Item", "Status"], snapshot.inventory.map(function (item) {
            return [artwork.render(item.name), el("span", "party-insp-badge" + (item.equipped ? " equipped" : ""), item.equipped ? "Equipped" : "Carried")];
        }), function (row, index) { entries.equipment(row, snapshot.inventory[index]); });
        heading(panels.skills, "Starting skills");
        var skillNames = Object.keys(snapshot.skills);
        table(panels.skills, ["Skill", "Level", "Aptitude"], skillNames.map(function (name) {
            var detail = (snapshot.skill_details || {})[name] || {}, aptitude = detail.aptitude;
            return [name, String(snapshot.skills[name]), Number.isFinite(aptitude) ? (aptitude > 0 ? "+" : "") + aptitude : "Unavailable"];
        }), function (row, index) { var name = skillNames[index]; entries.skill(row, name, snapshot.skills[name], (snapshot.skill_details || {})[name]); });
        ["spells", "equipment", "skills"].forEach(function (key) {
            panels[key].appendChild(el("p", "character-guide-note", "Hover, focus or tap an entry for its in-game description."));
        });
        select(state.tab);
    }
    return { read: read, portrait: portrait, render: render, capture: capture, preview: native.get, retry: native.retry, previewKey: native.key };
});
