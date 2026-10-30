define(["jquery", "./workflow-actions"], function ($, actions) {
    "use strict";

    function render(member) {
        var bag = member.equipment_profile && member.equipment_profile.bag;
        if (!bag) return null;
        var section = $("<section class='folio-bag' aria-label='Bag contents'></section>");
        var head = $("<div class='folio-section-head'></div>");
        head.append($("<h2></h2>").text(bag.name || "Bag"),
            $("<span role='status'></span>").text(bag.used + " / " + bag.capacity + " slots"));
        var blocked = actions.reason(member) || bag.blocked_reason || "";
        var button = $("<button type='button' class='workflow-button'>Open bag</button>")
            .attr({ title: blocked || "Put items in or take items out of this bag.",
                "aria-label": "Open " + (bag.name || "bag") })
            .prop("disabled", Boolean(blocked))
            .on("click", function () { actions.openBag(member, bag); });
        head.append(button); section.append(head);
        section.append($("<p class='folio-bag-help'></p>").text(
            "Take items out before using them. Free space in the matching inventory category if it is full."));
        var items = Array.isArray(bag.items) ? bag.items : [];
        if (bag.contents_known === false)
            return section.append($("<p class='folio-empty'>Bag contents are unavailable.</p>"));
        if (!items.length) return section.append($("<p class='folio-empty'>Bag is empty.</p>"));
        var table = $("<table class='folio-bag-items'></table>")
            .append($("<thead><tr><th scope='col'>Item</th><th scope='col'>Quantity</th></tr></thead>"));
        var body = $("<tbody></tbody>");
        items.forEach(function (item) {
            body.append($("<tr></tr>").append($("<td></td>").text(item.name),
                $("<td></td>").text(item.quantity)));
        });
        return section.append(table.append(body));
    }

    return { render: render };
});
