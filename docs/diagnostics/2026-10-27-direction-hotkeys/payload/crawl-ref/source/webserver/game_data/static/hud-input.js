/* HUD focus must not strand native game commands behind local input isolation. */
define(["jquery", "./menu-keyboard"], function ($, keyboard) {
    "use strict";
    var root, interaction = "keyboard", navigating = false;
    var localInput = "#chat, #input_dialog, #mobile_input, .text, [role='menu'], [role='dialog']";

    function pointer() { interaction = "pointer"; navigating = false; }
    function keyIntent() { interaction = "keyboard"; }
    function focus(event) {
        if (root && root.contains(event.target)) navigating = interaction === "keyboard";
    }
    function route(event) {
        var palette = $(event.target).closest("#quickbar_more[open]")[0];
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.metaKey
            || ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)
            || keyboard.typing(event.target) || $(event.target).closest(localInput).length
            || !palette && $(event.target).closest(".workflow-expedition-details[open]").length
            || $("dialog[open], #ui-stack > *").length
            || document.body.classList.contains("hud-layout-editing")) return;
        // The palette is a non-modal browser of actions. Escape dismisses it
        // locally; gameplay keys leave it through the same native route as HUD keys.
        if (palette && event.key === "Escape") return;
        // Deliberate keyboard navigation retains Tab order. Pointer focus on a
        // HUD control must not turn the native auto-fight key into browser Tab.
        if (event.key === "Tab" && navigating) return;
        if (!event.ctrlKey && !event.altKey && !event.shiftKey
            && ["Enter", " "].includes(event.key)
            && $(event.target).is("button, a[href], summary, [role='button']")) return;

        // Document capture hotkeys have already had first refusal. Rejoin the
        // existing client translator once, before HUD stopPropagation handlers.
        // Keeping the original event preserves physical numpad/modifier data
        // and lets native preventDefault suppress browser scrolling/activation.
        var forwarded = $.event.fix(event);
        forwarded.target = document;
        event.stopImmediatePropagation();
        navigating = false;
        if (palette) palette.open = false;
        if (root.contains(document.activeElement)) document.activeElement.blur();
        $(document).trigger(forwarded);
    }
    function reset() {
        if (root) {
            root.removeEventListener("keydown", route, true);
            root.removeEventListener("keypress", route, true);
        }
        document.removeEventListener("pointerdown", pointer, true);
        document.removeEventListener("keydown", keyIntent, true);
        document.removeEventListener("focusin", focus, true);
        root = null; interaction = "keyboard"; navigating = false;
    }
    function init() {
        reset();
        root = document.getElementById("normal");
        if (!root) return;
        root.addEventListener("keydown", route, true);
        root.addEventListener("keypress", route, true);
        document.addEventListener("pointerdown", pointer, true);
        document.addEventListener("keydown", keyIntent, true);
        document.addEventListener("focusin", focus, true);
    }
    $(document).on("game_cleanup.hudInput", reset);
    return { init: init };
});
