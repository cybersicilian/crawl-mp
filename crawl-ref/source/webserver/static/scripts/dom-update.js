/* Retain DOM nodes and avoid observer/layout work when presentation is unchanged. */
define([], function () {
    "use strict";
    function text(element, value) {
        if (!element) return;
        var next = String(value);
        if (element.textContent === next) return;
        if (element.childNodes.length === 1 && element.firstChild.nodeType === 3)
            element.firstChild.nodeValue = next;
        else element.textContent = next;
    }
    function attribute(element, name, value) {
        if (!element) return;
        var next = String(value);
        if (element.getAttribute(name) !== next) element.setAttribute(name, next);
    }
    function attributes(element, values) {
        Object.keys(values).forEach(function (name) { attribute(element, name, values[name]); });
    }
    return { text: text, attribute: attribute, attributes: attributes };
});
