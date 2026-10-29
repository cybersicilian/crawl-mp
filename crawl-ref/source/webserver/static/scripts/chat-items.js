define(["jquery", "linkify", "item-properties", "rich-text"], function ($, linkify, properties, richText) {
    "use strict";

    var items = [], picker, tooltip, search, results, onTag;
    var tooltipAnchor = null;
    var tooltipTimer;
    var itemLimit = 8;

    function clean(value, limit) {
        return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
    }

    function safeIcon(value) {
        return typeof value === "string"
            && /^\/static\/[a-zA-Z0-9_./-]+\.(png|webp|gif|svg)$/.test(value)
            && !value.split("/").some(function (part) { return part === ".."; }) ? value : "";
    }

    function normalize(item) {
        if (!item || typeof item !== "object") return null;
        var name = clean(item.name, 160);
        if (!name || /[\[\]]/.test(name)) return null;
        return { id: clean(item.id, 64), name: name,
            description: typeof item.description === "string" ? item.description.slice(0, 2000) : "",
            icon: safeIcon(item.icon), source: clean(item.source, 100) };
    }

    function token(item) { return "[item:" + item.name + "]"; }

    function key(name) { return clean(name, 160).toLocaleLowerCase(); }

    function matches(text) {
        var found = [], expression = /\[item:([^\[\]\r\n]+)\]/gi, match;
        while ((match = expression.exec(text)))
            found.push({ name: key(match[1]), index: match.index, length: match[0].length });
        return found;
    }

    function relevant(text, tags) {
        var seen = Object.create(null), names = matches(text).map(function (match) { return match.name; });
        return (Array.isArray(tags) ? tags : []).map(normalize).filter(function (item) {
            if (!item || seen[key(item.name)] || names.indexOf(key(item.name)) < 0) return false;
            seen[key(item.name)] = true;
            return true;
        }).slice(0, itemLimit);
    }

    function glyph() {
        return $("<span class='chat-item-glyph' aria-hidden='true'></span>").append(
            properties.icon("inventory"));
    }

    function icon(item) {
        return item.icon ? $("<img class='chat-item-image' alt=''>").attr("src", item.icon) : glyph();
    }

    function hideTooltip() {
        window.clearTimeout(tooltipTimer);
        if (tooltip) tooltip.hide().attr("aria-hidden", "true");
        if (tooltipAnchor) $(tooltipAnchor).removeAttr("aria-describedby");
        tooltipAnchor = null;
    }

    function deferHideTooltip() {
        window.clearTimeout(tooltipTimer);
        tooltipTimer = window.setTimeout(function () {
            if (tooltip && tooltip.is(":hover")) return;
            if (tooltipAnchor && tooltipAnchor === document.activeElement) return;
            hideTooltip();
        }, 140);
    }

    function showTooltip(anchor) {
        var item = $(anchor).data("chatItem");
        if (!item) return;
        if (!tooltip) tooltip = $("<div id='chat_item_tooltip' role='tooltip' aria-hidden='true'></div>")
            .on("mouseenter", function () { window.clearTimeout(tooltipTimer); })
            .on("mouseleave", deferHideTooltip).appendTo("body");
        hideTooltip();
        tooltipAnchor = anchor;
        tooltip.empty().append($("<div class='chat-tooltip-kicker'></div>").text("Item details"));
        tooltip.append($("<div class='chat-tooltip-title'></div>").append(icon(item),
            $("<strong></strong>").append(properties.render(item.name, { focusable: false }))));
        tooltip.append($("<div class='chat-tooltip-body'></div>").html(richText.render(item.description || "No further description was shared for this item.")));
        var sender = $(anchor).data("chatSender");
        tooltip.append($("<div class='chat-tooltip-footer'></div>").text(sender
            ? "Shared by " + sender + " · Item snapshot from this message"
            : (item.source || "Known item") + " · Select to add to your message"));
        tooltip.show().attr("aria-hidden", "false");
        $(anchor).attr("aria-describedby", "chat_item_tooltip");
        var rect = anchor.getBoundingClientRect(), width = tooltip.outerWidth(), height = tooltip.outerHeight();
        var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        var top = rect.top - height - 10;
        if (top < 8) top = Math.min(rect.bottom + 10, window.innerHeight - height - 8);
        tooltip.css({ left: left, top: Math.max(8, top) });
    }

    function chip(item, sender) {
        return $("<button type='button' class='chat-item-chip'></button>")
            .data({ chatItem: item, chatSender: sender || "" })
            .attr("aria-label", item.name + ", show item details")
            .append(icon(item), properties.render(item.name, { focusable: false }));
    }

    function render(text, tags, sender) {
        var fragment = $("<span></span>"), candidates = relevant(text, tags), offset = 0;
        matches(text).forEach(function (match) {
            var item = candidates.find(function (candidate) { return key(candidate.name) === match.name; });
            if (!item) return;
            fragment.append(linkify(text.slice(offset, match.index)), chip(item, sender));
            offset = match.index + match.length;
        });
        if (offset < text.length) fragment.append(linkify(text.slice(offset)));
        return fragment.contents();
    }

    function renderChoices() {
        if (!results) return;
        var query = search.val().toLocaleLowerCase(), matches = items.filter(function (item) {
            return (item.name + " " + item.source).toLocaleLowerCase().indexOf(query) >= 0;
        });
        results.empty();
        matches.slice(0, 40).forEach(function (item) {
            var button = $("<button type='button' class='chat-item-choice'></button>")
                .data("chatItem", item).append(icon(item));
            button.append($("<span class='chat-item-choice-copy'></span>").append(
                $("<strong></strong>").append(properties.render(item.name, { focusable: false })),
                $("<small></small>").text(item.source || "Known item")));
            button.append($("<span class='chat-item-add' aria-hidden='true'>+</span>"));
            results.append(button);
        });
        if (!matches.length) results.append($("<p class='chat-item-empty'></p>").text(items.length
            ? "No items match your search."
            : "Open your inventory or inspect nearby loot to discover items you can share."));
        $("#chat_item_result_count").text(matches.length + (matches.length === 1 ? " item" : " items"));
    }

    function setItems(next) {
        var seen = Object.create(null);
        items = (Array.isArray(next) ? next : []).map(normalize).filter(function (item) {
            if (!item || seen[key(item.name)]) return false;
            seen[key(item.name)] = true;
            return true;
        }).slice(0, 300);
        renderChoices();
    }

    function closePicker(focusInput) {
        if (picker) picker.prop("hidden", true);
        $("#chat_tag_btn").attr("aria-expanded", "false");
        hideTooltip();
        if (focusInput) $("#chat_input").focus();
    }

    function init(tagHandler) {
        onTag = tagHandler;
        if (document.getElementById("chat_tag_btn")) return;
        $("<button type='button' id='chat_tag_btn' aria-expanded='false' aria-controls='chat_item_picker'></button>")
            .attr({ title: "Tag an item in chat", "aria-label": "Tag an item in chat" })
            .append(glyph(), $("<span></span>").text("Tag item")).prependTo(".chat-compose");
        picker = $("<section id='chat_item_picker' hidden aria-label='Choose an item to tag'></section>");
        var header = $("<div class='chat-picker-heading'></div>").append(
            $("<strong>Share an item</strong>"), $("<span id='chat_item_result_count'></span>"),
            $("<button type='button' class='chat-picker-close' aria-label='Close item picker'>×</button>"));
        search = $("<input type='search' class='text' id='chat_item_search' autocomplete='off' placeholder='Search known items…' aria-label='Search known items'>");
        results = $("<div class='chat-item-results'></div>");
        picker.append(header, search, results).insertBefore(".chat-compose");
        $("<div class='chat-compose-help'></div>").append(
            $("<span>Hover an item tag for details</span>"), $("<span><kbd>Enter</kbd> send · <kbd>↑</kbd> history</span>"))
            .insertAfter(".chat-compose");
        $("#chat_tag_btn").on("click", function () {
            if (!picker.prop("hidden")) return closePicker(true);
            $(document).trigger("chat_items_requested");
            picker.prop("hidden", false);
            $(this).attr("aria-expanded", "true");
            search.val(""); renderChoices(); search.focus();
        });
        picker.on("click", ".chat-picker-close", function () { closePicker(true); });
        search.on("input", renderChoices).on("keydown", function (event) {
            if (event.which === 40) { event.preventDefault(); results.find("button").first().focus(); }
        });
        picker.on("click", ".chat-item-choice", function () {
            onTag($(this).data("chatItem")); closePicker(true);
        }).on("keydown", function (event) {
            if (event.which === 27) { event.preventDefault(); event.stopPropagation(); closePicker(true); }
            if (!$(event.target).hasClass("chat-item-choice") || (event.which !== 38 && event.which !== 40)) return;
            event.preventDefault(); event.stopPropagation();
            var choices = results.find("button"), index = choices.index(event.target);
            if (event.which === 38 && index === 0) search.focus();
            else choices.eq(Math.min(choices.length - 1, index + (event.which === 40 ? 1 : -1))).focus();
        });
        // The versioned game loader removes all document-level jQuery handlers.
        // The persistent chat region owns its UI listeners across client loads.
        $("#chat").on("mouseenter.chatItems focusin.chatItems", ".chat-item-chip, .chat-item-choice", function () { showTooltip(this); })
            .on("mouseleave.chatItems focusout.chatItems", ".chat-item-chip, .chat-item-choice", deferHideTooltip)
            .on("click.chatItems", ".chat-item-chip", function () { showTooltip(this); })
            .on("keydown.chatItems", ".chat-item-chip", function (event) {
                if (event.which === 27) { event.preventDefault(); event.stopPropagation(); hideTooltip(); $("#chat_input").focus(); }
            });
        $(window).on("resize.chatItems", hideTooltip)
            .on("chat_items_changed.chatItems", function (event, next) { setItems(next); })
            .on("chat_item_tag.chatItems", function (event, item) { var next = normalize(item); if (next) onTag(next); });
        $("#chat_history_container").on("scroll.chatItems", hideTooltip);
        renderChoices();
    }

    return { init: init, normalize: normalize, token: token, relevant: relevant,
        render: render, setItems: setItems, close: closePicker, hideTooltip: hideTooltip };
});
