/* Mode-specific item presentation; all item actions remain on the existing buttons. */
define(["jquery"], function ($) {
    "use strict";
    var selected = null, owner = null;
    function decorate(button, item) {
        button.append($("<span class='first-person-item-name' aria-hidden='true'></span>").text(item.name),
            $("<span class='first-person-item-kind' aria-hidden='true'></span>").text(item.kind_name || "Item"));
        return button;
    }
    function render(root, hero, entries, drawTile) {
        root.find(".first-person-item-preview").remove();
        if (document.documentElement.dataset.expeditionView !== "first_person") return;
        var identity = JSON.stringify([hero.slot, hero.player_id]);
        if (owner !== identity) { owner = identity; selected = null; }
        var preview = $("<div class='first-person-item-preview'></div>");
        root.find(".hud-panel-body").prepend(preview);
        function show(item) {
            selected = item ? item.slot : null;
            root.find(".hud-item-slot").removeClass("is-previewed"); preview.empty();
            if (!item) { preview.append($("<p></p>").text("No items in this view")); return; }
            root.find("#hud_item_" + hero.slot + "_" + item.slot).addClass("is-previewed");
            var canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
            canvas.setAttribute("aria-hidden", "true");
            var art = $("<div class='first-person-item-art' aria-hidden='true'></div>");
            if (drawTile(canvas, item, hero)) art.append(canvas);
            else art.text("◇");
            var restriction = root.find("#hud_item_" + hero.slot + "_" + item.slot).hasClass("is-melded");
            var facts = [item.kind_name || "Item", restriction ? "Melded · inactive" : item.equipped ? "Equipped" : "In pack",
                Number.isInteger(item.qty) ? "Quantity " + item.qty : ""].filter(Boolean).join(" · ");
            var info = $("<div class='first-person-item-info'></div>").append(
                $("<strong></strong>").text(item.name), $("<small></small>").text(facts),
                $("<p></p>").text(item.description || "Inspect for known properties."));
            preview.append(art, info);
        }
        root.find(".hud-item-slot").off(".firstPersonPreview").on("pointerenter.firstPersonPreview focus.firstPersonPreview", function () {
            var slot = Number(this.dataset.quickId);
            show(entries.find(function (item) { return item.slot === slot; }));
        });
        show(entries.find(function (item) { return item.slot === selected; })
            || entries.find(function (item) { return item.equipped; }) || entries[0]);
    }
    $(document).on("game_cleanup.firstPersonInventory game_preinit.firstPersonInventory", function () { owner = selected = null; });
    return { decorate: decorate, render: render };
});
