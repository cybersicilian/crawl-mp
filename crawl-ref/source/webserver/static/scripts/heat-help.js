/* Heat explanations accept the normalized { value, max } resource contract. */
define([], function () {
    "use strict";
    var body = "Engraved spells fire automatically and add heat, without using an extra turn. Each spell has its own trigger and cooldown.\n\n"
        + "A spell must fit in your free capacity. At 4/5 heat, a spell costing 2 heat must wait. Full heat does no damage.\n\n"
        + "You cool as turns pass, even in combat. Cooling speeds up about five turns after your last attack or injury. Press '5' to rest somewhere safe.\n\n"
        + "Berserk fills the meter and stops cooling until it ends.";
    function read(resource) {
        var known = resource && Number.isFinite(resource.value) && Number.isFinite(resource.max) && resource.max >= 0;
        var max = known ? resource.max : null;
        var used = known ? Math.max(0, Math.min(max, resource.value)) : null;
        return { used: used, max: max, free: known ? max - used : null,
            state: !known ? "unknown" : max === 0 ? "unavailable" : used === max ? "full" : used === 0 ? "cool" : "warm" };
    }
    function caption(resource) {
        var data = read(resource);
        return data.free === null ? "Heat capacity unavailable" : data.max === 0 ? "No heat capacity"
            : data.free + " capacity free";
    }
    function apply(target, resource) {
        var data = read(resource), known = data.used !== null;
        target.setAttribute("data-tip-heat", known ? data.used + "/" + data.max : "unknown");
        target.setAttribute("data-tip-live", "");
        target.setAttribute("data-heat-state", data.state);
        target.setAttribute("data-tip-title", "Heat: " + (known ? data.used + " / " + data.max : "unavailable"));
        target.setAttribute("data-tip-badge", "Automaton");
        target.setAttribute("data-tip-body", body);
        target.setAttribute("data-tip-meta", "'5': rest and cool");
        target.removeAttribute("data-tip-html");
        target.setAttribute("tabindex", "0");
        target.setAttribute("role", "meter");
        target.setAttribute("aria-label", "Heat. " + caption(resource));
        target.setAttribute("aria-description", "Hover or focus for heat guidance.");
        target.setAttribute("aria-valuetext", known ? data.used + " of " + data.max + " heat used; " + data.free + " capacity free" : "Heat capacity unavailable");
        if (known && data.max > 0) {
            target.setAttribute("aria-valuemin", "0"); target.setAttribute("aria-valuemax", data.max);
            target.setAttribute("aria-valuenow", data.used);
        } else ["aria-valuemin", "aria-valuemax", "aria-valuenow"].forEach(function (key) { target.removeAttribute(key); });
    }
    function element(tag, className, text) {
        var node = document.createElement(tag); node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function rail(used, max) {
        var track = element("div", "heat-help-track"), fill = element("span", "heat-help-fill");
        track.setAttribute("aria-hidden", "true");
        fill.style.width = (max > 0 ? used / max * 100 : 0) + "%";
        track.appendChild(fill); return track;
    }
    function render(snapshot) {
        if (!snapshot) return null;
        var parts = snapshot.split("/").map(Number);
        var data = read(parts.length === 2 ? { value: parts[0], max: parts[1] } : null);
        var root = element("figure", "heat-help");
        root.setAttribute("data-heat-state", data.state);
        root.appendChild(element("figcaption", "heat-help-heading", "Heat and cooling"));
        if (data.used !== null) {
            var legend = element("div", "heat-help-legend");
            legend.append(element("strong", "", data.used + " heat used"), element("span", "", data.free + " capacity free"));
            root.append(legend, rail(data.used, data.max));
        }
        if (data.state !== "warm")
            root.appendChild(element("p", "heat-help-state", data.state === "cool" ? "Fully cooled"
                : data.state === "full" ? "Full · cool before adding heat" : caption({ value: data.used, max: data.max })));
        root.appendChild(element("div", "heat-help-example-title", "Example: a spell costing 2 heat"));
        var example = element("div", "heat-help-example");
        [[0, "Before"], [2, "Spell fires"], [0, "After cooling"]].forEach(function (step, index) {
            if (index) { var arrow = element("span", "heat-help-arrow", "→"); arrow.setAttribute("aria-hidden", "true"); example.appendChild(arrow); }
            var stage = element("div", "heat-help-stage");
            stage.append(element("span", "", step[1]), rail(step[0], 5), element("strong", "", step[0] + "/5"));
            example.appendChild(stage);
        });
        root.appendChild(example); return root;
    }
    return { apply: apply, caption: caption, render: render, read: read };
});
