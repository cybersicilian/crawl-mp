/* Shareable lobby identity, with private capability in the URL fragment. */
define(function () {
    "use strict";
    function hash(room) {
        return "#lobby-" + encodeURIComponent(room.room_id) + (room.visibility === "private" && room.invite_token
            ? "?invite=" + encodeURIComponent(room.invite_token) : "");
    }
    function parse(value) {
        var match = value.match(/^#lobby-([^?]+)(?:\?(.*))?$/i); if (!match) return null;
        try { return { room_id: decodeURIComponent(match[1]), invite: new URLSearchParams(match[2] || "").get("invite") || "" }; }
        catch (error) { return null; }
    }
    function url(room) { return location.origin + "/?view=friends" + hash(room); }
    return { hash: hash, parse: parse, url: url };
});
