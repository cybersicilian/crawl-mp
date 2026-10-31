define(["jquery", "comm", "./workflow-actions", "./party-model", "./status-icons", "./menu-keyboard"],
function ($, comm, actions, party, icons, keyboard) {
    "use strict";
    // Native keycodes come from cmd-keys.h. Keep command metadata separate from
    // the palette presentation and route actions through the existing gates.
    var commands = [
        { id: "find", name: "Find Items", code: 6, key: "Cmd/Ctrl+F", icon: "search",
            words: "search stashes shops equipment", description: "Search discovered items and shops throughout the dungeon." },
        { id: "shopping", name: "Shopping List", code: 36, key: "$", icon: "coin",
            words: "gold money buy store wishlist", description: "Review planned purchases, or show your gold when the list is empty." },
        { id: "travel", name: "Travel to Level", code: 71, key: "G", icon: "navigate",
            words: "branch stairs go", description: "Choose a discovered destination using native dungeon travel." },
        { id: "overview", name: "Dungeon Overview", code: 15, key: "Ctrl+O", icon: "overview",
            words: "branches altars portals shops", description: "Review discovered branches, altars, portals, and shops." },
        { id: "examine", name: "Examine Surroundings", code: 120, key: "x", icon: "eye",
            words: "look inspect monster terrain", description: "Examine visible creatures and terrain without moving." },
        { id: "exclude", name: "Out of Bounds Tile", key: "X · e", icon: "danger",
            words: "exclusion exclude avoid forbidden mark unmark travel auto explore",
            description: "Choose a tile to keep auto-explore and travel out. Choose an exclusion marker to remove it. Takes no turn." },
        { id: "religion", name: "Religion", code: 94, key: "^", icon: "faith",
            words: "god piety worship", description: "Review your god, piety, and divine powers." },
        { id: "knowledge", name: "Item Knowledge", code: 92, key: "\\", icon: "book",
            words: "identified discovery identification", description: "Review known item types and discoveries." },
        { id: "runes", name: "Runes", code: 125, key: "}", icon: "rune",
            words: "collected orb progress", description: "Review the runes you have collected." },
        { id: "messages", name: "Message History", code: 16, key: "Ctrl+P", icon: "chat",
            words: "log replay recent", description: "Read previous game messages." },
        { id: "memorise", name: "Memorise Spell", code: 77, key: "M", icon: "spells",
            words: "memorize learn magic spellbook", description: "Choose a spell to learn. Native requirements and costs apply." },
        { id: "help", name: "Keyboard Help", code: 63, key: "?", icon: "question",
            words: "commands shortcuts controls keybindings", description: "Browse the native command and keyboard reference." }
    ];
    var heldFind = false, expandedDetails = new Map();
    function hero() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (member) { return member.slot === party.controlledSlot(state); });
    }
    function close() {
        var more = document.getElementById("quickbar_more");
        if (more) more.open = false;
        var focused = document.activeElement;
        if (focused && $(focused).closest("#dcss_quick_dock").length) focused.blur();
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
    }
    function run(command) {
        if (command.id === "messages" && hero() && actions.reason(hero()) && !$("dialog[open]").length) {
            close(); $(document).trigger("game_message_history"); return;
        }
        if (!hero() || actions.reason(hero()) || $("#ui-stack > *, dialog[open]").length) return;
        if (command.id === "exclude" && !window.crawl_party.state.tile_exclusions) return;
        close();
        if (command.id === "exclude") $(document).trigger("tile_exclusion_mode");
        else comm.send_message("key", { keycode: command.code });
    }
    function findShortcut(event) {
        if (heldFind && (event.code === "KeyF" || event.key.toLowerCase() === "f")) {
            if (event.type === "keyup") heldFind = false;
            keyboard.consume(event); return;
        }
        if (event.type !== "keydown" || event.defaultPrevented || event.isComposing
            || !event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== "f"
            || keyboard.typing(event.target) || $(event.target).closest("#chat").length
            || !$("#dcss_quick_dock").is(":visible") || !hero() || actions.reason(hero())
            || $("#ui-stack > *, dialog[open]").length) return;
        heldFind = true; keyboard.consume(event);
        if (!event.repeat) run(commands[0]);
    }
    function release() { heldFind = false; }
    function bind(enabled) {
        var method = enabled ? "addEventListener" : "removeEventListener";
        ["keydown", "keypress", "keyup"].forEach(function (type) { document[method](type, findShortcut, true); });
        window[method]("blur", release); release();
    }
    function init() {
        var root = document.getElementById("quickbar_commands"); if (!root) return;
        if (!document.getElementById("quickbar_utilities"))
            $("<span id='quickbar_utilities' class='workflow-action-group' data-action-group='utilities' data-label='Tools' role='group' aria-label='Tools'></span>").prependTo(root);
        commands.forEach(function (command) {
            if (document.getElementById("quickbar_command_" + command.id)) return;
            $("<button type='button' class='dcss-dock-btn'></button>")
                .attr({ id: "quickbar_command_" + command.id, "aria-label": command.name,
                    "data-command-search": command.words + " " + command.key,
                    "data-tip-title": command.name, "data-tip-key": command.key, "data-tip-body": command.description })
                .append(icons.icon(command.icon))
                .append($("<kbd class='quickbar-command-key'></kbd>").text(command.key))
                .on("click", function (event) { event.preventDefault(); event.stopPropagation(); run(command); })
                .appendTo("#quickbar_utilities");
        });
        bind(true);
        $(document).off(".quickbarCommands").on("game_cleanup.quickbarCommands", function () {
            bind(false); expandedDetails.clear();
        });
    }
    function normalize(value) { return String(value || "").toLowerCase().replace(/[+\s]+/g, " ").trim(); }
    function listed(element) { return !element.hidden && !element.closest("[hidden]") && element.style.display !== "none"; }
    function update(query, commandView, assigning) {
        var root = document.getElementById("quickbar_commands"); if (!root) return 0;
        var words = normalize(query).split(" ").filter(Boolean), count = 0;
        root.classList.toggle("quickbar-command-view", commandView || words.length > 0);
        root.classList.toggle("quickbar-filtered-out", assigning);
        root.querySelectorAll(".dcss-dock-btn, .hud-expedition-menu > a").forEach(function (button) {
            var label = button.getAttribute("aria-label") || button.textContent.trim();
            if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", label);
            if (button.tagName === "A") {
                var matchLink = words.every(function (word) { return normalize(label).includes(word); });
                button.classList.toggle("quickbar-filtered-out", !matchLink);
                if (matchLink && listed(button)) count++;
                return;
            }
            var name = button.querySelector(".quickbar-command-name");
            if (!name) { name = document.createElement("span"); name.className = "quickbar-command-name"; button.appendChild(name); }
            // Labels can change after a snapshot (for example, compact roster).
            name.textContent = label;
            var text = normalize([label, button.getAttribute("data-tip-title"), button.getAttribute("data-tip-body"),
                button.getAttribute("data-tip-key"), button.getAttribute("data-command-search"), button.getAttribute("data-dock-key")].join(" "));
            var match = words.every(function (word) { return text.includes(word); });
            button.classList.toggle("quickbar-filtered-out", !match);
            if (match && listed(button)) count++;
        });
        commands.forEach(function (command) {
            var button = document.getElementById("quickbar_command_" + command.id);
            if (!button) return;
            var blocked = hero() ? actions.reason(hero()) : "Hero information unavailable.";
            if (!blocked && command.id === "exclude" && !window.crawl_party.state.tile_exclusions)
                blocked = "Save and resume to refresh native tile controls.";
            button.disabled = Boolean(blocked);
            button.setAttribute("data-tip-meta", blocked);
        });
        root.querySelectorAll(".workflow-expedition-details").forEach(function (details) {
            var expanded = !assigning && (commandView || words.length > 0);
            if (expanded && !expandedDetails.has(details)) expandedDetails.set(details, details.open);
            if (expanded) details.open = true;
            else if (expandedDetails.has(details)) { details.open = expandedDetails.get(details); expandedDetails.delete(details); }
            var matches = Array.from(details.querySelectorAll("button, a")).some(function (button) {
                return listed(button) && !button.classList.contains("quickbar-filtered-out");
            });
            details.classList.toggle("quickbar-filtered-out", !matches);
        });
        root.querySelectorAll(".workflow-action-group").forEach(function (group) {
            var matches = Array.from(group.querySelectorAll(".dcss-dock-btn, .hud-expedition-menu > a")).some(function (button) {
                return listed(button) && !button.classList.contains("quickbar-filtered-out");
            });
            group.classList.toggle("quickbar-filtered-out", !matches);
        });
        return assigning ? 0 : count;
    }
    return { init: init, update: update };
});
