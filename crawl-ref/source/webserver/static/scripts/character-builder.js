/* Character identity and legal choices use the same catalog as the native guide. */
define(["character-catalog", "client-staging-data", "starting-sheet", "searchable-select", "client-staging-traits", "character-build-overview", "character-choices", "hero-roles"], function (catalog, choices, sheet, picker, traits, overview, visualChoices, roles) {
    "use strict";
    var selections = new WeakMap();
    function selection(card) {
        if (!selections.has(card)) selections.set(card, {});
        return selections.get(card);
    }
    function select(card, field) { selection(card)[field] = true; }
    function describeOptions(select, records) {
        Array.from(select.options).forEach(function (option) {
            var entry = records[option.value], description = entry && entry.description || "";
            var sentence = description.replace(/\s+/g, " ").trim().match(/^.*?[.!?](?:\s|$)/);
            option.dataset.choiceDescription = sentence ? sentence[0].trim() : description;
        });
    }
    function context(card, key) {
        if (selection(card).context !== key) {
            selections.set(card, { context: key });
            visualChoices.reset(card.querySelector(".party-slot-species"));
            visualChoices.reset(card.querySelector(".party-slot-job"));
        }
    }
    function element(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function identity(slot) {
        var header = element("div", "party-slot-top");
        var mark = element("span", "party-slot-monogram");
        mark.setAttribute("aria-hidden", "true");
        header.appendChild(mark);
        var copy = element("div", "party-slot-identity");
        var title = element("div", "party-slot-title-row");
        title.appendChild(element("span", "party-slot-title", "Seat " + (slot + 1) + (slot === 0 ? " · Host" : "")));
        var badge = element("span", roles.badgeClasses("unknown"), "Hero"); badge.dataset.role = "unknown";
        title.appendChild(badge);
        copy.appendChild(title);
        copy.appendChild(element("h3", "party-slot-hero-name"));
        copy.appendChild(element("span", "party-slot-occupant"));
        header.appendChild(copy);
        return header;
    }
    function refresh(card) {
        var raceSelect = card.querySelector(".party-slot-species");
        var jobSelect = card.querySelector(".party-slot-job");
        var race = catalog.species[raceSelect.value], job = catalog.jobs[jobSelect.value];
        var mark = card.querySelector(".party-slot-monogram");
        var build = sheet.read(card), preview = sheet.preview(build), portraitKey = preview.key + "|" + preview.status;
        if (race && mark.dataset.preview !== portraitKey) {
            mark.dataset.preview = portraitKey;
            mark.replaceChildren(sheet.portrait(build), element("span", "party-slot-abbreviation"));
        }
        card.querySelector(".party-slot-hero-name").textContent = card.querySelector(".party-slot-name").value || "Your hero";
        var abbreviation = mark.querySelector(".party-slot-abbreviation");
        if (abbreviation) abbreviation.textContent = race && job ? race.abbr + job.abbr : "?";
        var role = roles.roleForBackground(job), badge = card.querySelector(".party-slot-identity .party-role-badge");
        if (badge && badge.dataset.role !== role.key) {
            badge.className = roles.badgeClasses(role.key); badge.dataset.role = role.key; badge.textContent = role.label;
            badge.title = role.summary;
        }
        var allowed = choices.allowedJobs(raceSelect.value);
        describeOptions(raceSelect, catalog.species);
        describeOptions(jobSelect, catalog.jobs);
        Array.from(jobSelect.options).forEach(function (option) {
            var disabled = allowed.indexOf(option.value) === -1;
            if (option.disabled !== disabled) option.disabled = disabled;
        });
        picker.recommend(jobSelect, race && race.recommended);
        picker.recommend(raceSelect, ((job && job.recommended) || []).map(speciesName).filter(function (name) {
            return choices.allowedJobs(name).indexOf(jobSelect.value) !== -1;
        }));
        visualChoices.refresh(raceSelect, "species", catalog.species);
        visualChoices.refresh(jobSelect, "background", catalog.jobs);
        traits.refresh(card);
        overview.refresh(card, build, preview);
        refreshBuilds(card, raceSelect.value, jobSelect.value);
        card.querySelectorAll(".party-archetype-btn").forEach(function (button) {
            button.disabled = card.dataset.seatEditable === "false";
            if (button.dataset.random === "true") return;
            button.setAttribute("aria-pressed", String(button.dataset.species === raceSelect.value && button.dataset.job === jobSelect.value));
        });
        var state = card.classList.contains("slot-state-closed") ? "closed" : card.classList.contains("slot-state-open") ? "open" : "active";
        card.querySelector(".party-slot-state-note").textContent = state === "closed"
            ? "This hero stays behind. Activate the slot to bring them along."
            : state === "open" ? "Reserved for a friend. This hero joins when the seat is claimed."
            : "";
    }
    function refreshBuilds(card, species, job) {
        var selected = selection(card), row = card.querySelector(".party-archetype-row");
        var builds = choices.quickBuilds(selected.species ? species : "", selected.job ? job : "");
        var key = JSON.stringify(builds.map(function (build) { return [build.species, build.job]; }));
        if (row.dataset.builds === key) return;
        row.dataset.builds = key;
        row.replaceChildren(element("span", "party-presets-label", "Quick builds"));
        var random = element("button", "party-archetype-btn", "Random Random");
        random.type = "button";
        random.dataset.slot = card.dataset.slot;
        random.dataset.random = "true";
        random.dataset.tipTitle = "Random Random";
        random.dataset.tipBody = "Roll a random species and a legal background. Click again to reroll.";
        row.appendChild(random);
        builds.forEach(function (build) {
            var button = element("button", "party-archetype-btn");
            var role = roles.roleForBackground(build.job);
            button.appendChild(element("span", "party-archetype-name", build.species + " " + build.job));
            var badge = element("span", roles.badgeClasses(role.key), role.label); badge.dataset.role = role.key;
            button.appendChild(badge);
            button.type = "button";
            button.dataset.slot = card.dataset.slot;
            button.dataset.species = build.species;
            button.dataset.job = build.job;
            button.dataset.tipTitle = build.tipTitle;
            button.dataset.tipBody = build.tipBody;
            button.dataset.tipMeta = build.tipMeta;
            row.appendChild(button);
        });
    }
    function speciesName(name) { return catalog.species[name] ? catalog.species[name].name : name; }
    window.addEventListener("native-start-updated", function () {
        document.querySelectorAll('#party_slots_grid:not([data-saved-expedition="true"]) .party-slot-box').forEach(refresh);
    });
    return { identity: identity, refresh: refresh, speciesName: speciesName, select: select, context: context };
});
