define([], function () {
    "use strict";

    function valid(clock) {
        return clock && typeof clock.active === "boolean" && typeof clock.immune === "boolean"
            && Number.isFinite(clock.remaining_aut) && clock.remaining_aut >= 0
            && Number.isFinite(clock.reference_aut) && clock.reference_aut > 0
            && Number.isInteger(clock.warning) && clock.warning >= 0 && clock.warning <= 3
            && Number.isInteger(clock.short_lifespans) && clock.short_lifespans >= 0
            && Number.isInteger(clock.lifespan_divisor) && clock.lifespan_divisor >= 1;
    }

    function project(state) {
        var members = state && Array.isArray(state.members) ? state.members.filter(function (hero) {
            return hero.alive !== false && !hero.ghost_haunting;
        }) : [];
        if (!members.length || members.some(function (hero) { return !valid(hero.zot_clock); }))
            return { status: "unknown" };
        var running = members.filter(function (hero) { return hero.zot_clock.active; });
        var candidates = running.length ? running : members.filter(function (hero) { return !hero.zot_clock.immune; });
        if (!candidates.length) return { status: "stopped" };
        var next = candidates.reduce(function (first, hero) {
            return hero.zot_clock.remaining_aut < first.zot_clock.remaining_aut ? hero : first;
        });
        var clock = next.zot_clock;
        return { status: running.length ? "running" : "paused", hero: next.name, place: next.place,
            turns: clock.remaining_aut / 10, fraction: Math.min(1, clock.remaining_aut / clock.reference_aut),
            warning: clock.warning, pressure: clock.lifespan_divisor, shortLifespans: clock.short_lifespans };
    }

    function turns(value) {
        // Keep the fractional turn visible near zero rather than announcing Zot early.
        return (Math.ceil(value * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
    }

    return { project: project, turns: turns };
});
