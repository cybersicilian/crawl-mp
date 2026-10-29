define(["./party-status-model"], function (status) {
    "use strict";

    // Compare immutable projections, never references to mutable native packets.
    // A delta is a net change between snapshots, not an inferred individual hit.
    function create() {
        var previous = new Map(), floor;
        function reset() { previous.clear(); floor = undefined; }
        function update(state) {
            var changedFloor = floor !== state.floor, events = [], next = new Map();
            if (changedFloor) previous.clear();
            floor = state.floor;
            (Array.isArray(state.members) ? state.members : []).forEach(function (hero) {
                if (!hero || !Number.isInteger(hero.slot)) return;
                var pos = hero.pos && Number.isInteger(hero.pos.x) && Number.isInteger(hero.pos.y)
                    ? { x: hero.pos.x, y: hero.pos.y } : null;
                var current = { name: hero.name, place: hero.place, pos: pos,
                    here: hero.on_same_level !== false, alive: hero.alive !== false && !hero.ghost_haunting,
                    hp: hero.hp, maximum: hero.hp_max, level: hero.xl, health: status.health(hero) };
                var old = previous.get(hero.slot);
                next.set(hero.slot, current);
                // Joining, changing floors/identities and returning from elsewhere are baselines.
                if (!old || old.name !== current.name || old.place !== current.place
                    || !old.here || !current.here || !old.alive) return;
                function emit(kind, extra) {
                    events.push(Object.assign({ kind: kind, slot: hero.slot, pos: pos }, extra));
                }
                if (current.alive && pos && old.pos) {
                    var dx = pos.x - old.pos.x, dy = pos.y - old.pos.y;
                    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1)
                        emit("step", { from: old.pos });
                }
                if (old.health.known && current.health.known && old.maximum === current.maximum
                    && old.hp !== current.hp) {
                    emit(current.hp < old.hp ? "damage" : "heal", {
                        amount: current.hp - old.hp,
                        // Forecast/capacity changes retain their exact native presentation.
                        echo: !old.health.poison && !current.health.poison
                            && old.health.capacity === current.health.capacity,
                        from: old.health.fill, to: current.health.fill
                    });
                }
                if (current.alive && Number.isInteger(old.level) && old.level > 0
                    && Number.isInteger(current.level) && current.level > old.level)
                    emit("level", { level: current.level });
            });
            previous = next;
            return { reset: changedFloor, events: events };
        }
        return { update: update, reset: reset };
    }
    return { create: create };
});
