/* Copy a public permalink without navigating away from the current workflow. */
define(["jquery"], function ($) {
    "use strict";

    function controls(path, name) {
        var root = $("<span class='share-link-controls'></span>");
        var button = $("<button type='button' class='workflow-button share-link-copy'>Copy link</button>")
            .attr("aria-label", "Copy link to " + name);
        var status = $("<span class='share-link-status' role='status'></span>");
        var field;
        function copied() {
            button.text("Link copied");
            status.removeClass("is-manual").text("Link copied. Ready to paste.");
            if (field) field.remove();
            field = null;
        }
        function fallback(url) {
            if (!field) {
                field = $("<input type='text' readonly class='share-link-url'>")
                    .attr("aria-label", "Link to " + name).appendTo(root);
                field.on("focus click", function () { this.select(); });
            }
            field.val(url)[0].focus();
            field[0].select();
            status.addClass("is-manual").text("Copy the selected link.");
        }
        button.on("click", function (event) {
            event.preventDefault(); event.stopPropagation();
            var url = new URL(path, window.location.href).href;
            // Invoke directly from the gesture; clipboard permissions need activation.
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    Promise.resolve(navigator.clipboard.writeText(url)).then(copied, function () { fallback(url); });
                    return;
                }
            } catch (error) { /* The selected URL works without clipboard access. */ }
            fallback(url);
        });
        // Keep item letters and editing shortcuts out of the native input stream.
        root.on("keydown keypress keyup", function (event) {
            if (event.key !== "Tab" && event.key !== "Escape") event.stopPropagation();
        }).on("click", function (event) { event.stopPropagation(); });
        return root.append(button, status);
    }

    return { controls: controls };
});
