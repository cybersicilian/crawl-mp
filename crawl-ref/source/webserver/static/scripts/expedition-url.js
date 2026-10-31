/* Stable expedition identity, independent of launch mode or host name. */
define(function () {
    "use strict";
    function hash(id) { return "#expedition-" + encodeURIComponent(id); }
    function parse(value) {
        var match = value.match(/^#expedition-(.*)$/i);
        if (!match) return null;
        try { return { id: decodeURIComponent(match[1]) }; }
        catch (error) { return { id: "" }; }
    }
    return { hash: hash, parse: parse };
});
