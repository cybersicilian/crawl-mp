/* Independent LRU retention bounded by both entry count and caller-defined cost. */
define([], function () {
    "use strict";
    function create(budget, limit, weight) {
        if (!Number.isSafeInteger(budget) || budget < 0 || !Number.isSafeInteger(limit) || limit < 0)
            throw new RangeError("Cache limits must be nonnegative integers");
        var entries = new Map(), bytes = 0;
        function remove(key) {
            var old = entries.get(key);
            if (old) { bytes -= old.cost; entries.delete(key); }
        }
        return {
            get: function (key) {
                var entry = entries.get(key);
                if (!entry) return;
                entries.delete(key); entries.set(key, entry); return entry.value;
            },
            set: function (key, value) {
                var cost = weight(value);
                if (!Number.isSafeInteger(cost) || cost < 0) throw new RangeError("Invalid cache entry cost");
                remove(key);
                if (cost <= budget && limit) { entries.set(key, { value: value, cost: cost }); bytes += cost; }
                while (bytes > budget || entries.size > limit) remove(entries.keys().next().value);
                return value;
            },
            clear: function () { entries.clear(); bytes = 0; },
            stats: function () { return { entries: entries.size, bytes: bytes }; }
        };
    }
    return { create: create };
});
