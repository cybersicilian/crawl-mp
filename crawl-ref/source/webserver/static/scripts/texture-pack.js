/* Per-account art preference, shared by profile controls and every renderer. */
define(["jquery", "comm"], function ($, comm) {
    "use strict";
    var user = null, selected = "classic";
    var packs = ["classic", "illustrated"];
    function key() { return user ? "dcss:texture-pack:" + user.toLowerCase() : null; }
    function valid(value) { return packs.indexOf(value) !== -1; }
    function apply(value, persist) {
        if (!valid(value)) return false;
        if (persist && key()) {
            try { window.localStorage.setItem(key(), value); } catch (error) { /* Profile remains authoritative. */ }
        }
        if (selected === value) return true;
        selected = value;
        document.documentElement.dataset.texturePack = value;
        $(document).trigger("texture_pack_changed", [value]);
        return true;
    }
    function bindUser(username) {
        var next = typeof username === "string" && username ? username : null;
        if (user === next) return;
        user = next;
        var cached = "classic";
        try { if (key()) cached = window.localStorage.getItem(key()) || "classic"; } catch (error) { /* Private browsing. */ }
        apply(valid(cached) ? cached : "classic", false);
    }
    comm.register_handlers({ profile_appearance: function (data) {
        if (!user || typeof data.username !== "string" || data.username.toLowerCase() !== user.toLowerCase()) return;
        apply(data.texture_pack, data.available !== false);
    } });
    window.addEventListener("storage", function (event) {
        if (key() && event.key === key()) apply(event.newValue || "classic", false);
    });
    document.documentElement.dataset.texturePack = selected;
    return { bindUser: bindUser, select: function (value) { return apply(value, true); },
        current: function () { return selected; }, illustrated: function () { return selected === "illustrated"; } };
});
