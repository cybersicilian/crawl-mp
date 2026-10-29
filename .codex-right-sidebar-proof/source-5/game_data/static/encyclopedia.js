define(["jquery", "comm", "./status-icons"], function ($, comm, icons) {
    "use strict";
    // Presentation of native lookup chapters. Search and content stay engine-owned.
    var chapters = {
        Monster: ["Bestiary", "Creatures, threats, and monster lore", "eye"],
        Spell: ["Spellbook", "Magic, schools, and spell effects", "spark"],
        Skill: ["Disciplines", "Combat, magic, and adventuring skills", "blade"],
        Ability: ["Abilities", "Divine powers and innate techniques", "bolt"],
        Card: ["Arcane Deck", "Cards and their effects", "rune"],
        Item: ["Items & Equipment", "Weapons, armour, potions, and relics", "loot"],
        Feature: ["Dungeon Terrain", "Altars, stairs, traps, and features", "stairs"],
        God: ["The Pantheon", "Deities, devotion, and divine rewards", "shield"],
        Branch: ["Dungeon Atlas", "Branches and their inhabitants", "book"],
        Cloud: ["Clouds & Hazards", "Environmental effects and dangers", "flame"],
        Passive: ["Divine Passives", "The lasting benefits of devotion", "shield"],
        Status: ["Conditions", "Buffs, afflictions, and status effects", "heart"],
        Mutation: ["Mutations & Traits", "Innate gifts and transformations", "trait"],
        Bane: ["Banes", "Curses and hostile effects", "skull"],
        "Weapon Ego": ["Weapon Enchantments", "Brands and their properties", "blade"],
        "Armour Ego": ["Armour Enchantments", "Protection and special properties", "shield"],
        "Missile Ego": ["Ammunition", "Projectile brands and properties", "bolt"]
    };
    var observer, query = "";
    function search(menu) {
        if (menu.querySelector(".workflow-search")) return;
        var form = $("<form class='workflow-search' role='search'></form>");
        var input = $("<input type='search' aria-label='Search the encyclopedia' placeholder='Search monsters, items, spells, gods…' maxlength='100'>").val(query);
        form.append(input, $("<button type='submit' class='workflow-button'>Search</button>"));
        form.on("submit", function (event) {
            event.preventDefault(); event.stopPropagation(); query = input.val().trim();
            if (query) comm.send_message("lookup_search", { query: query });
        }).on("keydown keypress keyup", function (event) {
            if (event.key === "Escape") return;
            event.stopPropagation();
        });
        form.insertAfter($(menu).find(".menu_title"));
        requestAnimationFrame(function () { input.trigger("focus"); });
    }
    function decorate(root) {
        root.querySelectorAll(".menu").forEach(function (menu) {
            var title = menu.querySelector(".menu_title");
            if (!title || (!/Lookup information about:/.test(title.textContent)
                && !menu.classList.contains("tt-codex"))) return;
            menu.classList.add("tt-codex");
            if (/Lookup information about:/.test(title.textContent)) {
                title.textContent = "Dungeon Encyclopedia";
                $(title).append($("<span class='codex-subtitle'></span>")
                    .text("Search all chapters, or browse below. Knowledge costs no turn."));
            }
            search(menu);
            menu.querySelectorAll("li.selectable").forEach(function (entry) {
                if (entry.querySelector(".codex-chapter")) return;
                if (/Esc\s*-\s*Exit help lookup/.test(entry.textContent)) {
                    entry.classList.add("codex-exit");
                    return;
                }
                var match = entry.textContent.match(/^\s*([a-z])\s*-\s*(.*?)\s*$/i);
                var chapter = match && chapters[match[2]];
                if (!chapter) return;
                var copy = $("<span class='codex-chapter'></span>")
                    .append($("<strong></strong>").text(chapter[0]), $("<small></small>").text(chapter[1]));
                $(entry).empty().append(icons.icon(chapter[2]), copy,
                    $("<kbd></kbd>").text(match[1].toUpperCase()))
                    .attr({ role: "button", tabindex: 0, "aria-label": chapter[0] + ": " + chapter[1] })
                    .off("keydown.codex").on("keydown.codex", function (ev) {
                        if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            ev.stopPropagation();
                            $(this).trigger($.Event("click", { which: 1 }));
                        }
                    });
            });
        });
    }
    function init() {
        if (observer) observer.disconnect();
        var root = document.getElementById("ui-stack");
        if (!root) return;
        var queued = false;
        observer = new MutationObserver(function () {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function () { queued = false; decorate(root); });
        });
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        decorate(root);
    }
    $(document).on("game_cleanup.codex", function () { if (observer) observer.disconnect(); });
    return { init: init };
});
