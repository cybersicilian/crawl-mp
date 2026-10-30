/* Progressive enhancement for long native selects. Values and change events
 * remain on the original control; consumers own option data and validation. */
define(function () {
    "use strict";
    var controls = new WeakMap(), optionLabels = new WeakMap(), optionOrders = new WeakMap();
    var popup, search, list, count, heading, active, matches = [], cursor = -1;
    function recommend(select, values) {
        if (!select) return;
        var selected = select.value, recommended = new Set(values || []);
        var options = Array.from(select.options);
        options.forEach(function (option, index) {
            if (!optionLabels.has(option)) {
                // A native option without a value attribute derives its value
                // from its text; preserve it before adding recommendation marks.
                if (!option.hasAttribute("value")) option.value = option.value;
                optionLabels.set(option, option.text);
                optionOrders.set(option, index);
            }
            var marked = recommended.has(option.value) && !option.disabled;
            var label = optionLabels.get(option), text = (marked ? "★ " : "") + label;
            if (option.text !== text) option.text = text;
            if (option.dataset.recommended !== String(marked)) option.dataset.recommended = String(marked);
            var accessible = label + (marked ? ", recommended" : "");
            if (option.getAttribute("aria-label") !== accessible) option.setAttribute("aria-label", accessible);
        });
        var ordered = options.slice().sort(function (left, right) {
            return Number(right.dataset.recommended === "true") - Number(left.dataset.recommended === "true")
                || optionOrders.get(left) - optionOrders.get(right);
        });
        if (ordered.some(function (option, index) { return option !== options[index]; })) {
            ordered.forEach(function (option) { select.appendChild(option); });
            select.value = selected;
        }
        refresh(select);
    }
    function el(tag, className, text) {
        var node = document.createElement(tag); node.className = className || "";
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function close(restore) {
        if (!active) return;
        var trigger = active.trigger;
        active = null; trigger.setAttribute("aria-expanded", "false");
        popup.hidePopover(); search.removeAttribute("aria-activedescendant");
        if (restore && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    function highlight(index) {
        cursor = index;
        Array.from(list.children).forEach(function (option, i) { option.classList.toggle("is-highlighted", i === cursor); });
        var option = list.children[cursor];
        if (option) {
            search.setAttribute("aria-activedescendant", option.id);
            option.scrollIntoView({ block: "nearest" });
        } else search.removeAttribute("aria-activedescendant");
    }
    function commit(index) {
        if (!active || !matches[index] || active.select.disabled || matches[index].disabled) return;
        var select = active.select, value = matches[index].value, changed = select.value !== value;
        select.value = value; refresh(select); close(true);
        if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function render() {
        if (!active) return;
        var highlighted = matches[cursor] && matches[cursor].value;
        var terms = search.value.trim().toLocaleLowerCase().split(/\s+/);
        matches = Array.from(active.select.options).filter(function (option) {
            return !option.disabled && !option.hidden && terms.every(function (term) { return option.text.toLocaleLowerCase().includes(term); });
        });
        list.replaceChildren();
        matches.forEach(function (option, i) {
            var row = el("div", "choice-picker-option");
            row.id = "choice_picker_option_" + i; row.setAttribute("role", "option");
            if (option.hasAttribute("aria-label")) row.setAttribute("aria-label", option.getAttribute("aria-label"));
            row.appendChild(el("span", "choice-picker-option-name", option.text));
            if (option.dataset.choiceDescription) {
                var description = el("span", "choice-picker-option-description", option.dataset.choiceDescription);
                description.id = row.id + "_description";
                row.setAttribute("aria-describedby", description.id);
                row.appendChild(description);
            }
            row.setAttribute("aria-selected", String(option.value === active.select.value));
            row.addEventListener("pointerdown", function (event) { event.preventDefault(); });
            row.addEventListener("click", function () { commit(i); });
            list.appendChild(row);
        });
        var recommended = matches.some(function (option) { return option.dataset.recommended === "true"; });
        count.textContent = matches.length ? matches.length + (matches.length === 1 ? " choice" : " choices") + (recommended ? " · ★ Recommended" : "")
            : "No matches. Try another search.";
        var previous = matches.findIndex(function (option) { return option.value === highlighted; });
        highlight(previous >= 0 ? previous : recommended ? 0 : Math.max(0, matches.findIndex(function (option) { return option.value === active.select.value; })));
    }
    function position() {
        if (!active) return;
        var rect = active.trigger.getBoundingClientRect(), margin = 12;
        var width = Math.min(410, Math.max(rect.width, 320), window.innerWidth - margin * 2);
        var below = window.innerHeight - rect.bottom - margin, above = rect.top - margin;
        var down = below >= Math.min(340, above), height = Math.min(366, down ? below : above);
        popup.style.width = width + "px";
        popup.style.maxHeight = Math.max(100, height) + "px";
        popup.style.left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)) + "px";
        popup.style.top = down ? rect.bottom + 6 + "px" : "auto";
        popup.style.bottom = down ? "auto" : window.innerHeight - rect.top + 6 + "px";
    }
    function ensurePopup() {
        if (popup) return;
        popup = el("div", "choice-picker"); popup.id = "choice_picker";
        popup.setAttribute("popover", "auto"); popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-labelledby", "choice_picker_title");
        heading = el("h2", "choice-picker-title"); heading.id = "choice_picker_title";
        search = el("input", "choice-picker-search"); search.type = "search"; search.autocomplete = "off";
        search.setAttribute("role", "combobox"); search.setAttribute("aria-autocomplete", "list");
        search.setAttribute("aria-expanded", "true"); search.setAttribute("aria-controls", "choice_picker_results");
        list = el("div", "choice-picker-results"); list.id = "choice_picker_results"; list.setAttribute("role", "listbox");
        count = el("p", "choice-picker-count"); count.setAttribute("role", "status");
        popup.append(heading, search, list, count); document.body.appendChild(popup);
        search.addEventListener("input", render);
        popup.addEventListener("keydown", function (event) {
            event.stopPropagation();
            if (event.key === "Escape") { event.preventDefault(); close(true); }
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (matches.length) highlight((cursor + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
            } else if (event.key === "Enter") { event.preventDefault(); commit(cursor); }
            else if (event.key === "Tab") close(true);
        });
        popup.addEventListener("keypress", function (event) { event.stopPropagation(); });
        popup.addEventListener("toggle", function (event) {
            if (event.newState === "closed" && active && !popup.matches(":popover-open")) close(false);
        });
        document.addEventListener("pointerdown", function (event) {
            if (active && !popup.contains(event.target) && !active.trigger.contains(event.target)) close(false);
        }, true);
        window.addEventListener("resize", position, { passive: true });
        window.addEventListener("scroll", function (event) {
            if (!active || popup.contains(event.target)) return;
            var rect = active.trigger.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) close(false);
            else position();
        }, { passive: true, capture: true });
    }
    function open(control) {
        if (control.select.disabled) return;
        if (active === control) { close(true); return; }
        close(false); ensurePopup(); active = control;
        heading.textContent = "Choose " + control.label;
        search.setAttribute("aria-label", "Search " + control.label);
        search.placeholder = "Search " + control.label.toLocaleLowerCase() + "…";
        list.setAttribute("aria-label", control.label + " choices");
        search.value = ""; matches = []; cursor = -1;
        control.trigger.setAttribute("aria-expanded", "true");
        popup.showPopover(); position(); render(); search.focus({ preventScroll: true });
    }
    function refresh(select) {
        var control = controls.get(select); if (!control) return;
        var option = select.selectedOptions[0];
        control.value.textContent = option ? option.text : "Choose…";
        control.trigger.disabled = select.disabled;
        control.trigger.setAttribute("aria-label", (select.getAttribute("aria-label") || control.label) + ": "
            + (option && option.getAttribute("aria-label") || control.value.textContent));
        var description = select.getAttribute("aria-describedby");
        if (description) control.trigger.setAttribute("aria-describedby", description);
        if (active === control) { if (select.disabled) close(true); else render(); }
    }
    function enhance(select) {
        if (!select || typeof HTMLElement.prototype.showPopover !== "function") return;
        if (controls.has(select)) { refresh(select); return; }
        var label = select.labels[0], trigger = el("button", "choice-select-trigger"), value = el("span");
        trigger.type = "button"; trigger.id = select.id + "_picker";
        trigger.setAttribute("aria-haspopup", "dialog"); trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", "choice_picker");
        trigger.append(value, el("span", "choice-select-chevron", "⌄"));
        trigger.lastChild.setAttribute("aria-hidden", "true");
        var control = { select: select, trigger: trigger, value: value, label: label ? label.textContent.trim() : "option" };
        controls.set(select, control); ensurePopup();
        select.classList.add("choice-native-select"); select.tabIndex = -1; select.setAttribute("aria-hidden", "true");
        if (label) label.htmlFor = trigger.id;
        select.after(trigger); refresh(select);
        trigger.addEventListener("click", function () { open(control); });
        trigger.addEventListener("keydown", function (event) {
            if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); open(control); }
        });
        select.addEventListener("change", function () { refresh(select); });
        new MutationObserver(function () { refresh(select); }).observe(select, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled", "selected", "label", "hidden"] });
    }
    return { enhance: enhance, refresh: refresh, recommend: recommend };
});
