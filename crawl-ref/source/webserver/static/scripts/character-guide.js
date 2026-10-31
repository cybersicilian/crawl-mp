/* Read-only race/class guidance. Selection and native room commands stay authoritative. */
define(["jquery", "character-catalog", "item-properties", "starting-sheet", "rich-text"], function ($, catalog, artwork, sheet, richText) {
    "use strict";
    var dialog, activeCard, activeKind = "species", opener, lobbyObserver;
    var kinds = {
        build: { label: "Starting sheet" },
        species: { selector: ".party-slot-species", label: "Species", icon: "trait" },
        jobs: { selector: ".party-slot-job", label: "Background", icon: "book" }
    };
    var attributes = { str: { label: "Strength", icon: "strength" },
        int: { label: "Intelligence", icon: "intelligence" }, dex: { label: "Dexterity", icon: "dexterity" } };

    function element(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function record(kind, name) { return (catalog[kind] || {})[name]; }
    function choice(card, kind) {
        if (kind === "build") return JSON.stringify(sheet.read(card));
        var select = card.querySelector(kinds[kind].selector);
        return select ? select.value : "";
    }
    function signed(value) { return value > 0 ? "+" + value : String(value); }
    function summary(description, kind) {
        var text = String(description || "").replace(/\s+/g, " ").trim();
        var sentences = text.match(/[^.!?]+[.!?](?:\s|$)/g) || [text];
        // Prefer a native sentence about play over an introductory ancestry sentence.
        var useful = kind === "species" ? sentences.filter(function (sentence) {
            return /\b(can|excel\w*|magic|combat|claw\w*|dig\w*|frail|fragile|regenerat\w*|refus\w*|resist\w*|adept|train\w*|strong|fast|poison\w*|health|armour|weapon\w*|stealth|flight)\b/i.test(sentence);
        }) : [];
        return String(useful[0] || sentences[0]).trim();
    }
    function section(parent, heading, icon) {
        var node = element("section", "character-guide-section");
        var title = element("h3");
        title.appendChild(artwork.icon(icon || "book"));
        title.appendChild(document.createTextNode(heading));
        node.appendChild(title);
        parent.appendChild(node);
        return node;
    }
    function list(parent, values) {
        var items = (values || []).filter(function (value) { return typeof value === "string" && value.trim(); });
        if (!items.length) return;
        var node = element("ul", "character-guide-list");
        items.forEach(function (value) { node.appendChild(element("li", "", value)); });
        parent.appendChild(node);
    }
    function numbers(parent, values, bonuses) {
        var row = element("dl", "character-guide-numbers");
        Object.keys(values || {}).forEach(function (key) {
            if (typeof values[key] !== "number") return;
            var cell = element("div");
            var term = element("dt");
            if (attributes[key]) term.appendChild(artwork.icon(attributes[key].icon));
            var label = key.replace(/_/g, " ").replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
            term.appendChild(document.createTextNode(attributes[key] ? attributes[key].label : label));
            cell.appendChild(term);
            cell.appendChild(element("dd", "", bonuses ? signed(values[key]) : values[key]));
            row.appendChild(cell);
        });
        if (row.childElementCount) parent.appendChild(row);
    }
    function renderDetails() {
        if (!activeCard || !dialog) return;
        var name = choice(activeCard, activeKind), data = record(activeKind, name);
        dialog.dataset.choice = activeKind + "|" + name + "|" + sheet.read(activeCard).multiplayer;
        var title = dialog.querySelector("#character_guide_title");
        title.textContent = activeKind === "build" ? sheet.read(activeCard).name : name || "Character guide";
        dialog.querySelector(".character-guide-eyebrow").textContent = activeKind === "build" ? "Starting character sheet" : activeKind === "species" ? "Species guide" : "Background guide";
        var hero = activeCard.querySelector(".party-slot-name");
        dialog.querySelector(".character-guide-context").textContent = "Choosing for " + (hero && hero.value ? hero.value : "your hero");
        Object.keys(kinds).forEach(function (kind) {
            var tab = dialog.querySelector("[data-guide-tab='" + kind + "']");
            tab.textContent = kind === "build" ? kinds[kind].label : kinds[kind].label + " · " + choice(activeCard, kind);
            tab.setAttribute("aria-selected", String(kind === activeKind));
            tab.tabIndex = kind === activeKind ? 0 : -1;
        });
        var body = dialog.querySelector(".character-guide-body");
        sheet.capture(body, activeCard);
        document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss"));
        dialog.classList.toggle("character-starting-sheet", activeKind === "build");
        dialog.querySelector(".character-guide-tabs").hidden = activeKind === "build";
        body.classList.toggle("starting-sheet-body", activeKind === "build");
        body.classList.toggle("party-insp-body", activeKind === "build");
        body.setAttribute("role", activeKind === "build" ? "region" : "tabpanel");
        body.replaceChildren();
        body.removeAttribute("aria-label");
        body.setAttribute("aria-labelledby", "character_guide_tab_" + activeKind);
        if (activeKind === "build") {
            body.removeAttribute("aria-labelledby");
            body.setAttribute("aria-label", "Starting character sheet");
            sheet.render(body, activeCard, { onGuide: function (kind) { activeKind = kind; renderDetails(); } });
            body.scrollTop = 0;
            return;
        }
        if (!data) {
            body.appendChild(element("p", "character-guide-description", "No description is available for this selection."));
            return;
        }
        var description = element("div", "character-guide-description");
        description.innerHTML = richText.render(data.description);
        body.appendChild(description);
        if (data.stats && Object.keys(data.stats).length) {
            var statSection = section(body, activeKind === "species" ? "Species base attributes" : "Attribute bonuses", "strength");
            numbers(statSection, data.stats, activeKind === "jobs");
        }
        if ((data.traits || []).length) list(section(body, "Racial traits", "trait"), data.traits);
        if ((data.equipment || []).length) {
            var equipment = section(body, "Background equipment", "loot");
            list(equipment, data.equipment);
            equipment.appendChild(element("p", "character-guide-note", "Your species and starting weapon choice can change the equipment you receive."));
        }
        var multiplayer = sheet.read(activeCard).multiplayer;
        var startingSpells = (data.spells || []).filter(function (name) {
            var mode = (catalog.spell_modes || {})[name];
            return multiplayer || !mode || !mode.multiplayer_only;
        });
        if (startingSpells.length) {
            var spells = section(body, "Starting spell access", "spark");
            list(spells, startingSpells);
            spells.appendChild(element("p", "character-guide-note", "These spells are available through the starting background. Native species rules determine which are memorized."));
        }
        if (data.skills && Object.keys(data.skills).length) {
            numbers(section(body, "Starting skills", "blade"), data.skills, false);
        }
        if ((data.recommended || []).length) {
            var heading = activeKind === "species" ? "Recommended backgrounds" : "Recommended species";
            list(section(body, heading, "ready"), data.recommended);
        }
        if (data.aptitudes && Object.keys(data.aptitudes).length) {
            var details = element("details", "character-guide-aptitudes");
            details.appendChild(element("summary", "", "Training aptitudes"));
            details.appendChild(element("p", "character-guide-note", "Positive values train faster. Negative values train slower. Zero is the standard rate."));
            if (data.name === "Djinni") details.appendChild(element("p", "character-guide-note",
                "Magic training is shared across spell schools; spells are learned naturally."));
            numbers(details, data.aptitudes, true);
            body.appendChild(details);
        }
        body.scrollTop = 0;
    }
    function close() { if (dialog && dialog.open) dialog.close(); }
    window.addEventListener("native-start-updated", function (event) {
        if (dialog && dialog.open && activeCard && activeKind === "build"
            && event.detail === sheet.previewKey(sheet.read(activeCard))) renderDetails();
    });
    function ensureDialog() {
        if (dialog) return;
        dialog = element("dialog", "character-guide-dialog character-side-sheet");
        dialog.id = "character_guide_dialog";
        dialog.setAttribute("aria-labelledby", "character_guide_title");
        var header = element("header", "character-guide-header party-insp-header");
        var crest = element("div", "character-guide-crest");
        crest.appendChild(artwork.icon("book"));
        header.appendChild(crest);
        var heading = element("div", "character-guide-heading party-insp-title-wrap");
        heading.appendChild(element("p", "character-guide-eyebrow"));
        var title = element("h2"); title.id = "character_guide_title"; title.tabIndex = -1;
        heading.appendChild(title);
        heading.appendChild(element("p", "character-guide-context"));
        header.appendChild(heading);
        var dismiss = element("button", "character-guide-close party-insp-close-btn", "Close");
        dismiss.type = "button";
        dismiss.setAttribute("aria-label", "Close character guide");
        dismiss.addEventListener("click", close);
        header.appendChild(dismiss);
        dialog.appendChild(header);
        var tabs = element("div", "character-guide-tabs");
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Character guides");
        Object.keys(kinds).forEach(function (kind) {
            var tab = element("button");
            tab.type = "button";
            tab.id = "character_guide_tab_" + kind;
            tab.dataset.guideTab = kind;
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-controls", "character_guide_body");
            tab.addEventListener("click", function () { activeKind = kind; renderDetails(); });
            tab.addEventListener("keydown", function (event) {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                var tabsInOrder = Object.keys(kinds), index = tabsInOrder.indexOf(activeKind);
                activeKind = event.key === "Home" ? tabsInOrder[0] : event.key === "End" ? tabsInOrder[tabsInOrder.length - 1]
                    : tabsInOrder[(index + (event.key === "ArrowLeft" ? tabsInOrder.length - 1 : 1)) % tabsInOrder.length];
                renderDetails();
                tabs.querySelector("[aria-selected='true']").focus();
            });
            tabs.appendChild(tab);
        });
        dialog.appendChild(tabs);
        var body = element("div", "character-guide-body");
        body.id = "character_guide_body";
        body.setAttribute("role", "tabpanel");
        body.tabIndex = 0;
        dialog.appendChild(body);
        // The native lobby's Escape handler must not cancel the dialog's own key handling.
        ["keydown", "keypress"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        dialog.addEventListener("close", function () {
            if (activeCard && activeKind === "build") sheet.capture(dialog.querySelector(".character-guide-body"), activeCard);
            document.dispatchEvent(new CustomEvent("lobby-tooltip-dismiss"));
            activeCard = null;
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        });
        dialog.addEventListener("click", function (event) {
            if (event.target !== dialog) return;
            var rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
        });
        document.body.appendChild(dialog);
    }
    function open(card, kind, button) {
        ensureDialog();
        activeCard = card; activeKind = kind; opener = button;
        renderDetails();
        dialog.showModal();
        dialog.querySelector("h2").focus();
    }
    function updateCard(card) {
        if (!card.querySelector(".party-starting-sheet")) {
            var start = element("button", "party-starting-sheet", "Starting sheet");
            start.type = "button";
            start.setAttribute("aria-haspopup", "dialog");
            start.setAttribute("aria-controls", "character_guide_dialog");
            start.addEventListener("click", function () { open(card, "build", start); });
            card.querySelector(".party-slot-identity").appendChild(start);
        }
        Object.keys(kinds).forEach(function (kind) {
            if (!kinds[kind].selector) return;
            var select = card.querySelector(kinds[kind].selector);
            if (!select) return;
            var name = select.value, data = record(kind, name);
            var note = select.parentElement.querySelector(".character-choice-note");
            if (!note) {
                note = element("div", "character-choice-note");
                var copy = element("p", "character-choice-copy");
                copy.id = "character_choice_" + card.dataset.slot + "_" + kind;
                note.appendChild(copy);
                var button = element("button", "character-choice-details");
                button.type = "button";
                button.appendChild(artwork.icon(kinds[kind].icon));
                button.appendChild(element("span", "", "Guide"));
                button.setAttribute("aria-haspopup", "dialog");
                button.setAttribute("aria-controls", "character_guide_dialog");
                button.addEventListener("click", function () { open(card, kind, button); });
                var fieldHeading = element("div", "party-field-heading");
                var label = select.parentElement.querySelector("label");
                if (label) { label.before(fieldHeading); fieldHeading.appendChild(label); }
                else select.before(fieldHeading);
                fieldHeading.appendChild(button);
                select.parentElement.appendChild(note);
                var described = (select.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
                if (described.indexOf(copy.id) < 0) described.push(copy.id);
                select.setAttribute("aria-describedby", described.join(" "));
            }
            if (note.dataset.selection === name) return;
            note.dataset.selection = name;
            var text = summary(data && data.description, kind);
            note.querySelector("p").textContent = text || "Choose a selection to read its description.";
            var details = select.parentElement.querySelector(".character-choice-details");
            details.disabled = !data;
            details.setAttribute("aria-label", "Read about " + name + " " + kinds[kind].label.toLowerCase());
        });
    }
    function refresh(grid) {
        grid = grid || document.getElementById("party_slots_grid");
        if (!grid) return;
        grid.querySelectorAll(".party-slot-box").forEach(updateCard);
        if (activeCard && dialog && dialog.open &&
            dialog.dataset.choice !== activeKind + "|" + choice(activeCard, activeKind) + "|" + sheet.read(activeCard).multiplayer) renderDetails();
    }
    function init(grid) {
        if (!grid) return;
        ensureDialog();
        refresh(grid);
        if (grid.dataset.characterGuideBound) return;
        grid.dataset.characterGuideBound = "true";
        grid.addEventListener("change", function (event) {
            var card = event.target.closest(".party-slot-box");
            if (card) updateCard(card);
        });
        var footer = document.getElementById("party_room_footer"), view = document.getElementById("party_room_view");
        // Legacy markup keeps the launch bar as a grid sibling; the squad screen mounts it in the command bar.
        if (footer && footer.parentElement === grid.parentElement) grid.parentElement.insertBefore(footer, grid);
        (view || grid.parentElement).classList.add("character-guides-active");
        var lobby = document.getElementById("lobby");
        if (lobby && !lobbyObserver) {
            lobbyObserver = new MutationObserver(function () { if (getComputedStyle(lobby).display === "none") close(); });
            lobbyObserver.observe(lobby, { attributes: true, attributeFilter: ["style"] });
        }
    }
    return { init: init, refresh: refresh, openSheet: function (card, button) { open(card, "build", button); } };
});
