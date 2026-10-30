define(["jquery", "character-catalog", "./status-icons", "./native-tile-art"], function ($, catalog, icons, nativeArt) {
    "use strict";
    var appearances = new WeakMap();
    function fallback(hero) {
        var species = catalog.species[hero.species];
        if (!species || !species.tile) return icons.icon("user");
        var image = document.createElement("img");
        image.src = species.tile.src; image.alt = "";
        image.width = image.height = 32;
        image.addEventListener("error", function () { image.replaceWith(icons.icon("user")); }, { once: true });
        return image;
    }
    function updateAppearance(button, hero) {
        var portrait = hero.equipment_profile && hero.equipment_profile.portrait;
        var signature = JSON.stringify([hero.species, portrait || null]);
        if (appearances.get(button) === signature) return;
        var previous = button.querySelector(".hud-hero-appearance");
        var art = nativeArt.create(portrait, hero.name + " · Current appearance", "hud-hero-appearance", fallback(hero));
        art.setAttribute("aria-hidden", "true");
        if (previous) previous.replaceWith(art);
        else button.prepend(art);
        appearances.set(button, signature);
    }
    function portraits() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state) return;
        document.querySelectorAll("#party_hud .party-card").forEach(function (card) {
            var slot = Number(card.dataset.partySlot);
            var hero = state.members.find(function (member) { return member.slot === slot; });
            if (!hero) return;
            var existing = card.querySelector(".hud-hero-medallion");
            if (existing) { updateAppearance(existing, hero); return; }
            var button = document.createElement("button"); button.type = "button";
            button.className = "hud-hero-medallion";
            button.setAttribute("aria-label", "Inspect " + hero.name);
            button.setAttribute("data-tip-title", hero.name);
            button.setAttribute("data-tip-body", hero.species + " · " + hero.job);
            button.setAttribute("data-tip-meta", "Current appearance · Click to inspect");
            updateAppearance(button, hero);
            var slotTag = document.createElement("small"); slotTag.textContent = "P" + (slot + 1);
            button.appendChild(slotTag);
            button.addEventListener("click", function (event) {
                event.stopPropagation();
                var name = card.querySelector(".party-member-name"); if (name) name.click();
            });
            ["keydown", "keypress", "keyup"].forEach(function (type) {
                button.addEventListener(type, function (event) { event.stopPropagation(); });
            });
            card.style.setProperty("--hero-accent", ["#d6b76f", "#75bab8", "#a3b77b", "#b999bc"][slot % 4]);
            (card.querySelector(".party-portrait") || card).prepend(button);
        });
    }
    function init() {
        document.querySelectorAll("#dcss_quick_dock [data-action-group]").forEach(function (group) {
            group.classList.add("hud-action-bank");
        });
        var dock = document.getElementById("dcss_quick_dock");
        if (dock) dock.setAttribute("data-hud-material", "metal");
        portraits();
    }
    $(document).on("party_state_rendered.hudPolish", portraits);
    // Atlas elements can be installed after the first party snapshot or replaced
    // when switching texture packs. Rebind the artwork to the current elements.
    $(document).on("texture_pack_changed.hudPolish", function () {
        appearances = new WeakMap();
        portraits();
    });
    return { init: init };
});
