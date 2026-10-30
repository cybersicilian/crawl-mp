define(["jquery", "comm", "./nested-tips", "./tip-placement", "tooltip-policy", "tooltip-source", "tooltip-content"],
function ($, comm, nested, placement, policy, sources, content) {
    "use strict";

    function init_dcss_tooltips_and_dock()
    {
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        sources.observe(document.body);
        var active_el = null;
        var inline_node = null;
        var pointer_position = null, ignored_position = null;
        var open_timer = null, pending_el = null;
        var anchor = sources.track(hide_tip);

        function eligible(target) {
            // These delegated handlers survive the return to expedition setup.
            return sources.visible(target) && !target.closest("#lobby, #loader");
        }

        function queue_tip(target) {
            if (!eligible(target)) return;
            if (target === active_el || target === pending_el) return;
            hide_tip();
            if (target.closest("[data-tip-inline]")) { show_tip(target); return; }
            pending_el = target;
            anchor.set(target);
            open_timer = setTimeout(function () {
                open_timer = pending_el = null;
                if (eligible(target)) show_tip(target);
            }, policy.hover_ms);
        }

        function stationary_pointer(ev)
        {
            if (ignored_position && ev.clientX === ignored_position.x && ev.clientY === ignored_position.y) return true;
            ignored_position = null;
            return false;
        }

        function unlink_tip(target)
        {
            if (!target) return;
            var ids = (target.getAttribute("aria-describedby") || "").split(/\s+/)
                .filter(function (id) { return id && id !== "dcss_rich_tooltip"
                    && (!inline_node || id !== inline_node.id); });
            if (ids.length) target.setAttribute("aria-describedby", ids.join(" "));
            else target.removeAttribute("aria-describedby");
        }

        function get_tip_node()
        {
            var el = document.getElementById("dcss_rich_tooltip");
            if (!el && document.getElementById("normal"))
            {
                el = document.createElement("div");
                el.id = "dcss_rich_tooltip";
                el.style.display = "none";
                el.setAttribute("aria-hidden", "true");
                document.getElementById("normal").appendChild(el);
            }
            return el;
        }

        function render_tip_content(target, tip_node)
        {
            var title = target.getAttribute("data-tip-title") || "";
            var badge = target.getAttribute("data-tip-key")
                        || target.getAttribute("data-tip-badge")
                        || "";
            var body = nested.body_for(target)
                       || target.getAttribute("data-tip-body")
                       || target.getAttribute("data-dcss-tip")
                       || "";
            var html_body = target.getAttribute("data-tip-html") || "";
            var meta = target.getAttribute("data-tip-meta") || "";

            if (!title && body)
            {
                title = "Tactical Info";
            }
            if (!title && !body && !html_body)
                return false;

            tip_node.innerHTML = "";

            if (title || badge)
            {
                var hdr = document.createElement("div");
                hdr.className = "dcss-tip-header";

                var t_span = document.createElement("span");
                t_span.className = "dcss-tip-title";
                content.renderTitle(t_span, title);
                hdr.appendChild(t_span);

                if (badge)
                {
                    var b_span = document.createElement("span");
                    b_span.className = "dcss-tip-badge";
                    b_span.textContent = badge.charAt(0) === "[" ? badge : "[" + badge + "]";
                    hdr.appendChild(b_span);
                }
                tip_node.appendChild(hdr);
            }

            if (html_body || body || meta)
            {
                var body_div = document.createElement("div");
                body_div.className = "dcss-tip-body";
                if (html_body)
                    body_div.innerHTML = html_body;
                else
                    meta = content.render(body_div, body, meta, target.getAttribute("data-tip-heat"));
                tip_node.appendChild(body_div);
            }

            if (meta)
            {
                var meta_div = document.createElement("div");
                meta_div.className = "dcss-tip-meta";
                content.renderMeta(meta_div, meta);
                tip_node.appendChild(meta_div);
            }

            return true;
        }

        function position_tip(target, tip_node)
        {
            if (!target || !tip_node || tip_node.style.display === "none")
                return;
            if (!eligible(target)) { hide_tip(); return; }
            var rect = target.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0)
            {
                hide_tip();
                return;
            }

            placement.place(tip_node, target);
        }

        var rich_host = nested.host("rich", function () {
            return document.getElementById("dcss_rich_tooltip");
        }, function () { hide_tip(); });

        function show_tip(target, refresh)
        {
            if (!eligible(target)) { hide_tip(); return; }
            if (inline_node && target && inline_node.contains(target)) return;
            clearTimeout(open_timer);
            open_timer = pending_el = null;
            var region = target && target.closest("[data-tip-inline]");
            var output = region && document.getElementById(region.getAttribute("data-tip-inline"));
            if (output) {
                hide_tip();
                active_el = target; inline_node = output;
                anchor.set(target);
                render_tip_content(target, output);
                target.setAttribute("aria-describedby",
                    ((target.getAttribute("aria-describedby") || "") + " " + output.id).trim());
                return;
            }
            var tip_node = get_tip_node();
            if (!tip_node || !target) return;
            // A locked tooltip may be holding nested cards; keep it stable.
            var live = refresh && target.hasAttribute("data-tip-live")
                && !nested.in_tip(document.activeElement) && !nested.in_tip(nested.pointer());
            if (rich_host.locked && target === active_el && !live) return;
            if (live) rich_host.close_cards();
            if (active_el !== target) unlink_tip(active_el);
            active_el = target;
            anchor.set(target);
            if (!render_tip_content(target, tip_node))
            {
                hide_tip();
                return;
            }
            tip_node.style.display = "block";
            tip_node.setAttribute("role", "tooltip");
            tip_node.setAttribute("aria-hidden", "false");
            unlink_tip(target);
            target.setAttribute("aria-describedby",
                ((target.getAttribute("aria-describedby") || "") + " dcss_rich_tooltip").trim());
            rich_host.shown(target);
            position_tip(target, tip_node);
        }

        function hide_tip()
        {
            anchor.clear();
            clearTimeout(open_timer);
            open_timer = pending_el = null;
            unlink_tip(active_el);
            active_el = null;
            if (inline_node) inline_node.replaceChildren();
            inline_node = null;
            rich_host.hidden();
            var tip_node = document.getElementById("dcss_rich_tooltip");
            if (tip_node)
            {
                tip_node.style.display = "none";
                tip_node.setAttribute("aria-hidden", "true");
            }
        }

        function dismiss_tip()
        {
            ignored_position = pointer_position;
            hide_tip();
        }

        function upgrade_legacy_title(el)
        {
            return sources.upgrade(el);
        }

        window.dcss_tooltips = {
            show: show_tip,
            hide: hide_tip,
            dismiss: dismiss_tip,
            position: function (el) {
                position_tip(el || active_el, get_tip_node());
            },
            refresh: function () {
                if (active_el && document.body.contains(active_el))
                    show_tip(active_el, true);
                else if (active_el)
                    hide_tip();
            }
        };

        $(document)
            .off(".dcss_rich_tip")
            .on("tooltip-content-resize.dcss_rich_tip", function (ev) {
                var tip = get_tip_node();
                if (active_el && tip && tip.contains(ev.target)) {
                    position_tip(active_el, tip); nested.reposition();
                }
            })
            .on("mouseenter.dcss_rich_tip mousemove.dcss_rich_tip", "[data-tip-title], [data-dcss-tip], [title]", function (ev) {
                // Hiding a card exposes the element underneath it. Escape
                // must keep it dismissed until the pointer actually moves.
                if (stationary_pointer(ev)) return;
                // Badges inside a tooltip open nested cards instead.
                if (nested.in_tip(this) || inline_node && inline_node.contains(this)) return;
                var target = upgrade_legacy_title(ev.target) || $(this).closest("[data-tip-title], [data-dcss-tip]")[0];
                if (!target) return;
                if (active_el !== target)
                    queue_tip(target);
                else
                    position_tip(target, get_tip_node());
            })
            .on("mouseleave.dcss_rich_tip", "[data-tip-title], [data-dcss-tip]", function (ev) {
                if (nested.in_tip(this) || inline_node && inline_node.contains(this)) return;
                if (stationary_pointer(ev)) return;
                var to_el = ev.relatedTarget;
                if (to_el && to_el.closest)
                {
                    var next_target = to_el.closest("[data-tip-title], [data-dcss-tip]");
                    if (next_target && !nested.in_tip(next_target))
                    {
                        queue_tip(next_target);
                        return;
                    }
                    // Keep the inline explanation readable while crossing
                    // the palette or scrolling its help area.
                    if (inline_node && to_el.closest("[data-tip-inline]") === this.closest("[data-tip-inline]")) return;
                }
                // Locked: the pointer may be travelling into the tooltip.
                // nested-tips hides it if the pointer doesn't arrive.
                if (rich_host.locked) return;
                hide_tip();
            })
            .on("focusin.dcss_rich_tip", "[data-tip-title], [data-dcss-tip]", function () {
                if (nested.in_tip(this) || inline_node && inline_node.contains(this)) return;
                // A keyboard-opened card may cover the stationary pointer.
                ignored_position = pointer_position;
                show_tip(this);
            })
            .on("focusout.dcss_rich_tip", function (ev) {
                var tip = get_tip_node();
                // Removing a child preview (Back) must not dismiss its host.
                if (!ev.relatedTarget && nested.in_tip(ev.target)) return;
                if (tip && ev.relatedTarget && tip.contains(ev.relatedTarget)) return;
                if (inline_node && ev.relatedTarget && inline_node.contains(ev.relatedTarget)) return;
                hide_tip();
            })
            .on("mousedown.dcss_rich_tip", function (ev) {
                if (inline_node && inline_node.contains(ev.target)) return;
                if (rich_host.locked && rich_host.holds(ev.target)) return;
                hide_tip();
            })
            .on("keydown.dcss_rich_tip", function (ev) {
                if (ev.key === "Escape" || ev.keyCode === 27
                    || (!nested.in_tip(ev.target) && !["Tab", "Shift", "Control", "Alt", "Meta"].includes(ev.key)))
                    dismiss_tip();
            })
            .on("game_layer_changed.dcss_rich_tip game_cleanup.dcss_rich_tip", hide_tip)
            .on("visibilitychange.dcss_rich_tip", function () { if (document.hidden) hide_tip(); })
            .on("mousemove.dcss_rich_tip", function (ev) {
                pointer_position = { x: ev.clientX, y: ev.clientY };
            });
        $(window).off(".dcss_rich_tip").on("blur.dcss_rich_tip resize.dcss_rich_tip", hide_tip);

        // Quick Command & Action Dock (#dcss_quick_dock) click delegation
        $(document)
            .off("click.dcss_quick_dock")
            .on("click.dcss_quick_dock", ".dcss-dock-btn", function (ev) {
                ev.preventDefault();
                hide_tip();
                this.blur();

                if (this.id === "dock_party_sheet_btn" || $(this).attr("data-dock-cmd") === "party_sheet")
                {
                    if (window.crawl_party && typeof window.crawl_party.open_inspector === "function")
                    {
                        window.crawl_party.open_inspector();
                    }
                    else
                    {
                        comm.send_message("key", { keycode: "I".charCodeAt(0) });
                    }
                    return;
                }

                var key = $(this).attr("data-dock-key");
                if (key)
                {
                    var keycode = (key === "Tab" || key === "\t") ? 9 : key.charCodeAt(0);
                    comm.send_message("key", { keycode: keycode });
                }
            });
    }

    return { init: init_dcss_tooltips_and_dock };
});
