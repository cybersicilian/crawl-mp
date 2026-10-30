/* Product-independent literal term matching for local collection views. */
define(function () {
    "use strict";
    function normalize(value) {
        return String(value == null ? "" : value).normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
    }
    function compile(value) {
        var query = normalize(value), terms = query ? query.split(" ") : [];
        return function (content) {
            var text = normalize(content);
            return terms.every(function (term) { return text.includes(term); });
        };
    }
    return { normalize: normalize, compile: compile };
});
