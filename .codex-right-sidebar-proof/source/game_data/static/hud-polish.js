define(["jquery", "character-catalog", "./status-icons"], function ($, catalog, icons) {
    "use strict";
    // Presentation adapter: canonical native species art, no inferred equipment.
    function portraits() {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state) return;
        document.querySelectorAll("#party_hud .party-card").forEach(function (card) {
            var slot = Number(card.dataset.partySlot);
            var hero = state.members.find(function (member) { return member.slot === slot; });
            if (!hero || card.querySelector(".hud-hero-medallion")) return;
            var button = document.createElement("button"); button.type = "button";
            button.className = "hud-hero-medallion";
            button.setAttribute("aria-label", "Inspect " + hero.name);
            button.setAttribute("data-tip-title", hero.name);
            button.setAttribute("data-tip-body", hero.species + " · " + hero.job);
            button.setAttribute("data-tip-meta", "Native species illustration · Click to inspect");
            var species = catalog.species[hero.species];
            if (species && species.tile) {
                var art = document.createElement("img"); art.src = species.tile.src; art.alt = "";
                art.width = art.height = 32; button.appendChild(art);
            } else button.appendChild(icons.icon("user"));
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
    return { init: init };
});
