/* Keyed, lazy disclosure lists. Callers own card rendering and native facts. */
define([], function () {
    "use strict";
    function text(node, value) { if (node.textContent !== value) node.textContent = value; }
    function reconcile(parent, children) {
        var next = parent.firstChild;
        children.forEach(function (child) {
            if (child === next) next = next.nextSibling;
            else parent.insertBefore(child, next);
        });
        while (next) { var removed = next; next = next.nextSibling; removed.remove(); }
    }
    return function (root, changed) {
        var sections = new Map();
        function section(group) {
            var node = document.createElement("details");
            node.className = "creature-category"; node.dataset.category = group.id; node.open = group.open;
            node.innerHTML = "<summary><span></span><span class='creature-count'></span></summary><div class='enemy-timing-list'></div>";
            text(node.querySelector("summary span"), group.label);
            var result = { node: node, count: node.querySelector(".creature-count"),
                list: node.querySelector(".enemy-timing-list"), stacks: new Map(), open: node.open };
            node.addEventListener("toggle", function () {
                if (result.open === node.open) return;
                result.open = node.open; changed();
            });
            root.appendChild(node);
            return result;
        }
        function stack() {
            var node = document.createElement("div"); node.className = "creature-stack";
            var toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "creature-stack-toggle";
            toggle.setAttribute("aria-expanded", "false");
            var result = { node: node, toggle: toggle, open: false };
            toggle.addEventListener("click", function () { result.open = !result.open; changed(); });
            return result;
        }
        function update(groups, card) {
            var focused = document.activeElement;
            groups.forEach(function (group) {
                if (!sections.has(group.id)) sections.set(group.id, section(group));
                var current = sections.get(group.id), children = [];
                text(current.count, String(group.count));
                if (current.node.open) group.stacks.forEach(function (items, key) {
                    if (!current.stacks.has(key)) current.stacks.set(key, stack());
                    var entry = current.stacks.get(key), cards = [card(items[0])];
                    entry.node.classList.toggle("is-stacked", items.length > 1 && !entry.open);
                    if (items.length > 1) {
                        text(entry.toggle, entry.open ? "− " + items.length : "×" + items.length);
                        var label = (entry.open ? "Collapse " : "Show all ") + items.length + " " + items[0].name;
                        if (entry.toggle.getAttribute("aria-label") !== label) entry.toggle.setAttribute("aria-label", label);
                        if (entry.toggle.getAttribute("aria-expanded") !== String(entry.open))
                            entry.toggle.setAttribute("aria-expanded", String(entry.open));
                        cards.push(entry.toggle);
                        if (entry.open) items.slice(1).forEach(function (item) { cards.push(card(item)); });
                    }
                    reconcile(entry.node, cards); children.push(entry.node);
                });
                reconcile(current.list, children);
                // Retain disclosure choices while a category is closed.
                current.stacks.forEach(function (entry, key) {
                    if (!group.stacks.has(key)) current.stacks.delete(key);
                    else if (!current.node.open) reconcile(entry.node, []);
                });
            });
            // Regrouping a damaged or newly affected creature moves its card.
            // Preserve keyboard targeting when that same card still exists.
            if (focused && focused.isConnected && document.activeElement !== focused)
                focused.focus({ preventScroll: true });
        }
        return { update: update };
    };
});
