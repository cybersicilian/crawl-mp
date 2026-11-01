define(["jquery", "comm", "./workflow-actions", "./party-model", "./status-icons", "./menu-keyboard", "./attack-info"],
function ($, comm, actions, party, icons, keyboard, attackInfo) {
    "use strict";
    // Native keycodes come from cmd-keys.h. Keep command metadata separate from
    // the palette presentation and route actions through the existing gates.
    var commands = [
        { id: "find", name: "Find Items", short: "Find", code: 6, key: "Cmd/Ctrl+F", icon: "search",
            words: "search stashes shops equipment", description: "Search discovered items and shops throughout the dungeon." },
        { id: "travel", name: "Go", dock: "G", code: 71, key: "G", icon: "navigate",
            words: "go travel walk stairs level floor branch destination where",
            description: "Walk to the nearest stairs, or choose any discovered floor or branch." },
        { id: "attack_info", name: "Attack Info", short: "Attack", key: "@", icon: "blade",
            words: "attack damage weapon speed delay character status stats",
            description: "See your damage, attack speed and how to attack. Takes no turn." },
        { id: "shopping", name: "Shopping List", short: "Shopping", code: 36, key: "$", icon: "coin",
            words: "gold money buy store wishlist", description: "Review planned purchases, or show your gold when the list is empty." },
        { id: "overview", name: "Dungeon Overview", short: "Overview", code: 15, key: "Ctrl+O", icon: "overview",
            words: "branches altars portals shops", description: "Review discovered branches, altars, portals, and shops." },
        { id: "examine", name: "Examine Surroundings", short: "Examine", code: 120, key: "x", icon: "eye",
            words: "look inspect monster terrain", description: "Examine visible creatures and terrain without moving." },
        { id: "exclude", name: "Out of Bounds Tile", short: "Exclude", key: "X · e", icon: "danger",
            words: "exclusion exclude avoid forbidden mark unmark travel auto explore",
            description: "Choose a tile to keep auto-explore and travel out. Choose an exclusion marker to remove it. Takes no turn." },
        { id: "religion", name: "Religion", code: 94, key: "^", icon: "faith",
            words: "god piety worship", description: "Review your god, piety, and divine powers." },
        { id: "knowledge", name: "Item Knowledge", short: "Knowledge", code: 92, key: "\\", icon: "book",
            words: "identified discovery identification", description: "Review known item types and discoveries." },
        { id: "runes", name: "Runes", code: 125, key: "}", icon: "rune",
            words: "collected orb progress", description: "Review the runes you have collected." },
        { id: "messages", name: "Message History", short: "Messages", code: 16, key: "Ctrl+P", icon: "chat",
            words: "log replay recent", description: "Read previous game messages." },
        { id: "memorise", name: "Memorise Spell", short: "Memorise", code: 77, key: "M", icon: "spells",
            words: "memorize learn magic spellbook", description: "Choose a spell to learn. Native requirements and costs apply." },
        { id: "help", name: "Keyboard Help", short: "Help", code: 63, key: "?", icon: "question",
            words: "commands shortcuts controls keybindings", description: "Browse the native command and keyboard reference." }
    ];
    // Dock controls a quick slot can run. The slot clicks the control itself, so its
    // handler, gate and feedback stay the only implementation of the action. Save, exit
    // and party management stay off the number keys, where a slip would be costly.
    var dockCommands = [
        { id: "explore", name: "Explore", dock: "o", key: "o", icon: "explore",
            words: "auto travel unexplored", description: "Automatically travel toward unexplored tiles and items." },
        { id: "fight", name: "Fight", dock: "\t", key: "Tab", icon: "autofight",
            words: "auto attack nearest", description: "Attack the nearest visible hostile." },
        { id: "rest", name: "Rest", dock: "5", key: "5", icon: "rest",
            words: "wait heal recover", description: "Wait to regenerate Health and Magic until full or interrupted." },
        { id: "pickup", name: "Pick Up", short: "Pick up", dock: "g", key: "g", icon: "pickup",
            words: "grab loot take", description: "Pick up items on your tile." },
        { id: "ascend", name: "Ascend Stairs", short: "Ascend", dock: "<", key: "<", icon: "stairs-up",
            words: "up climb upstairs exit", description: "Climb the staircase or exit portal on your tile." },
        { id: "descend", name: "Descend Stairs", short: "Descend", dock: ">", key: ">", icon: "stairs-down",
            words: "down downstairs enter portal", description: "Descend the staircase or enter the portal on your tile." },
        { id: "inventory", name: "Inventory", dock: "i", key: "i", icon: "inventory",
            words: "items equip pack", description: "Open your inventory to equip, use or drop items." },
        { id: "cast", name: "Cast Spell", short: "Cast", dock: "z", key: "z", icon: "spells",
            words: "magic spell", description: "Choose a memorised spell to cast." },
        { id: "ability", name: "Use Ability", short: "Ability", dock: "a", key: "a", icon: "abilities",
            words: "power god invoke", description: "Choose an active ability to use." },
        { id: "skills", name: "Skills", dock: "m", key: "m", icon: "skills",
            words: "training aptitude", description: "Review skill levels and training." },
        { id: "traits", name: "Mutations & Traits", short: "Traits", dock: "A", key: "A", icon: "trait",
            words: "species innate mutation", description: "Review species traits and mutations." },
        { id: "resists", name: "Resistances", short: "Resists", dock: "%", key: "%", icon: "shield",
            words: "overview equipment armour", description: "Review resistances and your equipment summary." },
        { id: "map", name: "Level Map", short: "Map", dock: "X", key: "X", icon: "map",
            words: "floor terrain navigate", description: "Open the map of your current floor." },
        { id: "character", name: "Hero Sheet", short: "Hero", control: "dock_party_sheet_btn", key: "I", icon: "overview",
            words: "party inspector stats character", description: "Inspect a hero's stats, buffs, abilities and equipment." },
        { id: "chat", name: "Expedition Chat", short: "Chat", control: "dock_chat_btn", key: "F12", icon: "chat",
            words: "talk message party", description: "Chat with players and spectators in this expedition." },
        { id: "codex", name: "Encyclopedia", control: "dock_codex_btn", key: "?/", icon: "codex",
            words: "lookup search monster description", description: "Search the game's descriptions. Takes no turn." }
    ];
    var heldFind = false, expandedDetails = new Map();
    function hero() {
        var state = window.crawl_party && window.crawl_party.state;
        return state && state.members.find(function (member) { return member.slot === party.controlledSlot(state); });
    }
    function all() { return dockCommands.concat(commands); }
    function entry(id) { return all().find(function (command) { return command.id === id; }) || null; }
    function control(command) {
        if (command.control) return document.getElementById(command.control);
        return command.dock ? $("#dcss_quick_dock [data-dock-key]").filter(function () { return this.dataset.dockKey === command.dock; })[0]
            : document.getElementById("quickbar_command_" + command.id);
    }
    // Palette commands share the action gate; message history stays readable between turns.
    function gate(command) {
        if (!hero()) return "Hero information unavailable.";
        if (command.id === "messages") return "";
        var blocked = actions.reason(hero());
        return !blocked && command.id === "exclude" && !window.crawl_party.state.tile_exclusions
            ? "Save and resume to refresh native tile controls." : blocked;
    }
    function reason(command) {
        if (!command.dock && !command.control) return gate(command);
        var button = control(command), unavailable = "This control is unavailable right now.";
        if (!button) return unavailable;
        return button.disabled ? button.getAttribute("data-turn-reason") || button.getAttribute("data-tip-body") || unavailable : "";
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
        else if (command.id === "travel" && document.getElementById("workflow_go_btn")) $("#workflow_go_btn").trigger("click");
        else if (command.id === "attack_info") attackInfo.open(hero());
        else comm.send_message("key", { keycode: command.code });
    }
    function activate(id) {
        var command = entry(id);
        if (!command || reason(command)) return;
        if (!command.dock && !command.control) { run(command); return; }
        close(); control(command).click();
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
        // Tray rows can be dragged to the bar. Primary buttons stay undraggable:
        // a click that drifts a few pixels must not turn into a drag and get lost.
        all().forEach(function (command) {
            var button = control(command);
            if (button && root.contains(button))
                $(button).attr({ draggable: "true", "data-quick-kind": "command", "data-quick-id": command.id });
        });
        bind(true);
        $(document).off(".quickbarCommands").on("game_cleanup.quickbarCommands", function () {
            bind(false); expandedDetails.clear();
        });
    }
    function normalize(value) { return String(value || "").toLowerCase().replace(/[+\s]+/g, " ").trim(); }
    function catalog(query) {
        var words = normalize(query).split(" ").filter(Boolean);
        return all().filter(function (command) {
            var text = normalize([command.name, command.short, command.key, command.words].join(" "));
            return words.every(function (word) { return text.includes(word); });
        });
    }
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
            var blocked = gate(command);
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
    return { init: init, update: update, all: all, entry: entry, control: control, reason: reason, activate: activate, catalog: catalog };
});
