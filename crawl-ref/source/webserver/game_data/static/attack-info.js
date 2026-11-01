/* A readable card for the engine's "@" attack, speed and damage report. */
define(["jquery", "./inspection-dialog", "item-properties", "./party-model"],
function ($, inspection, properties, model) {
    "use strict";
    function turns(aut) { return Number.isFinite(aut) ? (aut / 10).toFixed(1) : null; }
    function rating(text) {
        var match = /^\s*(\d+)\s*(.*?)\.?\s*$/.exec(text || "");
        return match ? { value: Number(match[1]), detail: match[2] } : null;
    }
    function tile(label, value, note) {
        return $("<div class='attack-info-tile'></div>").append($("<span class='attack-info-label'></span>").text(label),
            $("<strong></strong>").text(value), note ? $("<small></small>").text(note) : null);
    }
    function pace(aut) {
        if (!Number.isFinite(aut)) return "";
        return aut < 8 ? "Very quick" : aut < 10 ? "Quick" : aut === 10 ? "Average" : aut < 15 ? "Slow" : "Very slow";
    }
    function weaponBlock(entry, delay, slot) {
        var root = $("<section class='attack-info-weapon'></section>");
        root.append($("<header></header>").append($("<span class='attack-info-slot'></span>").text(slot),
            $("<h2></h2>").append(properties.render(entry.name, { focusable: false }))));
        var score = rating(entry.rating), grid = $("<div class='attack-info-grid'></div>").appendTo(root);
        grid.append(tile("Damage", score ? String(score.value) : "?", score ? "per hit, before armour" : "Unavailable"));
        grid.append(tile("Attack speed", turns(delay) ? turns(delay) + " turns" : "?", pace(delay)));
        var perTurn = score && delay > 0 ? Math.round(score.value / (delay / 10)) : null;
        grid.append(tile("Damage per turn", perTurn === null ? "?" : "≈ " + perTurn, "Compare weapons with this"));
        if (score && score.detail) root.append($("<p class='attack-info-detail'></p>").text(score.detail));
        return root;
    }
    function weapons(hero) {
        var info = hero.attack_info;
        if (info && Array.isArray(info.damage) && info.damage.length) return info.damage;
        return [{ name: String(hero.weapon || "Unarmed combat").replace(/^[a-zA-Z-]\)\s*/, "") }];
    }
    function howTo(hero) {
        var rows = [["Tab", "Attack the nearest enemy"], ["Click", "Hit an enemy next to you"],
            ["Move", "Walk into an enemy to hit it"]];
        if (hero.quiver_available !== false) rows.push(["f", "Fire or throw your quivered item"]);
        var list = $("<dl class='attack-info-how'></dl>");
        rows.forEach(function (row) {
            list.append($("<div></div>").append($("<dt></dt>").append($("<kbd></kbd>").text(row[0])), $("<dd></dd>").text(row[1])));
        });
        return $("<section></section>").append($("<h2>How to attack</h2>"), list);
    }
    function build(hero) {
        var root = $("<div class='attack-info'></div>"), delay = hero.atk_aut;
        weapons(hero).forEach(function (entry, index) {
            root.append(weaponBlock(entry, delay, index ? "Off hand" : "Main hand"));
        });
        var info = hero.attack_info;
        if (info && info.delay) root.append($("<p class='attack-info-note'></p>").text(info.delay));
        var facts = $("<div class='attack-info-grid'></div>");
        facts.append(tile("Movement", turns(hero.move_delay_aut) ? turns(hero.move_delay_aut) + " turns" : "?", pace(hero.move_delay_aut)));
        facts.append(tile("Slaying", Number.isFinite(hero.slaying) ? (hero.slaying >= 0 ? "+" : "") + hero.slaying : "?", "Bonus to every hit"));
        facts.append(tile("Strength / Dexterity", model.display(hero.str) + " / " + model.display(hero.dex), "Weapon type sets which helps"));
        root.append($("<section></section>").append($("<h2>You</h2>"), facts), howTo(hero));
        return root[0];
    }
    function open(hero) {
        if (!hero) return;
        inspection.showContent("Attack info · " + hero.name, build(hero), "Reading this takes no turn.");
    }
    return { open: open, build: build, rating: rating };
});
