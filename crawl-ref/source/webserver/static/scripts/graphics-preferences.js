/* Account authority, optimistic field patches and serialized automatic saves. */
define(["jquery", "comm", "graphics-settings-model", "ui-theme"], function ($, comm, model, theme) {
    "use strict";
    var user = null, epoch = 0, revision = 0, confirmed = model.defaults(), pending = {}, sending = null;
    var ready = false, available = false, error = "", refreshing = null;
    function snapshot() {
        return { username: user, revision: revision, ready: ready, available: available, error: error,
            saving: Boolean(sending || Object.keys(pending).length),
            settings: Object.assign({}, confirmed, sending || {}, pending), schema: model.schema() };
    }
    function emit() {
        var state = snapshot(); theme.apply(state.settings.ui_theme);
        $(document).trigger("graphics_settings_changed", [state]);
    }
    function sameUser(value) { return user && typeof value === "string" && user.toLowerCase() === value.toLowerCase(); }
    function receive(data) {
        if (!data || !sameUser(data.username) || !Number.isSafeInteger(data.revision) || data.revision < 0
            || !model.configure(data.schema)) return false;
        if (data.revision < revision) return true;
        revision = data.revision; available = data.available !== false; ready = true;
        confirmed = available ? model.normalize(data.settings) : model.defaults();
        if (!available) error = "Graphics settings are temporarily unavailable.";
        emit(); return true;
    }
    function refresh() {
        if (!user || refreshing) return refreshing || Promise.resolve(false);
        var generation = epoch;
        refreshing = fetch("/api/profile/graphics", { credentials: "same-origin", cache: "no-store" })
            .then(function (response) { if (!response.ok) throw new Error("Read failed"); return response.json(); })
            .then(function (data) {
                if (generation !== epoch) return false;
                if (!receive(data)) throw new Error("Your sign-in changed. Reopen graphics settings.");
                error = ""; emit(); return true;
            }).catch(function () {
                if (generation === epoch) { error = "Could not load account graphics settings. Retry when connected."; emit(); }
                return false;
            }).finally(function () { if (generation === epoch) refreshing = null; });
        return refreshing;
    }
    function token() {
        var cookie = document.cookie.split(";").map(function (part) { return part.trim(); })
            .find(function (part) { return part.indexOf("_xsrf=") === 0; });
        return cookie ? decodeURIComponent(cookie.slice(6)) : "";
    }
    function flush() {
        if (sending || !user || !ready || !available) return;
        var patch = {};
        Object.keys(pending).forEach(function (key) { if (pending[key] !== confirmed[key]) patch[key] = pending[key]; });
        pending = {};
        if (!Object.keys(patch).length) { emit(); return; }
        var generation = epoch, owner = user;
        sending = patch; emit();
        var prepare = token() ? Promise.resolve(true) : refresh();
        prepare.then(function () {
            if (generation !== epoch || !token()) throw new Error("Sign-in changed");
            return fetch("/api/profile/graphics", { method: "POST", credentials: "same-origin",
                headers: { "Content-Type": "application/json", "X-XSRFToken": token(), "X-Profile-User": owner },
                body: JSON.stringify({ changes: patch }) });
        }).then(function (response) {
            if (!response.ok) throw new Error("Save failed"); return response.json();
        }).then(function (data) {
            if (generation !== epoch) return;
            if (!sameUser(data.username)) throw new Error("Sign-in changed");
            if (data.revision >= revision && !receive(data)) throw new Error("Invalid response");
            error = "";
            try { window.localStorage.setItem("dcss:graphics-update:" + owner.toLowerCase(), data.revision + ":" + Date.now()); }
            catch (ignored) { /* Account and socket state remain authoritative. */ }
        }).catch(function () {
            if (generation === epoch) error = "Could not save. Your last saved graphics have been restored. Try again.";
        }).finally(function () {
            if (generation !== epoch) return;
            sending = null; emit(); flush();
        });
    }
    function bindUser(username, initial) {
        var next = typeof username === "string" && username ? username : null;
        if (next === user) { if (initial) receive(initial); return; }
        epoch++; user = next; revision = 0; confirmed = model.defaults(); pending = {};
        sending = refreshing = null; error = ""; ready = available = false; emit();
        if (user) { if (initial) receive(initial); refresh(); }
    }
    theme.apply(confirmed.ui_theme);
    comm.register_handlers({ profile_graphics: receive });
    window.addEventListener("storage", function (event) {
        if (user && event.key === "dcss:graphics-update:" + user.toLowerCase()) refresh();
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    return { bindUser: bindUser, receive: receive, refresh: refresh, snapshot: snapshot,
        change: function (changes) {
            var patch = model.validate(changes);
            if (!patch || !user || !ready || !available) return false;
            pending = Object.assign(pending, patch); error = ""; emit(); flush(); return true;
        } };
});
