// Pure presentation of native facts; no inferred health or hidden action energy.
define(["./party-status-model"], function (statuses) {
    "use strict";
    function project(enemy) {
        var remembered = enemy.perception === "last_known";
        var timed = !remembered && Number.isFinite(enemy.energy_deficit) && Number.isFinite(enemy.speed);
        var reading = remembered ? "Last known" : !timed ? "Unknown" : enemy.ready ? "Ready"
            : enemy.speed > 0 ? "Recovering" : "Paused";
        // The engine exposes six injury bands, not exact monster hit points.
        var levels = [100, 90, 70, 50, 30, 10, 0];
        var health = !remembered && Number.isInteger(enemy.damage_level) ? levels[enemy.damage_level] : undefined;
        var subject = { name: enemy.name, statuses_known: !remembered && enemy.statuses_known === true,
            statuses: remembered ? [] : enemy.statuses };
        return { remembered: remembered, timed: timed, reading: reading,
            statusSubject: subject, effects: remembered ? [] : statuses.effects(subject),
            initiative: timed ? Math.max(0, Math.min(100, 100 - enemy.energy_deficit * 10)) : null,
            health: health === undefined ? null : health,
            healthText: remembered ? "Health unknown" : enemy.health || "Health unknown" };
    }
    function layout(card, doom, viewport) {
        var edge = Math.min(card.left, doom && doom.width > 0 ? doom.left : card.left);
        var width = 158, gap = 8;
        var top = Math.max(4, Math.min(card.top, viewport.height - 100));
        return { compact: edge < width + gap + 4 || viewport.width < 700,
            left: edge - width - gap, top: top,
            maxHeight: Math.max(0, viewport.height - top - 12) };
    }
    function sameContact(left, right) {
        return Boolean(left && right && left.id === right.id && left.name === right.name && left.x === right.x && left.y === right.y
            && left.perception === right.perception);
    }
    return { project: project, layout: layout, sameContact: sameContact };
});
