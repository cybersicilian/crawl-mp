/* Local, read-only reference. Movement and quickbar labels reuse their models. */
define(["require", "jquery", "./inspection-dialog", "./route-plan", "./quickbar-model"],
function (require, $, inspection, routes, quickbar) {
    "use strict";
    var styled = false;
    var sections = [
        { title: "Explore & fight", shortcuts: [
            ["o", "Auto-explore"], ["Tab", "Auto-fight"], [".", "Wait one turn"],
            ["Numpad 5", "Rest & recover"], ["g", "Pick up"], ["< / >", "Use stairs"]
        ] },
        { title: "Your character", shortcuts: [
            ["i", "Inventory & equipment"], ["I", "Spells & abilities"], ["z", "Cast a spell"],
            ["a", "Use an ability"], ["m", "Skills & training"], ["A", "Mutations & traits"]
        ] },
        { title: "Look & plan", shortcuts: [
            ["x", "Examine surroundings"], ["X", "Level map"], ["Shift + click", "Plan a route"],
            ["Cmd / Ctrl + F", "Find discovered items"], ["Ctrl + P", "Message history"]
        ] }
    ];
    function section(title, shortcuts) {
        var root = $("<section></section>").append($("<h2></h2>").text(title));
        var list = $("<dl></dl>").appendTo(root);
        shortcuts.forEach(function (shortcut) {
            list.append($("<div class='common-hotkey-row'></div>")
                .append($("<dt></dt>").append($("<kbd></kbd>").text(shortcut[0])),
                    $("<dd></dd>").text(shortcut[1])));
        });
        return root;
    }
    function open() {
        var root = $("<div class='common-hotkeys'></div>");
        var movement = $("<section class='common-hotkey-movement'></section>")
            .append($("<h2>Move or melee attack</h2>"));
        var compass = $("<div class='common-hotkey-compass' role='list' aria-label='Movement keys'></div>");
        routes.directions.forEach(function (direction, index) {
            if (index === 4) compass.append("<span aria-hidden='true'></span>");
            compass.append($("<div role='listitem'></div>")
                .attr("aria-label", direction.name + ": " + direction.key + " or Numpad " + direction.numpad)
                .append($("<span aria-hidden='true'></span>").text(direction.arrow),
                    $("<kbd></kbd>").text(direction.key), $("<small></small>").text("Num " + direction.numpad)));
        });
        movement.append(compass, $("<p></p>").text("Arrow keys also move north, south, east and west."));
        root.append(movement);
        sections.forEach(function (entry) { root.append(section(entry.title, entry.shortcuts)); });
        root.append(section("Quick access", [
            [quickbar.shortcut(0) + "–" + quickbar.shortcut(quickbar.count - 1), "Assigned quickbar actions"],
            ["Esc", "Game menu / cancel current prompt"], ["F12", "Expedition chat"], ["?", "Full native keyboard help"]
        ]));
        inspection.showContent("Common hotkeys", root[0],
            "Assigned number-row keys use your quickbar; the physical number pad moves your hero. Capital letters require Shift. Reading this reference takes no turn.");
    }
    function init() {
        if (!document.getElementById("dcss_quick_dock")) return;
        if (!styled) {
            $("<link rel='stylesheet'>").attr("href", require.toUrl("./styles/common-hotkeys.css")).appendTo("head");
            styled = true;
        }
        if (document.getElementById("dock_common_hotkeys")) return;
        $("<button type='button' id='dock_common_hotkeys' class='dcss-dock-btn' aria-haspopup='dialog'>Common hotkeys</button>")
            .attr({ "data-tip-title": "Common hotkeys", "data-tip-body": "Movement, exploration, combat and interface shortcuts. Takes no turn." })
            .on("click", open)
            .on("keydown keypress keyup", function (event) { event.stopPropagation(); })
            .appendTo("#dcss_quick_dock");
    }
    $(document).on("game_cleanup.commonHotkeys", function () { $("#dock_common_hotkeys").remove(); });
    return { init: init, open: open };
});
