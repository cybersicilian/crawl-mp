define(["jquery", "./tip-placement", "tooltip-content"], function ($, placement, content) {
    "use strict";
    function show(element, card, x, y) {
        var $tip = $(element).empty().attr({ role: "tooltip", "aria-hidden": "false" });
        var $title = $("<span class='dcss-tip-title'></span>");
        content.renderTitle($title[0], card.title);
        var $header = $("<div class='dcss-tip-header'></div>").append($title);
        if (card.badge) $header.append($("<span class='dcss-tip-badge'></span>").text(card.badge));
        $tip.append($header);
        var meta = card.meta;
        if (card.body || meta) {
            var $body = $("<div class='dcss-tip-body'></div>");
            meta = content.render($body[0], card.body, meta); $tip.append($body);
        }
        if (meta) {
            var $meta = $("<div class='dcss-tip-meta'></div>");
            content.renderMeta($meta[0], meta); $tip.append($meta);
        }
        $tip.off("tooltip-content-resize.hovercard").on("tooltip-content-resize.hovercard", function () {
            position(element, x, y);
        });
        $tip.show();
        position(element, x, y);
    }
    function position(element, x, y) {
        placement.place($(element)[0], { left: x - 12, right: x + 12, top: y - 12, bottom: y + 12,
            width: 24, height: 24 });
    }
    return { show: show, position: position };
});
