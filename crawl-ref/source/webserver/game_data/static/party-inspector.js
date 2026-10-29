define(["require", "jquery", "./party-inspector-render", "./folio-keyboard"],
function (require, $, inspectorView, keyboard) {
    "use strict";
    var render_party_inspector_modal = inspectorView.render;

    function ensure_party_styles_and_dom()
    {
        if ($("#party_inspector_styles").length === 0)
        {
            $("<link id='party_inspector_styles' rel='stylesheet'>")
                .attr("href", require.toUrl("./styles/party-inspector.css"))
                .appendTo("head");
        }

        if ($("#dcss_rich_tooltip").length === 0)
        {
            $("<div id='dcss_rich_tooltip' role='tooltip' style='display:none'>" +
              "<div class='tip-title dcss-tip-title'></div>" +
              "<div class='tip-body dcss-tip-body'></div>" +
              "<div class='tip-meta dcss-tip-meta'></div>" +
              "</div>").appendTo("body");
        }

        if ($("#party_inspector_modal").length === 0)
        {
            var modal_html =
                "<dialog id='party_inspector_modal' closedby='any' aria-labelledby='party_inspector_heading'>" +
                    "<header class='party-insp-header'>" +
                        "<div class='party-insp-title-wrap'>" +
                            "<h1 id='party_inspector_heading'>Party Hero Inspector</h1>" +
                            "<span class='party-insp-subtitle'>Character records &middot; Party folio</span>" +
                        "</div>" +
                        "<form method='dialog' class='party-insp-close-form'>" +
                            "<button type='submit' value='close' id='party_inspector_close_btn' class='party-insp-close-btn'>Close &middot; Esc</button>" +
                        "</form>" +
                    "</header>" +
                    "<nav id='party_insp_hero_bar' class='party-insp-hero-bar' aria-label='Select Party Hero'></nav>" +
                    "<nav id='party_insp_tab_bar' class='party-insp-tab-bar' role='tablist' aria-label='Character sections' aria-orientation='horizontal'></nav>" +
                    "<p id='party_insp_key_help' class='workflow-key-help'></p>" +
                    "<div id='party_insp_body' class='party-insp-body'></div>" +
                "</dialog>";
            $(modal_html).appendTo("body");
            inspectorView.sections.forEach(function (section, index) {
                $("<button type='button' class='party-insp-tab-btn' role='tab'></button>")
                    .attr({ id: "party_insp_tab_" + section.key, "data-insp-tab": section.key,
                        "aria-controls": "party_insp_panel_" + section.key,
                        "aria-selected": String(index === 0), tabindex: index === 0 ? 0 : -1 })
                    .toggleClass("active", index === 0).text(section.label).appendTo("#party_insp_tab_bar");
            });

            var dialog_el = document.getElementById("party_inspector_modal");
            if (dialog_el)
            {
                // Let controls receive their keys before isolating the dungeon.
                ["keydown", "keypress", "keyup"].forEach(function (type) {
                    dialog_el.addEventListener(type, function (ev) { ev.stopPropagation(); });
                });
                dialog_el.addEventListener("close", function () {
                    window.crawl_party.inspector_focus = null;
                    if (window.dcss_tooltips) window.dcss_tooltips.hide();
                    $("#dcss_rich_tooltip").hide().attr("aria-hidden", "true").appendTo("body");
                });
                dialog_el.addEventListener("focusin", function (event) {
                    window.crawl_party.inspector_focus = /^party_(item|loadout)_/.test(event.target.id) ? event.target.id : null;
                });
                dialog_el.addEventListener("click", function (ev) {
                    if (ev.target === dialog_el && typeof dialog_el.close === "function")
                        dialog_el.close("backdrop");
                });
            }

            $("#party_insp_body").on("scroll", function () {
                if (!window.dcss_tooltips) return;
                var focused = document.activeElement;
                var described = focused && (focused.getAttribute("aria-describedby") || "").split(/\s+/);
                if (this.contains(focused) && described.indexOf("dcss_rich_tooltip") !== -1)
                    window.dcss_tooltips.position();
                else
                    window.dcss_tooltips.hide();
            });

            $("#party_insp_hero_bar").on("click", ".party-insp-hero-btn", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var slot = parseInt($(this).attr("data-insp-slot"), 10);
                if (!isNaN(slot))
                {
                    window.crawl_party.inspector_slot = slot;
                    render_party_inspector_modal();
                }
            });

            $("#party_insp_tab_bar").on("click", ".party-insp-tab-btn", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                var tab = $(this).attr("data-insp-tab") || "overview";
                inspectorView.selectTab(tab, true);
                keyboard.hint();
            });
        }
    }

    // player.js owns delegated mouse and keyboard rich-tooltip rendering.
    function bind_party_rich_tooltips()
    {
        ensure_party_styles_and_dom();
        $("#dcss_rich_tooltip").attr("role", "tooltip").removeAttr("hidden");
    }

    function open_party_inspector(slot, tab)
    {
        ensure_party_styles_and_dom();
        window.crawl_party = window.crawl_party || { state: null, pings: [] };
        if (slot !== undefined && slot !== null)
            window.crawl_party.inspector_slot = Number(slot);
        if (tab)
            window.crawl_party.inspector_tab = String(tab);
        else if (!window.crawl_party.inspector_tab)
            window.crawl_party.inspector_tab = "overview";

        render_party_inspector_modal();
        keyboard.hint();
        var dialog_el = document.getElementById("party_inspector_modal");
        if (dialog_el)
        {
            $("#dcss_rich_tooltip").appendTo(dialog_el).hide();
            if (typeof dialog_el.showModal === "function")
            {
                if (!dialog_el.open)
                {
                    try
                    {
                        dialog_el.showModal();
                    }
                    catch (e)
                    {
                        dialog_el.setAttribute("open", "");
                    }
                }
            }
            else
            {
                dialog_el.setAttribute("open", "");
            }
        }
    }

    window.crawl_party = window.crawl_party || { state: null, pings: [] };
    window.crawl_party.open_inspector = open_party_inspector;
    $(document).on("game_actions_changed.inspector", function () {
        var dialog = document.getElementById("party_inspector_modal");
        if (dialog && dialog.open) render_party_inspector_modal();
    });

    var party_inspector_keys_bound = false;
    function bind_party_inspector_hotkeys()
    {
        if (party_inspector_keys_bound)
            return;
        party_inspector_keys_bound = true;

        window.addEventListener("keydown", function (ev) {
            var help = document.getElementById("workflow_help_dialog");
            if (help && help.open) return;
            var picker = document.getElementById("power_picker_dialog");
            if (picker && picker.open) return;
            var inspection = document.getElementById("inspection_dialog");
            if (inspection && inspection.open) return;
            var dialog_el = document.getElementById("party_inspector_modal");
            var is_open = Boolean(dialog_el && dialog_el.open);
            var tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
            var is_typing = (tag === "input" || tag === "textarea" || tag === "select" || (ev.target && ev.target.isContentEditable));

            if (is_open)
            {
                if (ev.key === "Escape")
                {
                    var tip = document.getElementById("dcss_rich_tooltip");
                    if (tip && tip.getAttribute("aria-hidden") === "false" && window.dcss_tooltips)
                        window.dcss_tooltips.dismiss();
                    else
                        dialog_el.close("escape");
                    ev.preventDefault();
                    ev.stopPropagation();
                    return;
                }
                var tabButton = ev.target && ev.target.closest ? ev.target.closest(".party-insp-tab-btn") : null;
                if (keyboard.handle(dialog_el, ev, inspectorView)) return;
                if (tabButton && !ev.ctrlKey && !ev.altKey && !ev.metaKey &&
                    (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "Home" || ev.key === "End"))
                {
                    var tabs = Array.prototype.slice.call(dialog_el.querySelectorAll("[role='tab']"));
                    var current = tabs.indexOf(tabButton), next = current;
                    if (ev.key === "Home") next = 0;
                    else if (ev.key === "End") next = tabs.length - 1;
                    else next = (current + (ev.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                    inspectorView.selectTab(tabs[next].getAttribute("data-insp-tab"), true);
                    keyboard.hint();
                    ev.preventDefault();
                    ev.stopPropagation();
                    return;
                }
                if (!is_typing && !ev.ctrlKey && !ev.altKey && !ev.metaKey && (ev.key === "1" || ev.key === "2" || ev.key === "3" || ev.key === "4"))
                {
                    var idx = parseInt(ev.key, 10) - 1;
                    var st = window.crawl_party && window.crawl_party.state;
                    if (st && st.members && st.members[idx])
                    {
                        window.crawl_party.inspector_slot = st.members[idx].slot;
                        render_party_inspector_modal();
                        ev.preventDefault();
                        ev.stopPropagation();
                    }
                    return;
                }
                return;
            }

            // Outside the folio, I browses spells and function keys belong to
            // the native game menu / user macros. Hero cards open this panel.
        }, true);
    }

    return { ensure: ensure_party_styles_and_dom, tooltips: bind_party_rich_tooltips, hotkeys: bind_party_inspector_hotkeys, open: open_party_inspector, render: render_party_inspector_modal };
});
