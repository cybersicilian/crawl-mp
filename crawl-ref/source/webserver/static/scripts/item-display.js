define(["jquery", "item-properties"], function ($, properties) {
    "use strict";
    var chronicleSelector = ".chronicle-entry-title";
    var weaponSelector = "#stats_weapon, #stats_offhand_weapon";
    var librarySelector = ".library-property-title";
    var allSelectors = chronicleSelector + ", " + weaponSelector + ", " + librarySelector;
    var nativeObserver, currentStats, gameObserver, chronicleObserver;

    function decorateElement(element, options) {
        if (element.querySelector(".item-property-name")) return;
        var raw = element.textContent;
        if (!properties.parse(raw).properties.length) return;
        var target = element;
        // Keep the native item's colour span and any container attributes.
        while (target.childNodes.length === 1 && target.firstElementChild)
            target = target.firstElementChild;
        if (options === undefined && element.closest("a, button")) options = { focusable: false };
        target.textContent = "";
        target.appendChild(properties.render(raw, options));
    }

    function decorate(root, selector, options) {
        root = root || document;
        selector = selector || allSelectors;
        if (root.nodeType === 1 && root.matches(selector)) decorateElement(root, options);
        root.querySelectorAll(selector).forEach(function (element) { decorateElement(element, options); });
    }

    function observeElements(elements, selector, options) {
        var queued = false;
        var observer = new MutationObserver(function () {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function () {
                queued = false;
                observer.disconnect();
                elements.forEach(function (element) {
                    if (element.isConnected) decorate(element, selector, options);
                });
                attach();
            });
        });
        function attach() {
            elements.forEach(function (element) {
                if (element.isConnected)
                    observer.observe(element, { childList: true, subtree: true, characterData: true });
            });
        }
        // Initial rendering happens before observation, so our writes never requeue it.
        elements.forEach(function (element) { decorate(element, selector, options); });
        attach();
        return observer;
    }

    function bindNative(gameRoot) {
        var stats = gameRoot.querySelector("#stats");
        if (stats === currentStats) return;
        if (nativeObserver) nativeObserver.disconnect();
        currentStats = stats;
        if (!stats) return;
        var weapons = Array.prototype.slice.call(stats.querySelectorAll(weaponSelector));
        nativeObserver = observeElements(weapons, weaponSelector, { focusable: false });
    }

    $(document).ready(function () {
        decorate(document, librarySelector);
        var chronicle = document.getElementById("coop_chronicle_panel");
        if (chronicle) chronicleObserver = observeElements([chronicle], chronicleSelector);
        var gameRoot = document.getElementById("game");
        if (!gameRoot) return;
        gameObserver = new MutationObserver(function () { bindNative(gameRoot); });
        // Game HTML is replaced directly under this persistent shell on reconnects.
        // Observe no descendants: dungeon rendering never wakes this observer.
        gameObserver.observe(gameRoot, { childList: true });
        bindNative(gameRoot);
    });
    return { decorate: decorate };
});
