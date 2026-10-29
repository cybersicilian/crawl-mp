define(["require", "jquery", "rich-text"], function (require, $, richText) {
    "use strict";
    var dialog, opener;
    function ensure() {
        if (dialog) return;
        $("<link rel='stylesheet'>").attr("href", require.toUrl("./styles/inspection-dialog.css")).appendTo("head");
        dialog = $("<dialog id='inspection_dialog' closedby='any' aria-labelledby='inspection_heading'>" +
            "<header><h1 id='inspection_heading' tabindex='-1'></h1>" +
            "<button type='button'>Close · Esc</button></header>" +
            "<div id='inspection_body'></div><p id='inspection_context'></p></dialog>").appendTo("body")[0];
        dialog.querySelector("button").addEventListener("click", function () { dialog.close(); });
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener("close", function () {
            if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        });
    }
    function show(title, description, context) {
        showContent(title, $("<div></div>").html(richText.render(description || "Description unavailable."))[0], context);
    }
    function showContent(title, content, context) {
        ensure(); opener = document.activeElement;
        $("#inspection_heading").text(title);
        $("#inspection_body").empty().append(content);
        $("#inspection_context").text(context || "");
        if (!dialog.open) dialog.showModal();
        document.getElementById("inspection_heading").focus({ preventScroll: true });
    }
    $(document).on("game_cleanup.inspection", function () { if (dialog && dialog.open) dialog.close(); });
    return { show: show, showContent: showContent };
});
