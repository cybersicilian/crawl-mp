define(["jquery", "./tooltip-glossary", "tooltip-content", "rich-text"], function ($, glossary, content, richText) {
    "use strict";
    function open(data, source) {
        var old = document.getElementById("workflow_help_dialog");
        if (old) old.remove();
        var dialog = document.createElement("dialog");
        dialog.id = "workflow_help_dialog"; dialog.setAttribute("aria-labelledby", "workflow_help_title");
        var title = document.createElement("h2"); title.id = "workflow_help_title";
        content.renderTitle(title, data.title);
        var body = document.createElement("div"); body.className = "workflow-help-body";
        if (data.heat) content.render(body, data.body, "", data.heat);
        else body.innerHTML = richText.render(data.body);
        var close = document.createElement("button"); close.type = "button"; close.className = "workflow-button";
        close.textContent = "Close · Esc"; close.addEventListener("click", function () { dialog.close(); });
        dialog.append(close, title, body);
        var container = source && source.closest("dialog[open], #ui-stack > *");
        (container || document.body).appendChild(dialog);
        glossary.linkify(body, { exclude: data.id ? { [data.id]: true } : {} });
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        dialog.addEventListener("close", function () {
            dialog.remove(); if (source && source.isConnected) source.focus({ preventScroll: true });
        });
        dialog.showModal();
    }
    $(document).on("click.persistentHelp", ".dcss-term", function (event) {
        event.preventDefault(); event.stopPropagation();
        var entry = glossary.get(this.getAttribute("data-term"));
        if (entry) open(entry, this);
    }).on("keydown.persistentHelp keypress.persistentHelp", ".dcss-term", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault(); event.stopPropagation();
        if (event.type === "keydown") this.click();
    }).on("game_cleanup.persistentHelp", function () { $("#workflow_help_dialog").remove(); });
    return { open: open };
});
