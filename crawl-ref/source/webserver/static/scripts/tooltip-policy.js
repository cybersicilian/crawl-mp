define([], function () {
    "use strict";
    // One hover intent and pointer-travel policy for every client surface.
    // Explicit activation and keyboard focus show help immediately.
    return { hover_ms: 300, travel_ms: 360 };
});
