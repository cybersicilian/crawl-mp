define(["jquery", "./tooltip-glossary", "./persistent-help", "./tip-placement", "tooltip-policy", "tooltip-content"],
function ($, glossary, help, placement, policy, content) {
    "use strict";

    // Nested tooltips.
    //
    // Any glossary term (.dcss-term) is hoverable wherever it appears: the
    // message log, text scrollers, description popups, or inside a tooltip.
    // Hovering one opens a card; terms inside that card open a deeper card,
    // and so on. Rich property badges inside a tooltip nest the same way.
    //
    // Base tooltips accept the pointer immediately and offer Read details.
    // Preview chains close after a short travel grace period. Persistent
    // details support keyboard, touch, and arbitrary reading time.

    var INTENT_MS = policy.hover_ms;
    var SWITCH_MS = policy.hover_ms;
    var GRACE_MS = policy.travel_ms;
    var MAX_DEPTH = 8;
    var TIP_SEL = "#dcss_rich_tooltip, #tooltip, .dcss-nested-tip";
    var SRC_SEL = ".dcss-term, [data-tip-title], [data-dcss-tip]";

    var stack = [];         // [{ card, source, host }]
    var hosts = {};
    var last_target = null;
    var open_timer = null, pending = null;
    var close_timer = null;

    function in_tip(node) {
        return node && node.nodeType === 1 && node.closest ? node.closest(TIP_SEL) : null;
    }

    function source_of(node) {
        if (!node || node.nodeType !== 1 || !node.closest) return null;
        var src = node.closest(SRC_SEL);
        if (!src) return null;
        if (src.classList.contains("dcss-term")) return src;
        var tip = in_tip(src);
        // Rich attributes only nest when they live inside a tooltip; outside
        // one they belong to the base tooltip engine in player.js.
        return tip && tip !== src ? src : null;
    }

    function depth_for(src) {
        var card = src.closest(".dcss-nested-tip");
        return card ? Number(card.getAttribute("data-depth")) + 1 : 0;
    }

    // Number of open cards the pointer currently justifies keeping.
    function level_of(node) {
        if (!node || !node.nodeType) return 0;
        for (var i = stack.length - 1; i >= 0; i--)
            if (stack[i].card.contains(node) || stack[i].source.contains(node))
                return i + 1;
        return 0;
    }

    function truncate(n) {
        while (stack.length > Math.max(0, n)) {
            var top = stack.pop();
            if (top.card.parentNode) top.card.parentNode.removeChild(top.card);
            top.source.classList.remove("is-open");
        }
        restore_cards();
        stack.forEach(function (entry, depth) { position(entry.card, entry.source, depth); });
    }

    function suspend(card, value) {
        card.classList.toggle("is-tip-suspended", value);
        card.setAttribute("aria-hidden", String(value));
    }

    function restore_cards() {
        Object.keys(hosts).forEach(function (name) {
            var card = hosts[name].el();
            if (card && hosts[name].locked) suspend(card, false);
        });
        stack.forEach(function (entry) { suspend(entry.card, false); });
    }

    function dismiss_hosts(except) {
        Object.keys(hosts).forEach(function (name) {
            if (hosts[name] !== except && (hosts[name].anchor !== null || hosts[name].locked))
                hosts[name].hide();
        });
    }

    function prune() {
        for (var i = 0; i < stack.length; i++)
            if (!stack[i].source.isConnected || (stack[i].host && !stack[i].host.isConnected)) {
                truncate(i);
                return;
            }
    }

    function close_all() {
        clearTimeout(open_timer);
        clearTimeout(close_timer);
        open_timer = close_timer = pending = null;
        truncate(0);
    }

    function property_entry(src) {
        var key = src && src.getAttribute && src.getAttribute("data-property");
        return key ? glossary.for_property(key) : null;
    }

    function card_data(src) {
        if (src.classList.contains("dcss-term")) {
            var entry = glossary.get(src.getAttribute("data-term"));
            return entry && { id: entry.id, title: entry.title, badge: entry.badge, body: entry.body };
        }
        var title = src.getAttribute("data-tip-title") || "";
        var prop = property_entry(src);
        if (prop) return { id: prop.id, title: title || prop.title, badge: prop.badge, body: prop.body };
        var body = src.getAttribute("data-tip-body") || src.getAttribute("data-dcss-tip") || "";
        if (!title && !body) return null;
        return { title: title, body: body,
            badge: src.getAttribute("data-tip-key") || src.getAttribute("data-tip-badge") || "",
            meta: src.getAttribute("data-tip-meta") || "", heat: src.getAttribute("data-tip-heat") };
    }

    function build_card(data, depth) {
        var card = document.createElement("div");
        card.className = "dcss-nested-tip";
        card.setAttribute("role", "tooltip");
        card.setAttribute("data-depth", String(depth));
        card.style.zIndex = String(100001 + depth);
        var header = document.createElement("div");
        header.className = "dcss-tip-header";
        var title = document.createElement("span");
        title.className = "dcss-tip-title";
        content.renderTitle(title, data.title);
        header.appendChild(title);
        if (data.badge) {
            var badge = document.createElement("span");
            badge.className = "dcss-tip-badge";
            badge.textContent = data.badge.replace(/^\[|\]$/g, "");
            header.appendChild(badge);
        }
        card.appendChild(header);
        var remainingMeta = data.meta;
        if (data.body || remainingMeta) {
            var body = document.createElement("div");
            body.className = "dcss-tip-body";
            remainingMeta = content.render(body, data.body, remainingMeta, data.heat);
            var exclude = {};
            if (data.id) exclude[data.id] = true;
            glossary.linkify(body, { exclude: exclude });
            card.appendChild(body);
        }
        if (remainingMeta) {
            var meta = document.createElement("div");
            meta.className = "dcss-tip-meta";
            content.renderMeta(meta, remainingMeta);
            card.appendChild(meta);
        }
        return card;
    }

    function position(card, src, depth) {
        var parents = stack.slice(0, depth).map(function (entry) { return entry.card; });
        var root = src.closest("#dcss_rich_tooltip, #tooltip");
        if (!root && stack[0]) root = stack[0].host;
        if (root && !root.classList.contains("dcss-nested-tip")) parents.unshift(root);
        parents = parents.filter(function (node) { return !node.classList.contains("is-tip-suspended"); });
        var rect = placement.place(card, src, parents);
        var covered = parents.filter(function (parent) {
            return placement.overlap(rect, parent.getBoundingClientRect()) > 0;
        });
        var back = card.querySelector(".dcss-tip-back");
        if (covered.length && parents.length) {
            var parent = parents[parents.length - 1];
            // A narrow screen shows one explanation in the same reading slot.
            card.style.left = parent.style.left;
            card.style.top = parent.style.top;
            card.style.top = Math.max(8, Math.min(parseFloat(parent.style.top) || 8,
                window.innerHeight - card.offsetHeight - 8)) + "px";
            rect = card.getBoundingClientRect();
            parents.forEach(function (node) {
                if (placement.overlap(rect, node.getBoundingClientRect()) > 0) suspend(node, true);
            });
            if (!back) {
                back = document.createElement("button"); back.type = "button";
                back.className = "workflow-button dcss-tip-back";
                var title = parent.querySelector(".dcss-tip-title");
                back.textContent = "← Back to " + (title ? title.textContent : "previous explanation");
                back.addEventListener("click", function (event) {
                    event.stopPropagation(); cancel_open(); truncate(depth); reposition();
                });
                card.prepend(back);
            }
            // Adding navigation can increase the card's height.
            card.style.top = Math.max(8, Math.min(parseFloat(card.style.top),
                window.innerHeight - card.offsetHeight - 8)) + "px";
            rect = card.getBoundingClientRect();
            parents.forEach(function (node) {
                if (placement.overlap(rect, node.getBoundingClientRect()) > 0) suspend(node, true);
            });
        } else if (back) back.remove();
    }

    function reposition() {
        prune();
        restore_cards();
        stack.forEach(function (entry, depth) { position(entry.card, entry.source, depth); });
    }

    function open(src, depth) {
        var data = card_data(src);
        truncate(depth);
        if (!data) return;
        if (depth === 0 && !in_tip(src)) dismiss_hosts();
        var card = build_card(data, depth);
        card.addEventListener("tooltip-content-resize", reposition);
        var container = src.closest("dialog[open]") || document.body;
        container.appendChild(card);
        position(card, src, depth);
        src.classList.add("is-open");
        stack.push({ card: card, source: src, host: in_tip(src) });
    }

    function schedule_open(src, depth) {
        if (pending && pending.src === src) return;
        clearTimeout(open_timer);
        pending = { src: src };
        open_timer = setTimeout(function () {
            open_timer = pending = null;
            if (!src.isConnected || !src.contains(last_target)) return;
            clearTimeout(close_timer);
            close_timer = null;
            open(src, depth);
        }, stack.length > depth ? SWITCH_MS : INTENT_MS);
    }

    function cancel_open() {
        clearTimeout(open_timer);
        open_timer = pending = null;
    }

    function schedule_close() {
        if (close_timer) return;
        close_timer = setTimeout(function () {
            close_timer = null;
            truncate(level_of(last_target));
        }, GRACE_MS);
    }

    // --- Base tooltip hosts -------------------------------------------------

    function Host(get_el, hide) {
        this.get = get_el;
        this.hide = hide;
        this.anchor = null;
        this.locked = false;
        this.lock_started = 0;
        this.lock_timer = null;
        this.grace_timer = null;
    }

    Host.prototype.el = function () { return this.get(); };

    Host.prototype.set_locked = function (value) {
        var el = this.el();
        this.locked = !!value;
        if (!el) return;
        el.classList.toggle("is-locked", this.locked);
        el.classList.toggle("is-locking", false);
    };

    Host.prototype.close_cards = function () {
        var el = this.el();
        for (var i = 0; i < stack.length; i++)
            if (stack[i].host === el) { truncate(i); return; }
    };

    Host.prototype.holds = function (node) {
        var el = this.el();
        if (!node || !node.nodeType || !el) return false;
        if (el.contains(node) || (this.anchor && this.anchor.contains(node))) return true;
        for (var i = 0; i < stack.length; i++)
            if (stack[i].card.contains(node)) {
                // Only cards that descend from this host count.
                return stack.length > 0 && stack[0].host === el;
            }
        return false;
    };

    // Call after the tooltip element has been filled with fresh content.
    Host.prototype.shown = function (anchor, options) {
        var el = this.el();
        if (!el) return;
        dismiss_hosts(this);
        if (stack.length && stack[0].host !== el) close_all();
        var same = anchor && anchor === this.anchor && (this.lock_timer || this.locked);
        clearTimeout(this.grace_timer);
        this.grace_timer = null;
        el.querySelectorAll(".dcss-tip-body").forEach(function (body) { glossary.linkify(body); });
        var old = el.querySelector(".dcss-tip-lockbar");
        if (old) old.remove();
        if (!same) {
            this.close_cards();
            clearTimeout(this.lock_timer);
            this.lock_timer = null;
            this.anchor = anchor || null;
            this.set_locked(false);
        }
        clearTimeout(this.lock_timer); this.lock_timer = null;
        this.set_locked(true);
        if (options && options.passive) return;
        var existing = el.querySelector(".workflow-help-open");
        if (existing) existing.remove();
        var read = document.createElement("button"); read.type = "button";
        read.className = "workflow-button workflow-help-open"; read.textContent = "Read details";
        read.addEventListener("click", function (event) {
            event.stopPropagation();
            var title = el.querySelector(".dcss-tip-title");
            var body = el.querySelector(".dcss-tip-body") || el;
            help.open({ title: title ? title.getAttribute("data-tip-reading-title") || title.textContent : "Details",
                body: body.getAttribute("data-tip-reading") || body.textContent,
                heat: body.getAttribute("data-tip-reading-heat") }, anchor || read);
        });
        el.appendChild(read);
        var rect = el.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8)
            el.style.top = Math.max(8, window.innerHeight - rect.height - 8) + "px";
        if (rect.right > window.innerWidth - 8)
            el.style.left = Math.max(8, window.innerWidth - rect.width - 8) + "px";
    };

    // Call whenever the tooltip is hidden.
    Host.prototype.hidden = function () {
        clearTimeout(this.lock_timer);
        clearTimeout(this.grace_timer);
        this.lock_timer = this.grace_timer = null;
        this.close_cards();
        this.anchor = null;
        this.set_locked(false);
        var el = this.el();
        if (el) el.classList.remove("is-tip-suspended");
        var bar = el && el.querySelector(".dcss-tip-lockbar");
        if (bar) bar.remove();
    };

    Host.prototype.track = function (node) {
        if (!this.locked) return;
        if (this.holds(node)) {
            clearTimeout(this.grace_timer);
            this.grace_timer = null;
            return;
        }
        if (this.grace_timer) return;
        var self = this;
        this.grace_timer = setTimeout(function () {
            self.grace_timer = null;
            if (self.locked && !self.holds(last_target)) self.hide();
        }, GRACE_MS);
    };

    function host(name, get_el, hide) {
        var h = hosts[name];
        if (h) { h.get = get_el; h.hide = hide; return h; }
        return (hosts[name] = new Host(get_el, hide));
    }

    // --- Pointer tracking ---------------------------------------------------

    function track(node) {
        last_target = node;
        Object.keys(hosts).forEach(function (name) { hosts[name].track(node); });
        prune();
        var level = level_of(node);
        var src = source_of(node);
        if (src) {
            var depth = depth_for(src);
            if (depth < stack.length && stack[depth].source === src) {
                cancel_open();
                level = Math.max(level, depth + 1);
            } else if (depth < MAX_DEPTH && depth <= stack.length) {
                schedule_open(src, depth);
            }
        } else {
            cancel_open();
        }
        if (level < stack.length) schedule_close();
        else { clearTimeout(close_timer); close_timer = null; }
    }

    function holds_any(node) {
        if (level_of(node) > 0) return true;
        return Object.keys(hosts).some(function (name) {
            return hosts[name].locked && hosts[name].holds(node);
        });
    }

    $(document).off(".nested_tips")
        .on("mouseover.nested_tips mousemove.nested_tips", function (ev) { track(ev.target); })
        .on("mousedown.nested_tips", function (ev) {
            if (!in_tip(ev.target)) { close_all(); dismiss_hosts(); }
        })
        .on("keydown.nested_tips", function (ev) {
            if (ev.key === "Escape" || ev.keyCode === 27 || (!in_tip(ev.target)
                && !["Tab", "Shift", "Control", "Alt", "Meta"].includes(ev.key))) {
                close_all(); dismiss_hosts();
            }
        })
        .on("game_layer_changed.nested_tips game_cleanup.nested_tips", function () { close_all(); dismiss_hosts(); })
        .on("visibilitychange.nested_tips", function () { if (document.hidden) { close_all(); dismiss_hosts(); } });
    $(window).off(".nested_tips")
        .on("resize.nested_tips blur.nested_tips", function () { close_all(); dismiss_hosts(); });
    if (window.__dcss_nested_scroll)
        document.removeEventListener("scroll", window.__dcss_nested_scroll, true);
    window.__dcss_nested_scroll = function () { if (stack.length) reposition(); };
    document.addEventListener("scroll", window.__dcss_nested_scroll, true);

    return {
        host: host,
        in_tip: in_tip,
        holds: holds_any,
        pointer: function () { return last_target; },
        linkify: glossary.linkify,
        reposition: reposition,
        close_all: close_all,
        // Richer body text for property badges that have a glossary entry.
        body_for: function (src) {
            var entry = property_entry(src);
            return entry ? entry.body : "";
        }
    };
});
