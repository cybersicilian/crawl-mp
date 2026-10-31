define(["jquery", "./party-model", "./status-icons", "item-properties", "./folio-equipment", "./party-power-cards", "./party-skill-training", "./workflow-actions", "character-stat-help", "./party-status-model", "spell-cost", "rich-text", "./popup-controls", "./equipment-paperdoll", "./native-tile-art"],
function ($, model, icons, properties, equipment, powers, skillTraining, actions, help, statusModel, spellCost, richText, controls, paperdoll, art) {
    "use strict";

    var party_slot_colours = model.colours;
    var normalize_party_member = model.normalize;
    var format_char_abbrev = model.abbreviation;
    // Five tabs: the id/key contract is shared with tests and dock callers.
    var sections = [
        { key: "overview", label: "Overview" },
        { key: "equipment", label: "Equipment" },
        { key: "abilities", label: "Powers" },
        { key: "skills", label: "Skills" },
        { key: "mutations", label: "Traits" }
    ];

    function meter(label, value, max, kind)
    {
        var known = Number.isFinite(Number(value)) && Number.isFinite(Number(max)) && Number(max) > 0;
        var ratio = known ? Math.max(0, Math.min(1, Number(value) / Number(max))) : 0;
        var row = $("<div class='party-insp-meter tr-meter'></div>").attr({ "data-meter": kind,
            "data-resource": kind === "hp" ? "hp" : "mp" });
        row[0].style.setProperty("--tr-meter-pct", (ratio * 100).toFixed(1) + "%");
        row.append($("<span class='party-insp-meter-label tr-meter-label'></span>").text(label));
        var bar = $("<span class='party-insp-meter-bar tr-meter-track' aria-hidden='true'></span>")
            .append($("<span class='party-insp-meter-fill tr-meter-fill'></span>").css("width", (ratio * 100).toFixed(1) + "%"));
        if (known && ratio <= 0.25) row.addClass("is-low").attr("data-threshold", "low");
        row.append(bar, $("<span class='party-insp-meter-value tr-meter-value'></span>")
            .text(model.display(value) + "/" + model.display(max)));
        return row.attr({ role: "img", "aria-label": label + " " + model.display(value) + " of " + model.display(max) });
    }

    function portrait(m, accent)
    {
        var profile = paperdoll.profile(m);
        var fallback = $("<span class='party-insp-portrait-initial' aria-hidden='true'></span>")
            .text(String(m.name || "?").charAt(0).toUpperCase())[0];
        var frame = $(art.create(profile && profile.portrait, m.name + " portrait", "party-insp-portrait-art", fallback));
        var wrap = $("<div class='party-insp-portrait'></div>").append(frame);
        wrap[0].style.setProperty("--hero-accent", accent);
        return wrap;
    }

    function faith_section(m)
    {
        var faith = statusModel.faith(m);
        var card = $("<div class='party-insp-faith'></div>").attr("data-faith-kind", faith.kind || "none");
        var head = $("<div class='party-insp-faith-head'></div>")
            .append($("<strong></strong>").text(faith.name));
        if (faith.rank !== null && faith.rank !== undefined)
            head.append($("<span class='party-insp-faith-rank' aria-hidden='true'></span>")
                .text("★".repeat(faith.rank) + "☆".repeat(Math.max(0, 6 - faith.rank))));
        if (faith.penance) head.append($("<span class='party-insp-badge temp'>Penance</span>"));
        if (faith.standing && faith.standing !== "none")
            head.append($("<span class='party-insp-badge'></span>").addClass(faith.standing === "allied" ? "innate" : "temp")
                .text(faith.standing === "allied" ? "Allied" : "Rival"));
        card.append(head, $("<p class='party-insp-faith-summary'></p>").text(faith.summary));
        if (faith.description) card.append($("<div class='party-insp-faith-desc'></div>").html(richText.render(faith.description)));
        return card;
    }

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
        $("#party_inspector_heading").text(tab === "equipment" ? "Equipment" : "Hero sheet");
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
        $banner.append(portrait(m, m_col));

        var $bannerLeft = $("<div class='party-insp-identity'></div>");
        var headline = "P" + (m.slot + 1) + " · " + m.name + (m.title ? (", " + m.title) : "");
        $bannerLeft.append($("<div class='party-insp-hero-headline'></div>").text(headline));
        var role = controls.role(m);
        var $badges = $("<div class='party-insp-hero-badges'></div>");
        if (role) $badges.append($("<span class='party-insp-role-badge tr-badge is-solid'></span>").attr("data-role", role.key).text(role.label));
        $badges.append($("<span class='party-insp-level-badge'></span>").text("Level " + model.display(m.xl)));
        $badges.append($("<span class='party-insp-hero-meta'></span>").text(model.display(model.speciesName(m)) + " " + model.display(m.job) +
            " (" + format_char_abbrev(m.species, m.job) + ")"));
        $bannerLeft.append($badges);

        var resource = model.magicResource(m);
        $bannerLeft.append($("<div class='party-insp-meters'></div>").append(
            meter("HP", m.hp, m.hp_max, "hp"), meter(resource.label, resource.value, resource.max, "resource")));
        var shared_gold = (state.gold !== undefined)
            ? state.gold
            : model.display(m.gold);
        $bannerLeft.append($("<div class='party-insp-hero-meta'></div>")
            .text("Floor " + model.display(m.place) + " · Party gold " + shared_gold + " · Faith: " + format_piety_pips(m)));
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
            { lbl: "LEVEL CAP", val: model.display(m.xl_cap) },
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
                bool: definition.bool, desc: definition.body,
                icon: definition.icon, shortLabel: definition.label, levels: help.levels(definition, res[definition.key]) };
        });
        var $resGrid = $("<div class='party-insp-res-grid'></div>");
        for (var ri = 0; ri < res_defs.length; ++ri)
        {
            var rd = res_defs[ri];
            var known = rd.levels !== null;
            var value = known ? Number(rd.val) : 0;
            var meta = !known ? "Current value unavailable"
                : rd.bool ? (value > 0 ? "Active" : "Inactive") : "Current rating: " + value;
            if (rd.key === "rPois" && value >= 3) meta += " · Immune to poison";
            var $rRow = $("<div class='party-insp-res-row'></div>")
                .attr("data-resistance", rd.key)
                .attr("data-tip-title", rd.label)
                .attr("data-tip-body", rd.desc)
                .attr("data-tip-meta", meta)
                .attr({ tabindex: 0, role: "img", "aria-label": rd.label + ": " + (known ? value : "Unavailable") + ". " + rd.desc });
            var $label = $("<span class='party-insp-res-lbl'></span>")
                .text(rd.shortLabel);
            $rRow.append($label, properties.levelIcons(rd.icon, rd.levels));
            $resGrid.append($rRow);
        }
        $panelOverview.append($resGrid);

        // Faith
        $panelOverview.append($("<div class='party-insp-section-title'>Faith</div>"), faith_section(m));

        var banes = statusModel.banes(m);
        $panelOverview.append($("<div class='party-insp-section-title'>Banes</div>"));
        var $baneTable = $("<table class='party-insp-table party-insp-banes'><thead><tr><th>Bane</th><th>Recovery</th><th>Effect</th></tr></thead><tbody></tbody></table>");
        banes.entries.forEach(function (bane) {
            $baneTable.find("tbody").append($("<tr></tr>").append($("<td></td>").append(icons.effectArt(bane), document.createTextNode(bane.name)),
                $("<td></td>").text(bane.recovery), $("<td></td>").text(bane.description)));
        });
        if (!banes.entries.length) $baneTable.find("tbody").append($("<tr></tr>")
            .append($("<td colspan='3'></td>").text(banes.known ? "No active banes." : "Bane information unavailable.")));
        $panelOverview.append($baneTable);

        // Active Buffs & Status Effects
        $panelOverview.append($("<div class='party-insp-section-title'>Active Buffs &amp; Status Effects</div>"));
        var $stTable = $("<table class='party-insp-table'><thead><tr><th>Badge</th><th>Effect</th><th>Duration</th><th>Description</th></tr></thead><tbody></tbody></table>");
        var $stTbody = $stTable.find("tbody");
        var effects = statusModel.effects(m);
        if (effects.length > 0)
        {
            for (var sti = 0; sti < effects.length; ++sti)
            {
                var st = effects[sti];
                var $tr = $("<tr></tr>");
                var $pill = $(icons.effect(st));
                $tr.append($("<td></td>").append($pill));
                $tr.append($("<td></td>").text(st.name));
                $tr.append($("<td></td>").text(st.duration ? ("~" + st.duration + " turns") : "—"));
                $tr.append($("<td></td>").html(richText.render(st.description)));
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
