define(["jquery", "comm", "client", "./workflow-actions"], function ($, comm, client, actions) {
    "use strict";

    var drafts = Object.create(null), pending = Object.create(null), notices = Object.create(null);
    var identities = Object.create(null);
    var sequence = 0, session = Date.now().toString(36) + Math.random().toString(36).slice(2);

    function fieldId(member, skill, field) {
        return "party_training_" + member.slot + "_" + skill.id + "_" + field;
    }

    function permission(member) {
        if (!member.training_supported) return "Training controls require the updated game engine.";
        if (client.is_watching()) return "Join the party to change your hero's training.";
        var ownSlot = Number(window.crawl_party_slot || 0);
        var multiplayer = window.crawl_party && window.crawl_party.state && window.crawl_party.state.multiplayer;
        if ((multiplayer || ownSlot !== 0) && ownSlot !== member.slot)
            return "Only this hero's controller can edit training.";
        return member.training_locked || "";
    }

    function notice(slot, text, error) {
        notices[slot] = { text: text, error: Boolean(error) };
        $("#party_training_status_" + slot).text(text).toggleClass("is-error", Boolean(error));
    }

    function send(member, fields, draftId, feedback) {
        var reason = permission(member);
        if (reason) { notice(member.slot, reason, true); return; }
        var signature = JSON.stringify([member.slot, fields]);
        if (Object.keys(pending).some(function (key) { return pending[key].signature === signature; })) return;
        var request = session + "_" + (++sequence);
        pending[request] = { slot: member.slot, draftId: draftId, signature: signature,
            feedback: feedback, kind: fields.base ? "base" : "effective",
            value: draftId ? drafts[draftId] : undefined };
        notice(member.slot, "Saving training…", false);
        if (feedback) actions.notice("Saving training…");
        comm.send_message("skill_training", $.extend({ request_id: request, slot: member.slot }, fields));
    }

    comm.register_handlers({ skill_training_result: function (data) {
        var request = pending[data.request_id];
        if (!request) return;
        delete pending[data.request_id];
        if (data.ok && request.draftId) {
            if (drafts[request.draftId] === request.value) delete drafts[request.draftId];
            var kindId = request.draftId.replace(/target$/, "base");
            if (drafts[kindId] === request.kind) delete drafts[kindId];
        }
        var message = data.ok ? "Training saved." : (data.error || "Training could not be saved.");
        notice(request.slot, message, !data.ok);
        if (request.feedback) actions.notice(data.ok ? request.feedback : message);
    } });

    function targetCell(member, skill, disabled) {
        var id = fieldId(member, skill, "target"), kindId = fieldId(member, skill, "base");
        var $cell = $("<td class='party-skill-target'></td>");
        var $line = $("<div class='party-skill-target-line'></div>");
        var $input = $("<input type='number' min='0.1' max='27' step='0.1' placeholder='None' inputmode='decimal'>")
            .attr({ id: id, "aria-label": skill.name + " stop level", "aria-describedby": "party_training_help" })
            .prop("disabled", disabled).val(drafts[id] !== undefined ? drafts[id]
                : (skill.target > 0 ? (skill.target / 10).toFixed(1) : ""));
        var $kind = $("<select><option value='effective'>Effective level</option><option value='base'>Base level</option></select>")
            .attr({ id: kindId, "aria-label": skill.name + " target type",
                title: "Effective level includes cross-training; base level excludes it. Temporary boosts do not count." })
            .prop("disabled", disabled).val(drafts[kindId] || (skill.target_base ? "base" : "effective"));

        function commit() {
            var value = $input.val();
            if (!$input[0].checkValidity()) {
                notice(member.slot, "Enter a stop level from 0.1 to 27 in steps of 0.1, or leave it empty.", true);
                $input.attr("aria-invalid", "true");
                return;
            }
            $input.removeAttr("aria-invalid");
            var target = value === "" ? 0 : Math.round(Number(value) * 10);
            var base = $kind.val() === "base";
            if (target === Number(skill.target || 0) && (!target || base === Boolean(skill.target_base))) return;
            drafts[id] = value;
            send(member, { action: "target", skill: skill.id, target: target, base: base }, id);
        }
        $input.on("input", function () { drafts[id] = this.value; this.removeAttribute("aria-invalid"); })
            .on("change", commit).on("keydown", function (event) {
                if (event.key === "Enter") { event.preventDefault(); commit(); }
            });
        $kind.on("change", function () { drafts[kindId] = this.value; commit(); });
        var $clear = $("<button type='button' class='party-skill-clear'>Clear</button>")
            .attr({ id: fieldId(member, skill, "clear"), "aria-label": "Clear " + skill.name + " target" })
            .prop("disabled", disabled).on("click", function () {
                $input.val("");
                drafts[id] = "";
                send(member, { action: "target", skill: skill.id, target: 0, base: false }, id);
            });
        $line.append($input, $clear);
        return $cell.append($line, $kind);
    }

    function skillCells(skill) {
        var $name = $("<td class='party-skill-name'></td>").text(skill.name || "Skill");
        var $level = $("<td class='party-skill-level'></td>")
            .append($("<span></span>").text(Number(skill.level || 0).toFixed(1)));
        var cross = skill.cross_training;
        if (!cross || !cross.sources || !cross.sources.length) return [$name, $level];
        var active = cross.sources.filter(function (source) { return source.points > 0; });
        var $cross = $("<small class='party-skill-cross-training'></small>");
        if (active.length) {
            var bonus = Number(cross.bonus || 0);
            var amount = bonus > 0 ? "+" + bonus.toFixed(1)
                : Number(skill.base_level) >= 27 ? "At level cap" : "<0.1";
            $cross.append($("<span class='party-skill-cross-bonus'></span>").text("Cross-training: " + amount));
            $cross.append($("<span></span>").text("From " + active.map(function (source) { return source.name; }).join(", ")));
            if (skill.base_level !== undefined)
                $level.append($("<small class='party-skill-base-level'></small>")
                    .text("Base " + Number(skill.base_level).toFixed(1)));
        } else {
            $cross.text("Cross-trains with " + cross.sources.map(function (source) { return source.name; }).join(", "));
        }
        $name.append($cross);
        return [$name, $level];
    }

    function render(member) {
        if (identities[member.slot] !== member.player_id) {
            var prefix = "party_training_" + member.slot + "_";
            Object.keys(drafts).forEach(function (key) { if (key.indexOf(prefix) === 0) delete drafts[key]; });
            delete notices[member.slot];
            identities[member.slot] = member.player_id;
        }
        var reason = permission(member), disabled = Boolean(reason);
        var $section = $("<div class='party-skill-training'></div>");
        var $toolbar = $("<div class='party-training-toolbar'></div>");
        $toolbar.append($("<strong>Training</strong>"));
        [false, true].forEach(function (automatic) {
            var label = automatic ? "Automatic" : "Manual";
            $("<button type='button'></button>").text(label)
                .attr({ id: "party_training_mode_" + member.slot + "_" + automatic,
                    "aria-pressed": String(Boolean(member.auto_training) === automatic),
                    title: automatic ? "Allocate experience using recently practised skills." : "Divide experience among enabled skills; focused skills receive double weight." })
                .prop("disabled", disabled).on("click", function () {
                    if (Boolean(member.auto_training) !== automatic)
                        send(member, { action: "mode", automatic: automatic });
                }).appendTo($toolbar);
        });
        $section.append($toolbar, $("<p id='party_training_help' class='party-training-help'></p>")
            .text(reason || "Choose Off, On, or Focus. Stop levels save on Enter or when you leave the field; empty means no target. Reaching a target stops training. Setting a target keeps your current priority."));
        var status = notices[member.slot] || { text: "", error: false };
        $section.append($("<p class='party-training-status' role='status' aria-live='polite'></p>")
            .attr("id", "party_training_status_" + member.slot).text(status.text).toggleClass("is-error", status.error));
        var $table = $("<table class='party-insp-table party-skills-table'><thead><tr><th scope='col'>Skill</th><th scope='col'>Level</th><th scope='col'>Apt</th><th scope='col'>Train · XP share</th><th scope='col'>Stop at</th></tr></thead><tbody></tbody></table>");
        (member.skills || []).forEach(function (skill) {
            var locked = disabled || skill.can_train !== true || !Number.isInteger(skill.id);
            var $row = $("<tr></tr>").attr("data-skill-id", skill.id);
            $row.append(skillCells(skill));
            var apt = Number(skill.apt || 0);
            $row.append($("<td class='party-skill-apt'></td>").css("color", apt > 0 ? "var(--tt-ink-good)"
                : apt < 0 ? "var(--tt-ink-danger)" : "var(--tt-ink-soft)").text((apt > 0 ? "+" : "") + apt));
            var $train = $("<td class='party-skill-priority'></td>");
            var $buttons = $("<div class='party-skill-priorities' role='group'></div>")
                .attr("aria-label", skill.name + " training priority");
            ["Off", "On", "Focus"].forEach(function (label, value) {
                $("<button type='button'></button>").text(label).attr({
                    id: fieldId(member, skill, "train_" + value), "data-train": value,
                    "aria-pressed": String(Number(skill.train) === value),
                    "aria-label": skill.name + " training " + label,
                    title: locked ? (reason || "This skill cannot be trained.") : label === "Focus" ? "Give this skill double training weight." : label
                }).prop("disabled", locked).on("click", function () {
                    if (Number(skill.train) !== value)
                        send(member, { action: "train", skill: skill.id, train: value });
                }).appendTo($buttons);
            });
            $train.append($buttons, $("<small class='party-skill-share'></small>")
                .text(skill.training === undefined ? "" : skill.training + "% XP"));
            $row.append($train, targetCell(member, skill, locked));
            $table.find("tbody").append($row);
        });
        return $section.append($table);
    }

    // Shared by carried items, equipped sockets and the ground tray.
    function signature(member) {
        return JSON.stringify([member.skills, member.training_supported, member.training_locked, permission(member)]);
    }

    function itemEntries(member, item, guarded) {
        var entries = [];
        (item.training || []).forEach(function (entry) {
            var skill = (member.skills || []).find(function (skill) { return skill.id === entry.skill; });
            if (!skill) return;
            var blocked = actions.reason(member) || permission(member)
                || (skill.can_train !== true ? "This skill cannot be trained." : "");
            if (Number.isInteger(entry.target) && entry.target > 0 && entry.target <= 270) {
                var level = (entry.target / 10).toFixed(1);
                entries.push({ label: "Train " + skill.name + " to " + level, disabled: blocked,
                    detail: "Item target · enables training · no turn used",
                    run: guarded(function (hero) {
                        if (actions.reason(hero) || permission(hero)) return;
                        send(hero, { action: "target", skill: skill.id, target: entry.target, base: false, enable: true },
                            undefined, skill.name + " training target set to " + level + ".");
                    }) });
            }
            entries.push({ label: "Set " + skill.name + " target…", disabled: blocked,
                detail: "Choose a stop level and training priority",
                run: guarded(function (hero) {
                    if (actions.reason(hero) || permission(hero) || !window.crawl_party.open_inspector) return;
                    window.crawl_party.open_inspector(hero.slot, "skills");
                    var input = document.getElementById(fieldId(hero, skill, "target"));
                    if (input && !input.disabled) {
                        input.focus({ preventScroll: true }); input.select();
                        input.closest("tr").scrollIntoView({ block: "nearest" });
                    }
                }) });
        });
        return entries;
    }

    function captureFocus() {
        var active = document.activeElement;
        return active && active.id.indexOf("party_training_") === 0 ? active.id : "";
    }

    function restoreFocus(id) {
        var field = id && document.getElementById(id);
        if (field && !field.disabled) field.focus({ preventScroll: true });
    }

    return { render: render, itemEntries: itemEntries, signature: signature, captureFocus: captureFocus, restoreFocus: restoreFocus };
});
