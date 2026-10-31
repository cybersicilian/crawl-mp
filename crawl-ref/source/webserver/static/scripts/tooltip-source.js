define([], function () {
    "use strict";
    var observed = new WeakSet();
    function visible(element) {
        return !!(element && element.isConnected && element.getClientRects().length
            && !element.closest("[hidden], [inert], [aria-hidden='true']")
            && getComputedStyle(element).visibility === "visible");
    }
    // A source can disappear without mouseleave/focusout (panel switches,
    // rerenders, closed dialogs). Watch its ancestor chain only while in use.
    function track(onInvalid) {
        var target = null;
        var observer = new MutationObserver(check);
        function clear() { observer.disconnect(); target = null; }
        function check() {
            observer.disconnect();
            if (!visible(target)) { clear(); onInvalid(); return false; }
            for (var node = target; node; node = node.parentElement) {
                observer.observe(node, { childList: true, attributes: true,
                    attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "open"] });
            }
            return true;
        }
        return { set: function (element) { target = element; return check(); }, clear: clear };
    }
    function upgrade(element) {
        if (!element || element.nodeType !== 1) return null;
        var target = element.closest("[data-tip-title], [data-dcss-tip], [title]");
        if (!target) return null;
        if (target.hasAttribute("title")) {
            var body = target.getAttribute("title");
            target.removeAttribute("title");
            if (body && (!target.hasAttribute("data-tip-title") || target.hasAttribute("data-tooltip-native"))) {
                var label = target.getAttribute("aria-label") || target.textContent.trim();
                if (!label && target.matches("button, a, input, [role='button']")
                    && (!target.labels || !target.labels.length)) target.setAttribute("aria-label", body);
                target.setAttribute("data-tip-title", label && label.length <= 60 ? label : "Details");
                target.setAttribute("data-tip-body", body);
                target.setAttribute("data-tooltip-native", "true");
            }
        }
        return target.matches("[data-tip-title], [data-dcss-tip]") ? target : null;
    }
    function scan(root) {
        if (root.nodeType !== 1) return;
        if (root.hasAttribute("title")) upgrade(root);
        root.querySelectorAll("[title]").forEach(upgrade);
    }
    function observe(root) {
        if (!root || observed.has(root)) return;
        observed.add(root); scan(root);
        new MutationObserver(function (records) {
            records.forEach(function (record) {
                if (record.type === "attributes") scan(record.target);
                else record.addedNodes.forEach(scan);
            });
        }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
    }
    return { upgrade: upgrade, observe: observe, visible: visible, track: track };
});
