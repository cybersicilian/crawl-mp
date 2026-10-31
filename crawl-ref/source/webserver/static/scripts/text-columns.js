/* Slice already escaped, formatted text without losing inline markup. */
define([], function () {
    "use strict";
    function slice(source, start, end) {
        var text = source.textContent.slice(start, end);
        start += text.length - text.trimStart().length;
        end = start + text.trim().length;
        if (end <= start) return document.createDocumentFragment();
        var walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT), node, offset = 0;
        var range = document.createRange(), begun = false;
        while ((node = walker.nextNode())) {
            var next = offset + node.length;
            if (!begun && start < next) { range.setStart(node, start - offset); begun = true; }
            if (begun && end <= next) {
                range.setEnd(node, end - offset);
                var fragment = range.cloneContents(), ancestor = range.commonAncestorContainer;
                if (ancestor.nodeType !== Node.ELEMENT_NODE) ancestor = ancestor.parentElement;
                while (ancestor && ancestor !== source) {
                    var wrapper = ancestor.cloneNode(false);
                    wrapper.appendChild(fragment);
                    fragment = document.createDocumentFragment();
                    fragment.appendChild(wrapper);
                    ancestor = ancestor.parentElement;
                }
                return fragment;
            }
            offset = next;
        }
        return document.createDocumentFragment();
    }
    return { slice: slice };
});
