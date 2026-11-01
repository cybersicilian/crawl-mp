/* jQuery does avoidable work on calls that change nothing, and HUD updates make
   a lot of those calls: .text() replaces the text node even for the same text,
   and .hide() reads computed style, forcing a flush, for hidden elements too. */
define(["jquery"], function ($) {
    "use strict";
    var replace = $.fn.text, hide = $.fn.hide;
    $.fn.text = function (value) {
        if (typeof value !== "string" && typeof value !== "number") return replace.apply(this, arguments);
        var next = String(value);
        return this.each(function () {
            var only = this.firstChild;
            if (!only && !next) return;
            if (next && only && !only.nextSibling && only.nodeType === 3) {
                if (only.nodeValue !== next) only.nodeValue = next;
            } else replace.call($(this), next);
        });
    };
    $.fn.hide = function () {
        if (arguments.length) return hide.apply(this, arguments);
        for (var index = 0; index < this.length; index++) {
            var style = this[index].style;
            if (style && style.display !== "none") return hide.call(this);
        }
        return this;
    };
});
