/* Account-owned tilesets: optimistic rendering with serialized, guarded saves. */
define(["jquery", "texture-pack", "graphics-preferences"], function ($, texturePack, graphics) {
    "use strict";
    var user = null, epoch = 0, edit = 0, confirmed = "classic", desired = "classic";
    var ready = false, available = false, sending = false, refreshing = null, error = "";
    function valid(value) { return value === "classic" || value === "illustrated"; }
    function snapshot() {
        return { username: user, selected: desired, ready: ready, available: available, saving: sending, error: error };
    }
    function emit() { $(document).trigger("appearance_settings_changed", [snapshot()]); }
    function sameUser(value) { return user && typeof value === "string" && value.toLowerCase() === user.toLowerCase(); }
    function receive(data) {
        if (!data || !sameUser(data.username) || !valid(data.texture_pack)) return false;
        if (sending) { texturePack.preview(desired); return true; }
        ready = true; available = data.available !== false;
        confirmed = desired = available ? data.texture_pack : "classic";
        texturePack.select(desired);
        error = available ? "" : "Tileset settings are temporarily unavailable.";
        emit(); return true;
    }
    function refresh() {
        if (!user || refreshing) return refreshing || Promise.resolve(false);
        var generation = epoch, version = edit;
        refreshing = fetch("/api/profile/appearance", { credentials: "same-origin", cache: "no-store" })
            .then(function (response) { if (!response.ok) throw new Error("Read failed"); return response.json(); })
            .then(function (data) {
                if (generation !== epoch || version !== edit || sending) return false;
                if (!receive(data)) throw new Error("Sign-in changed");
                return true;
            }).catch(function () {
                if (generation === epoch && version === edit) {
                    error = "Could not load your tileset. Retry when connected."; emit();
                }
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
        if (sending || !user || !ready || !available || desired === confirmed) return;
        var generation = epoch, owner = user, value = desired;
        sending = true; emit();
        fetch("/api/profile/appearance", { method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-XSRFToken": token(), "X-Profile-User": owner },
            body: JSON.stringify({ texture_pack: value }) })
            .then(function (response) { if (!response.ok) throw new Error("Save failed"); return response.json(); })
            .then(function (data) {
                if (generation !== epoch) return;
                if (!sameUser(data.username) || data.texture_pack !== value || data.available === false)
                    throw new Error("Sign-in changed");
                confirmed = value; error = "";
            }).catch(function () {
                if (generation !== epoch) return;
                if (desired === value) {
                    desired = confirmed;
                    error = "Could not save. Your previous tileset has been restored. Try again.";
                }
            }).finally(function () {
                if (generation !== epoch) return;
                sending = false;
                if (desired === confirmed) texturePack.select(desired);
                else texturePack.preview(desired);
                emit(); flush();
            });
    }
    function bindUser(username, initial) {
        var next = typeof username === "string" && username ? username : null;
        if (next === user) return;
        epoch++; edit++; user = next; confirmed = desired = "classic";
        ready = available = sending = false; refreshing = null; error = "";
        texturePack.bindUser(user);
        if (initial) receive(initial);
        emit(); refresh();
    }
    $(document).on("profile_appearance_received.appearancePreferences", function (event, data) { receive(data); });
    $(document).on("graphics_settings_changed.appearancePreferences", function (event, state) { bindUser(state.username); });
    window.addEventListener("storage", function (event) {
        if (user && event.key === "dcss:texture-pack:" + user.toLowerCase()) refresh();
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    bindUser(graphics.snapshot().username);
    return { bindUser: bindUser, snapshot: snapshot, refresh: refresh,
        change: function (value) {
            if (!user || !ready || !available || !valid(value)) return false;
            edit++; desired = value; error = ""; texturePack.preview(value); emit(); flush(); return true;
        } };
});
