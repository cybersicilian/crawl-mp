/* In-game shortcut into the shared Settings control. */
define(["settings-dialog"], function (settings) {
    "use strict";
    return { open: function () { settings.open({ category: "Appearance & graphics" }); } };
});
