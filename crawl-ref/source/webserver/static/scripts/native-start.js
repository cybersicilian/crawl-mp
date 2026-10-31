/* Native snapshots are cached by the complete selection and reserved roll. */
define(function () {
    "use strict";
    var cache = new Map(), scheduled = new Map();
    function parameters(build) {
        return {
            species: build.species && build.species.name || "", job: build.job && build.job.name || "",
            weapon: build.weapon || "", trait: build.trait || "none", seed: build.seed || "", name: build.name,
            multiplayer: String(build.multiplayer === true),
            role: build.companion ? "companion" : "leader", game_id: build.gameId || "", modifiers: build.modifiers || ""
        };
    }
    function key(build) { return JSON.stringify(parameters(build)); }
    function notify(record) { window.dispatchEvent(new CustomEvent("native-start-updated", { detail: record.key })); }
    function get(build) {
        var id = key(build);
        if (cache.has(id)) return cache.get(id);
        var values = parameters(build), scope = values.seed + "|" + values.role;
        var record = { key: id, status: "loading", snapshot: null };
        if (!values.seed || !values.game_id) {
            record.status = "unavailable";
            return record;
        }
        var previous = scheduled.get(scope);
        if (previous) { clearTimeout(previous.timer); cache.delete(previous.key); }
        record.timer = setTimeout(function () {
            scheduled.delete(scope);
            fetch("/api/character-preview?" + new URLSearchParams(values), { credentials: "same-origin" })
                .then(function (response) { if (!response.ok) throw new Error("Starting sheet unavailable"); return response.json(); })
                .then(function (snapshot) {
                    if (!["hp", "mp", "ac", "ev", "sh", "str", "int", "dex"].every(function (name) { return Number.isFinite(snapshot[name]); })
                        || !Array.isArray(snapshot.doll)) throw new Error("Incomplete starting sheet");
                    record.status = "ready"; record.snapshot = snapshot; notify(record);
                }).catch(function () { record.status = "error"; notify(record); });
        }, 180);
        scheduled.set(scope, record); cache.set(id, record);
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return record;
    }
    function retry(build) { cache.delete(key(build)); return get(build); }
    return { get: get, key: key, retry: retry };
});
