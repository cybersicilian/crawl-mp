/* Thin adapters for the engine's native menu fields. */
define(["jquery", "./util", "text-columns"], function ($, util, columns) {
    "use strict";
    function layout(menu) {
        var title = $("<div></div>").html(util.formatted_string_to_html(menu.title.text)).text();
        if (menu.tag === "shop") {
            return { title: title, kind: "shop", labels: ["Item", "Price"] };
        }
        if (menu.tag === "spell" && /\sType\s+/.test(title) && /Level\s*$/.test(title)) {
            return { title: title.split(/\s{2,}Type\s+/)[0].trim(), kind: "spells",
                labels: ["Spell", "Type", "Failure", "Level"], starts: [0, 32, 58], level: true };
        }
        if (menu.tag === "spell" && /\sPower\s+Damage\s+Range\s+Noise/.test(title)) {
            return { title: title.split(/\s{2,}Power\s+/)[0].trim(), kind: "spell-details",
                labels: ["Spell", "Power", "Damage", "Range", "Noise"], starts: [0, 32, 42, 52, 60] };
        }
        if (menu.tag === "ability" && /\sCost\s+Failure/.test(title)) {
            return { title: title.split(/\s{2,}Cost\s+/)[0].trim(), kind: "abilities",
                labels: ["Ability", "Cost", "Failure"], starts: [0, 32, 64] };
        }
        return null;
    }
    function fields(spec, text) {
        if (spec.kind === "shop") {
            // ShopEntry sends the authoritative stack price before the name.
            // Match its grammar rather than assuming a four-digit price width.
            var stock = text.match(/^(\s*\S\s+[-+$]\s+)(\d+ gold)\s+(\S.*)$/);
            if (!stock) return null;
            return [[text.length - stock[3].length, text.length],
                [stock[1].length, stock[1].length + stock[2].length]];
        }
        var prefix = text.match(/^\s*\S\s+[+-]\s/);
        var start = prefix ? prefix[0].length : text.startsWith("     ") ? 5 : 0;
        var body = text.slice(start), starts = spec.starts.slice();
        // A final level can move for Revenants' alternate failure percentage.
        if (spec.level) {
            var level = body.match(/\d+\s*$/);
            if (!level || level.index < 58) return null;
            starts.push(level.index);
        }
        if (body.length <= starts[starts.length - 1]) return null;
        return starts.map(function (offset, index) {
            return [start + offset, index + 1 < starts.length ? start + starts[index + 1] : text.length];
        });
    }
    function item(item, element, menu) {
        var spec = menu.column_layout;
        if (!spec || item.level !== 2 || typeof item.text !== "string") return false;
        var source = document.createElement("div");
        source.innerHTML = util.formatted_string_to_html(item.text);
        var ranges = fields(spec, source.textContent);
        if (!ranges) return false;
        var icon = element.children("canvas").detach(), key = element.children("kbd").detach();
        element.empty().addClass("workflow-table-row").css("min-height", "");
        if (icon.length) element.append(icon);
        else element.append("<span class='workflow-table-icon' aria-hidden='true'></span>");
        var stats = $("<span class='workflow-table-stats'></span>");
        spec.labels.forEach(function (label, index) {
            var cell = $("<span class='workflow-table-cell'></span>");
            if (index) cell.append($("<span class='workflow-field-label'></span>").text(label + ": "));
            else cell.addClass("workflow-table-name");
            var content = columns.slice(source, ranges[index][0], ranges[index][1]);
            if (!content.textContent.trim()) cell.append($("<span aria-label='Not applicable'>—</span>"));
            else cell.append(content);
            if (!index && spec.kind === "shop") {
                var state = source.textContent.match(/^\s*\S\s+([+$])\s/);
                if (state) cell.append(" ", $("<span class='workflow-state'></span>")
                    .text(state[1] === "+" ? "Selected" : "Shopping list"));
            }
            (index ? stats : element).append(cell);
        });
        element.append(stats, key.length ? key : $("<span class='workflow-table-key'></span>"));
        return true;
    }
    function title(menu) {
        var root = menu.elem, spec = layout(menu);
        menu.column_layout = spec;
        root.toggleClass("workflow-table-menu", Boolean(spec));
        root.children(".workflow-table-head").remove();
        if (!spec) { root.removeAttr("data-column-layout"); return; }
        root.attr("data-column-layout", spec.kind);
        var title = root.children(".menu_title").text(spec.title);
        var header = $("<div class='workflow-table-head' aria-hidden='true'><span></span></div>");
        spec.labels.forEach(function (label) { header.append($("<span></span>").text(label)); });
        header.append("<span></span>").insertAfter(title);
        // Native mode changes can update the title independently of the rows.
        $.each(menu.items, function (index, entry) {
            if (entry && entry.elem) item(entry, entry.elem, menu);
        });
    }
    function trimPrefix(source, key) {
        var text = source.textContent, prefix = text.match(/^\s*(\S)\s+[-+#$]\s+/);
        if (!prefix || prefix[1] !== key) return;
        var content = columns.slice(source, prefix[0].length, text.length);
        source.replaceChildren(content);
    }
    return { title: title, item: item, trimPrefix: trimPrefix };
});
