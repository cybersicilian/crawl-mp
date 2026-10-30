/* Read-only decision summary beside the authoritative character controls. */
define(function () {
    "use strict";
    function el(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className || "";
        if (text !== undefined) node.textContent = String(text);
        return node;
    }
    function signed(n) { return n > 0 ? "+" + n : String(n); }
    function stats(parent, snapshot, keys, label) {
        var group = el("div", "build-stat-group");
        group.setAttribute("aria-label", label);
        keys.forEach(function (key) {
            var cell = el("div", "build-stat");
            cell.append(el("span", "build-stat-label", key.toUpperCase()), el("strong", "build-stat-value", snapshot[key]));
            group.appendChild(cell);
        });
        parent.appendChild(group);
    }
    function highlights(parent, label, values) {
        var row = el("div", "build-highlight build-highlight-" + label.toLowerCase()), items = el("div", "build-highlight-values");
        var limit = label === "TRAITS" ? 1 : 3;
        row.appendChild(el("span", "build-highlight-label", label));
        values.slice(0, limit).forEach(function (value) { items.appendChild(el("span", "build-highlight-chip", value)); });
        if (values.length > limit) items.appendChild(el("span", "build-highlight-more", "+" + (values.length - limit) + " more"));
        if (!values.length) items.appendChild(el("span", "build-highlight-more", "None"));
        items.setAttribute("title", values.join(", ")); row.appendChild(items); parent.appendChild(row);
    }
    function refresh(card, build, preview) {
        var root = card.querySelector(".build-overview");
        if (!root) {
            root = el("div", "build-overview");
            card.querySelector(".party-character-fields").before(root);
        }
        var race = build.species, job = build.job;
        if (!race || !job) { root.replaceChildren(); return; }
        var key = preview.key + "|" + preview.status;
        if (root.dataset.preview === key) return;
        root.dataset.preview = key;
        root.replaceChildren();
        var header = el("div", "build-overview-heading"), identity = el("div", "build-overview-identity");
        identity.append(el("span", "build-overview-kicker", "LEVEL 1 · " + (job.category || "ADVENTURER")),
            el("h4", "", race.name + " · " + job.name));
        header.append(identity, el("span", "build-overview-code", race.abbr + job.abbr));
        root.appendChild(header);
        var recommended = (race.recommended || []).indexOf(job.name) !== -1
            || (job.recommended || []).indexOf(race.name) !== -1;
        root.appendChild(el("p", "build-overview-fit", recommended ? "✦ Recommended pairing" : "Custom pairing"));
        var traits = (race.traits || []).filter(function (trait) { return !/^At XL /.test(trait); });
        var snapshot = preview.snapshot;
        if (preview.status !== "ready" || !snapshot) {
            var message = preview.status === "loading" ? "Preparing the native starting sheet…"
                : preview.status === "unavailable" ? "Starting values are available once the room is connected."
                : "Starting values are temporarily unavailable; open Starting sheet to retry.";
            var status = el("p", "build-overview-status", message); status.setAttribute("role", "status"); root.appendChild(status);
            return;
        }
        stats(root, snapshot, ["hp", "mp", "ac", "ev", "sh"], "Starting vitals and defenses");
        stats(root, snapshot, ["str", "int", "dex"], "Starting attributes");
        var skills = Object.keys(snapshot.skills || {}).map(function (name) {
            var detail = (snapshot.skill_details || {})[name] || {}, aptitude = detail.aptitude;
            return name + " " + snapshot.skills[name] + (Number.isFinite(aptitude) ? " (apt " + signed(aptitude) + ")" : "");
        });
        var items = (snapshot.inventory || []).map(function (item) { return item.name; });
        var spells = snapshot.memorized || [];
        if (traits.length) highlights(root, "TRAITS", traits);
        highlights(root, "TRAINING", skills);
        highlights(root, "GEAR", items);
        if (spells.length) highlights(root, "SPELLS", spells);
    }
    return { refresh: refresh };
});
