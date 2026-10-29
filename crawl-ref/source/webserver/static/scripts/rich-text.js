/* Safe Markdown for descriptions. Raw HTML and embedded media stay text. */
define(["marked"], function (marked) {
    "use strict";

    function escape(text) {
        return String(text).replace(/[&<>"']/g, function (character) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
        });
    }
    function safeLink(href) {
        try {
            var url = new URL(href, "https://description.invalid/");
            return /^(https?:|mailto:)$/.test(url.protocol) ? href : null;
        } catch (error) { return null; }
    }
    var parser = new marked.Marked({ gfm: true, breaks: true, renderer: {
        html: function (token) { return escape(token.text); },
        link: function (token) {
            var label = this.parser.parseInline(token.tokens), href = safeLink(token.href);
            if (href === null) return label;
            return '<a href="' + escape(href) + '" target="_blank" rel="noopener noreferrer"'
                + (token.title ? ' title="' + escape(token.title) + '"' : '') + '>' + label + '</a>';
        },
        image: function (token) { return escape(token.text); },
        table: function (token) {
            var renderer = new marked.Renderer();
            renderer.parser = this.parser;
            return '<div class="rich-text-table" tabindex="0" role="region" aria-label="Description table">'
                + renderer.table(token) + '</div>';
        }
    } });

    // Colour names are supplied by the consumer. Keep
    // tags out of Markdown's HTML blocks, then apply their state to text nodes.
    function render(text, native) {
        var tags = [], source = String(text || "");
        // Reserve internal marker characters; literal input cannot impersonate tags.
        source = source.replace(/[\uE000\uE001]/g, "\uFFFD");
        if (native) source = source.replace(/(<<|<)(\/?)(bg:)?([a-z]+)>/gi, function (tag, opening, close, bg, name) {
            if (!Object.prototype.hasOwnProperty.call(native.colours, name.toLowerCase())) return tag;
            if (opening === "<<") return escape(tag.slice(1));
            tags.push({ text: tag, close: Boolean(close), bg: Boolean(bg), name: name.toLowerCase() });
            return "\uE000" + (tags.length - 1) + "\uE001";
        });
        var root = document.createElement("div");
        root.className = "rich-text";
        root.innerHTML = parser.parse(source).trim();
        if (tags.length) {
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [], node;
            while ((node = walker.nextNode())) nodes.push(node);
            var foreground = [], background = [];
            nodes.forEach(function (textNode) {
                var literal = textNode.parentElement.closest("code, pre");
                var fragments = textNode.textContent.split(/(\uE000\d+\uE001)/g);
                var replacement = document.createDocumentFragment();
                fragments.forEach(function (fragment) {
                    var marker = fragment.match(/^\uE000(\d+)\uE001$/);
                    if (marker) {
                        var tag = tags[Number(marker[1])];
                        if (literal) replacement.appendChild(document.createTextNode(tag.text));
                        else {
                            var stack = tag.bg ? background : foreground;
                            if (tag.close) stack.pop();
                            else stack.push(tag.name);
                        }
                    } else if (fragment) {
                        var span = document.createElement("span");
                        if (!literal) {
                            var fg = foreground[foreground.length - 1], bg = background[background.length - 1];
                            if (fg) span.classList.add("fg" + native.colours[fg]);
                            if (bg) span.classList.add("bg" + native.colours[bg]);
                        }
                        span.textContent = fragment;
                        replacement.appendChild(span);
                    }
                });
                textNode.replaceWith(replacement);
            });
        }
        return root.outerHTML;
    }
    return { render: render };
});
