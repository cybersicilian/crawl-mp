/* Pure turn-order projection: who acts when, gathered into beats of shared time. */
define([], function () {
    "use strict";
    function order(entries) {
        return entries.slice().sort(function (a, b) {
            var ka = a.wait === null, kb = b.wait === null;
            if (ka !== kb) return ka ? 1 : -1;
            if (!ka && a.wait !== b.wait) return a.wait - b.wait;
            if (a.banked !== b.banked) return b.banked - a.banked;
            if (a.kind !== b.kind) return a.kind === "hero" ? -1 : 1;
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
    }
    function readingText(wait) {
        return wait === null ? "?" : wait === 0 ? "Now" : "+" + wait;
    }
    function identical(left, right) {
        return left.kind === "enemy" && right.kind === "enemy" && left.name === right.name
            && left.state === right.state && left.threat === right.threat;
    }
    // Identical creatures acting together share a token. Past the limit only a
    // count remains, because the creature roster already lists everyone.
    function beats(entries, limit) {
        var result = [], tokens = 0, hidden = 0;
        order(entries).forEach(function (entry) {
            var beat = result[result.length - 1], key = String(entry.wait);
            var last = beat && beat.key === key ? beat.tokens[beat.tokens.length - 1] : null;
            if (last && identical(last, entry)) { last.count++; return; }
            if (tokens >= limit) { hidden++; return; }
            if (!beat || beat.key !== key) {
                beat = { key: key, wait: entry.wait, reading: readingText(entry.wait), tokens: [] };
                result.push(beat);
            }
            beat.tokens.push(Object.assign({}, entry, { count: 1 }));
            tokens++;
        });
        return { beats: result, hidden: hidden };
    }
    return { order: order, readingText: readingText, beats: beats };
});
