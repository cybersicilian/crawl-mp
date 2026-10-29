define(["jquery", "./party-model", "./status-icons", "item-properties", "./folio-equipment", "./party-power-cards", "./party-skill-training", "./workflow-actions", "character-stat-help", "./party-status-model", "spell-cost", "rich-text"],
function ($, model, icons, properties, equipment, powers, skillTraining, actions, help, statusModel, spellCost, richText) {
    "use strict";

    var party_slot_colours = model.colours;
    var normalize_party_member = model.normalize;
    var format_char_abbrev = model.abbreviation;
    var sections = [
        { key: "overview", label: "Character" },
        { key: "abilities", label: "Spells & abilities" },
        { key: "mutations", label: "Traits" },
        { key: "equipment", label: "Equipment" },
        { key: "skills", label: "Skills" }
    ];

    function remember_scroll()
    {
        var body = document.getElementById("party_insp_body");
        if (!body || !body.hasAttribute("data-insp-rendered-tab")) return;
        var party = window.crawl_party;
        party.inspector_scroll = party.inspector_scroll || Object.create(null);
        party.inspector_scroll[body.getAttribute("data-insp-rendered-slot") + ":" +
            body.getAttribute("data-insp-rendered-tab")] = body.scrollTop;
    }

    function select_tab(tab, focus, remember)
    {
        if (!sections.some(function (section) { return section.key === tab; })) return false;
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        if (remember !== false) remember_scroll();
        window.crawl_party.inspector_tab = tab;
        $("#party_inspector_modal").toggleClass("folio-equipment-open", tab === "equipment");
        $("#party_inspector_heading").text(tab === "equipment" ? "Equipment" : "Party Hero Inspector");
        var selected;
        $("#party_insp_tab_bar .party-insp-tab-btn").each(function () {
            var active = this.getAttribute("data-insp-tab") === tab;
            $(this).toggleClass("active", active).attr({ "aria-selected": String(active), tabindex: active ? 0 : -1 });
            if (active) selected = this;
        });
        $("#party_insp_body .party-insp-panel").each(function () {
            var active = this.getAttribute("data-insp-panel") === tab;
            this.hidden = !active;
            this.setAttribute("aria-hidden", String(!active));
        });
        var body = document.getElementById("party_insp_body");
        if (body) {
            body.setAttribute("data-insp-rendered-tab", tab);
            var key = body.getAttribute("data-insp-rendered-slot") + ":" + tab;
            body.scrollTop = (window.crawl_party.inspector_scroll || {})[key] || 0;
        }
        if (focus && selected) selected.focus({ preventScroll: true });
        return true;
    }

    function panel(key)
    {
        return $("<section class='party-insp-panel'></section>").attr({
            id: "party_insp_panel_" + key, "data-insp-panel": key, role: "tabpanel",
            "aria-labelledby": "party_insp_tab_" + key, tabindex: 0
        });
    }

    function format_piety_pips(m)
    {
        var faith = statusModel.faith(m);
        return faith.name + (faith.worships || faith.kind === "defiance" ? " · " + faith.summary : "");
    }

    function render_party_inspector_modal()
    {
        var state = window.crawl_party && window.crawl_party.state;
        if (!state || !state.members || state.members.length === 0)
            return;

        remember_scroll();
        var trainingFocus = skillTraining.captureFocus();
        var inventorySearch = document.activeElement && document.activeElement.id === "party_inventory_search"
            ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
        var focusedHero = document.activeElement && document.activeElement.classList.contains("party-insp-hero-btn")
            ? document.activeElement.id : "";
        var focusedItem = document.activeElement && /^party_(item|loadout|filter)_/.test(document.activeElement.id)
            ? document.activeElement.id : window.crawl_party.inspector_focus;

        var members = state.members;
        var target_slot = window.crawl_party.inspector_slot;
        if (target_slot === undefined || target_slot === null)
            target_slot = state.active_slot || 0;

        var selected_member = members[0];
        for (var i = 0; i < members.length; ++i)
        {
            normalize_party_member(members[i]);
            if (members[i].slot === target_slot)
                selected_member = members[i];
        }
        if (!selected_member)
            selected_member = normalize_party_member(members[0]);

        window.crawl_party.inspector_slot = selected_member.slot;
        var active_tab = window.crawl_party.inspector_tab || "overview";
        if (!sections.some(function (section) { return section.key === active_tab; })) active_tab = "overview";

        // 1. Top Hero Selector Bar
        var $heroBar = $("#party_insp_hero_bar");
        $heroBar.empty();
        for (var h = 0; h < members.length; ++h)
        {
            var hm = members[h];
            var h_col = party_slot_colours[hm.slot % party_slot_colours.length];
            var h_code = format_char_abbrev(hm.species, hm.job);
            var btn_label = "P" + (hm.slot + 1) + " · " + hm.name + " · L" + model.display(hm.xl) + " " + h_code;
            var $hBtn = $("<button type='button' class='party-insp-hero-btn'></button>")
                .attr({ id: "party_insp_hero_" + hm.slot, "data-insp-slot": hm.slot,
                    "aria-pressed": String(hm.slot === selected_member.slot) })
                .text(btn_label);
            $hBtn[0].style.setProperty("--hero-accent", h_col);
            if (hm.slot === selected_member.slot)
                $hBtn.addClass("active");
            $heroBar.append($hBtn);
        }

        // Build the character sections while retaining hero and section context.
        var m = selected_member;
        var m_col = party_slot_colours[m.slot % party_slot_colours.length];
        var $body = $("#party_insp_body");
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        $body.empty();
        $body.attr("data-insp-rendered-slot", m.slot);
        $body.append(actions.context(m));

        // --- TAB 1: OVERVIEW & STAT SHEET ---
        var $panelOverview = panel("overview");

        var $banner = $("<div class='party-insp-banner'></div>");
        $banner[0].style.setProperty("--hero-accent", m_col);

        var $bannerLeft = $("<div></div>");
        var headline = "P" + (m.slot + 1) + " · " + m.name + (m.title ? (", " + m.title) : "");
        $bannerLeft.append($("<div class='party-insp-hero-headline'></div>").text(headline));

        var shared_gold = (state.gold !== undefined)
            ? state.gold
            : model.display(m.gold);
        var spec_line = model.display(m.species) + " " + model.display(m.job) +
                        " (" + format_char_abbrev(m.species, m.job) + ") · Floor " + model.display(m.place) +
                        " · Party gold " + shared_gold;
        var god_line = "Faith: " + format_piety_pips(m) +
                       (m.god_politics ? (" (" + m.god_politics + ")") : "") +
                       " · HP " + m.hp + "/" + m.hp_max +
                       " · MP " + m.mp + "/" + m.mp_max;
        $bannerLeft.append($("<div class='party-insp-hero-meta'></div>").text(spec_line));
        $bannerLeft.append($("<div class='party-insp-hero-meta'></div>").text(god_line));
        if (m.elder_summary || m.chain_summary)
            $bannerLeft.append($("<div class='party-insp-hero-meta'></div>")
                .text(m.elder_summary || m.chain_summary));
        $banner.append($bannerLeft);

        var $statGrid = $("<div class='party-insp-stat-grid'></div>");
        var stat_items = [
            { lbl: "STR", val: model.display(m.str) },
            { lbl: "INT", val: model.display(m.intel) },
            { lbl: "DEX", val: model.display(m.dex) },
            { lbl: "XL / NEXT", val: model.display(m.xl) + " (" + model.percentage(m.xl_next) + ")" },
            { lbl: "AC", val: model.display(m.ac) },
            { lbl: "EV", val: model.display(m.ev) },
            { lbl: "SH", val: model.display(m.sh) },
            { lbl: "WEAPON", val: model.display(m.weapon).replace(/^[a-zA-Z-]\)\s*/, "") }
        ];
        for (var si = 0; si < stat_items.length; ++si)
        {
            var $sb = $("<div class='party-insp-stat-box'></div>");
            $sb.append($("<span class='lbl'></span>").text(stat_items[si].lbl));
            var $statValue = $("<span class='val'></span>");
            if (stat_items[si].lbl === "WEAPON")
                $statValue.append(properties.render(stat_items[si].val, { focusable: false }));
            else
                $statValue.text(stat_items[si].val);
            $sb.append($statValue);
            $statGrid.append($sb);
        }
        $banner.append($statGrid);
        $panelOverview.append($banner);

        // Action Speed & Aut Timeline Row
        var move_aut = m.move_aut;
        var atk_aut = m.atk_aut;
        var aut_clock = m.aut_clock;
        var aut_lead = m.aut_lead;
        var $autStrip = $("<div class='party-insp-aut-strip'></div>");
        $autStrip.append(
            $("<span></span>").text("Move Delay: " + (move_aut === undefined ? "Unavailable" : (move_aut / 10).toFixed(1) + " turns (" + move_aut + " aut)"))
        );
        $autStrip.append(
            $("<span></span>").text("Attack Delay: " + (atk_aut === undefined ? "Unavailable" : (atk_aut / 10).toFixed(1) + " turns (" + atk_aut + " aut)"))
        );
        $autStrip.append(
            $("<span></span>").css("color", aut_lead > 0 ? "var(--tt-ink-warn)" : "var(--tt-ink-good)").text(
                "Aut Clock / Recovery Lead: " + model.display(aut_clock) + " aut / " +
                (aut_lead === undefined ? "Unavailable" : (aut_lead / 10).toFixed(1) + " turns")
            )
        );
        $panelOverview.append($autStrip);

        // Resistances & Defenses Table
        $panelOverview.append($("<div class='party-insp-section-title'>Resistances &amp; Defenses</div>"));
        var res = m.resists || {};
        var res_defs = help.resistances.map(function (definition) {
            return { key: definition.key, label: definition.title, val: res[definition.key],
                max: definition.max, bool: definition.bool, desc: definition.body,
                icon: definition.icon, shortLabel: definition.label };
        });
        var $resGrid = $("<div class='party-insp-res-grid'></div>");
        for (var ri = 0; ri < res_defs.length; ++ri)
        {
            var rd = res_defs[ri];
            var known = rd.val !== undefined && rd.val !== null;
            var value = known ? Number(rd.val) : 0;
            // Match native output.cc scales; Will and Stealth arrive as raw ratings.
            var levels = rd.key === "Will" ? Math.floor(Math.abs(value) / 40)
                : rd.key === "Stlth" ? Math.ceil(Math.max(0, value) / 50) : Math.abs(value);
            var meta = rd.bool ? (value > 0 ? "Active" : "Inactive") : "Current rating: " + value;
            if (rd.key === "rPois" && value >= 3) meta += " · Immune to poison";
            var $rRow = $("<div class='party-insp-res-row'></div>")
                .attr("data-resistance", rd.key)
                .attr("data-tip-title", rd.label)
                .attr("data-tip-body", rd.desc)
                .attr("data-tip-meta", meta)
                .attr({ tabindex: 0, role: "img", "aria-label": rd.label + ": " + model.display(rd.val) + ". " + rd.desc });
            var $label = $("<span class='party-insp-res-lbl'></span>")
                .append($("<span class='resistance-symbol'></span>").append(properties.icon(rd.icon)),
                    $("<span></span>").text(rd.shortLabel));
            var maximum = rd.key === "rPois" && value >= 3 ? 3 : rd.max;
            var $meter = $("<span class='resistance-meter' aria-hidden='true'></span>").toggleClass("is-negative", value < 0);
            for (var gem = 0; known && gem < maximum; gem++)
                $meter.append($("<span class='resistance-gem'></span>")
                    .toggleClass("is-filled", gem < Math.min(maximum, levels))
                    .toggleClass("is-negative", value < 0 && gem < levels));
            $meter.append($("<span class='resistance-value'></span>").text(known ? value : "Unavailable"));
            $rRow.append($label, $meter);
            $resGrid.append($rRow);
        }
        $panelOverview.append($resGrid);

        // Active Buffs & Status Effects
        $panelOverview.append($("<div class='party-insp-section-title'>Active Buffs &amp; Status Effects</div>"));
        var $stTable = $("<table class='party-insp-table'><thead><tr><th>Badge</th><th>Effect</th><th>Duration</th><th>Description</th></tr></thead><tbody></tbody></table>");
        var $stTbody = $stTable.find("tbody");
        if (m.statuses && m.statuses.length > 0)
        {
            for (var sti = 0; sti < m.statuses.length; ++sti)
            {
                var st = m.statuses[sti];
                var $tr = $("<tr></tr>");
                var $pill = $("<span class='party-buff-pill'></span>")
                    .addClass(st.is_bad ? "is-bad" : "is-buff")
                    .text(st.light || st.text || "Status");
                $tr.append($("<td></td>").append($pill));
                $tr.append($("<td></td>").text(st.text || st.light || "Active Effect"));
                $tr.append($("<td></td>").text(st.dur > 0 ? ("~" + st.dur + " turns") : "Continuous"));
                $tr.append($("<td></td>").html(richText.render(st.desc || "Active status effect on this hero.")));
                $stTbody.append($tr);
            }
        }
        else
        {
            var $readyTr = $("<tr></tr>");
            $readyTr.append($("<td colspan='3'></td>").text(m.statuses_known ? "No active conditions" : "Unavailable"));
            $readyTr.append($("<td></td>").text(m.statuses_known ? "No active conditions reported." : "Condition information unavailable."));
            $stTbody.append($readyTr);
        }
        $panelOverview.append($stTable);
        if (window.dcss_companion_rpg && typeof window.dcss_companion_rpg.enhanceOverview === "function")
        {
            window.dcss_companion_rpg.enhanceOverview(m, state, $panelOverview, function (slot) {
                window.crawl_party.inspector_slot = slot;
                render_party_inspector_modal();
            });
        }
        $body.append($panelOverview);

        // --- TAB 2: ABILITIES & SPELLS ---
        var $panelAbilities = panel("abilities");

        $panelAbilities.append($("<h2 id='party_abilities_heading' tabindex='-1' class='party-insp-section-title'>Active Abilities &amp; Invocations</h2>"));
        var $abTable = $("<table class='party-insp-table'><thead><tr><th>Key</th><th>Ability Name</th><th>Source</th><th>Cost</th><th>Fail %</th><th>Action</th></tr></thead><tbody></tbody></table>");
        var $abBody = $abTable.find("tbody");
        if (m.abilities && m.abilities.length > 0)
        {
            for (var ai = 0; ai < m.abilities.length; ++ai)
            {
                var ab = m.abilities[ai];
                var $abTr = powers.attach($("<tr></tr>"), ab, "Ability");
                $abTr.append($("<td></td>").text(ab.hotkey || "—"));
                $abTr.append($("<td></td>").css("font-weight", "bold").text(ab.name || "Ability"));
                var $srcBadge = $("<span class='party-insp-badge'></span>")
                    .addClass(ab.is_god ? "god" : "innate")
                    .text(ab.is_god ? "God" : "Innate");
                $abTr.append($("<td></td>").append($srcBadge));
                $abTr.append($("<td></td>").text(model.display(ab.cost)));
                $abTr.append($("<td></td>").text(model.percentage(ab.fail)));
                $abTr.append($("<td></td>").append(actions.powerButton(m, ab, "ability")));
                $abBody.append($abTr);
            }
        }
        else
        {
            $abBody.append($("<tr><td colspan='6'></td></tr>").find("td")
                .text(m.abilities_known ? "No active abilities unlocked. Passive effects are listed under Traits." : "Ability information unavailable.").end());
        }
        $panelAbilities.append($abTable);

        $panelAbilities.append($("<h2 id='party_spells_heading' tabindex='-1' class='party-insp-section-title'>Memorised Spells (" + (m.spells ? m.spells.length : 0) + ")</h2>"));
        var $spTable = $("<table class='party-insp-table'><thead><tr><th>Key</th><th>Spell Name</th><th>Level / Cost</th><th>Schools</th><th>Power</th><th>Fail %</th><th>Action</th></tr></thead><tbody></tbody></table>");
        var $spBody = $spTable.find("tbody");
        if (m.spells && m.spells.length > 0)
        {
            for (var spi = 0; spi < m.spells.length; ++spi)
            {
                var sp_item = m.spells[spi];
                var $spTr = powers.attach($("<tr></tr>"), sp_item, "Spell");
                $spTr.append($("<td></td>").text(sp_item.letter || "—"));
                $spTr.append($("<td></td>").css({ "color": "var(--tt-ink-arcane)", "font-weight": "bold" }).text(sp_item.name || "Spell"));
                $spTr.append($("<td></td>").text("Lv " + model.display(sp_item.level) + " / " + spellCost.format(sp_item)));
                $spTr.append($("<td></td>").text(model.display(sp_item.schools)));
                var pwr_txt = model.display(sp_item.power);
                if (sp_item.damage) pwr_txt += " · " + sp_item.damage;
                if (sp_item.range) pwr_txt += " (rng " + sp_item.range + ")";
                $spTr.append($("<td></td>").text(pwr_txt));
                var fail_val = parseFloat(sp_item.fail);
                var fail_col = fail_val >= 30 ? "var(--tt-ink-danger)" : (fail_val >= 12 ? "var(--tt-ink-warn)" : "var(--tt-ink-good)");
                $spTr.append($("<td></td>").css("color", fail_col).text(model.percentage(sp_item.fail)));
                $spTr.append($("<td></td>").append(actions.powerButton(m, sp_item, "spell")));
                $spBody.append($spTr);
            }
        }
        else
        {
            $spBody.append($("<tr><td colspan='7'></td></tr>").find("td")
                .text(m.spells_known ? "No spells memorised." : "Spell information unavailable.").end());
        }
        $panelAbilities.append($spTable);
        $body.append($panelAbilities);

        // --- TAB 3: MUTATIONS & INNATE TRAITS ---
        var $panelMutations = panel("mutations");

        $panelMutations.append($("<div class='party-insp-section-title'>Mutations &amp; Innate Species Traits (" + (m.mutations ? m.mutations.length : 0) + ")</div>"));
        var $mutTable = $("<table class='party-insp-table'><thead><tr><th>Type</th><th>Trait / Mutation</th><th>Rank</th><th>Mechanical Description</th></tr></thead><tbody></tbody></table>");
        var $mutBody = $mutTable.find("tbody");
        if (m.mutations && m.mutations.length > 0)
        {
            for (var mi = 0; mi < m.mutations.length; ++mi)
            {
                var mut = m.mutations[mi];
                var $mTr = $("<tr></tr>");
                var badge_cls = mut.innate ? "innate" : (mut.temp ? "temp" : "mut");
                var badge_txt = mut.innate ? "Innate" : (mut.temp ? "Temporary" : "Mutation");
                $mTr.append($("<td></td>").append($("<span class='party-insp-badge'></span>").addClass(badge_cls).text(badge_txt)));
                $mTr.append($("<td></td>").css("font-weight", "bold").text(mut.name || "Trait"));
                $mTr.append($("<td></td>").text("Lv " + model.display(mut.level)));
                $mTr.append($("<td></td>").html(richText.render(mut.desc || "Innate species or magical trait.")));
                $mutBody.append($mTr);
            }
        }
        else
        {
            $mutBody.append($("<tr><td colspan='4'></td></tr>").find("td")
                .text(m.mutations_known ? "No active mutations or innate traits." : "Trait information unavailable.").end());
        }
        $panelMutations.append($mutTable);
        $body.append($panelMutations);

        // --- TAB 4: SKILLS & INVENTORY ---
        var $panelSkills = panel("skills");
        var $panelEquipment = panel("equipment");

        var $splitGrid = $("<div class='party-insp-split-grid party-insp-training-layout'></div>");
        var $leftCol = $("<div></div>");
        $leftCol.append($("<div class='party-insp-section-title'>Skills &amp; Aptitudes</div>"));
        $leftCol.append(skillTraining.render(m));

        $splitGrid.append($leftCol);
        $panelSkills.append($splitGrid);
        $panelEquipment.append(equipment.render(m));
        $body.append($panelSkills, $panelEquipment);
        icons.decorate($body[0]);
        select_tab(active_tab, false, false);
        skillTraining.restoreFocus(trainingFocus);
        if (focusedHero) {
            var heroButton = document.getElementById(focusedHero);
            if (heroButton) heroButton.focus({ preventScroll: true });
        }
        if (focusedItem) {
            var itemButton = document.getElementById(focusedItem);
            if (itemButton && !itemButton.disabled && itemButton.getClientRects().length)
                itemButton.focus({ preventScroll: true });
            else if (active_tab === "equipment")
                document.getElementById("party_inventory_search").focus({ preventScroll: true });
        }
        if (inventorySearch) {
            var search = document.getElementById("party_inventory_search");
            search.focus({ preventScroll: true });
            search.setSelectionRange(inventorySearch.start, inventorySearch.end);
        }
    }

    return { render: render_party_inspector_modal, selectTab: select_tab, sections: sections };
});
