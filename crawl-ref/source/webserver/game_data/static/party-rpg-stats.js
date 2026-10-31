define(["jquery", "./party-model", "item-properties", "rich-text"],
function ($, model, properties, richText) {
    "use strict";

    var codexCache = Object.create(null);
    var codexState = {
        open: false,
        section: "monsters",
        query: "",
        selectedKey: "",
        loading: false,
        error: ""
    };

    var codexSections = [
        { key: "monsters", label: "Monsters" },
        { key: "spells", label: "Spells" },
        { key: "items", label: "Items & Unrands" },
        { key: "gods", label: "Gods" },
        { key: "species", label: "Species" },
        { key: "jobs", label: "Backgrounds" }
    ];

    function formatRegen(hundredths) {
        if (hundredths === undefined || hundredths === null || isNaN(Number(hundredths)))
            return "Unavailable";
        return (Number(hundredths) / 100).toFixed(2) + "/turn";
    }

    function formatSigned(val) {
        if (val === undefined || val === null || isNaN(Number(val)))
            return "Unavailable";
        var n = Number(val);
        return (n >= 0 ? "+" : "") + n;
    }

    function flattenSectionEntries(section, raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw.entries)) return raw.entries;
        if (section === "items") {
            var src = raw.categories || raw;
            var out = [];
            ["weapons", "armour", "unrands", "jewellery", "wands", "staves",
             "potions", "scrolls", "missiles", "talismans", "misc", "books"].forEach(function (sub) {
                if (Array.isArray(src[sub])) {
                    src[sub].forEach(function (item) {
                        out.push(Object.assign({ _subcat: sub }, item));
                    });
                }
            });
            return out;
        }
        return [];
    }

    function fetchCodexSection(section, callback) {
        if (codexCache[section]) {
            if (callback) callback(null, codexCache[section]);
            return;
        }
        codexState.loading = true;
        codexState.error = "";
        renderCodexDrawer();
        $.ajax({
            url: "/api/stats/" + encodeURIComponent(section),
            method: "GET",
            dataType: "json"
        }).done(function (data) {
            codexState.loading = false;
            codexCache[section] = flattenSectionEntries(section, data);
            if (!codexState.selectedKey && codexCache[section].length > 0)
                codexState.selectedKey = codexCache[section][0].key || codexCache[section][0].name || "";
            renderCodexDrawer();
            if (callback) callback(null, codexCache[section]);
        }).fail(function () {
            codexState.loading = false;
            codexState.error = "Reference data unavailable from /api/stats/" + section + ".";
            renderCodexDrawer();
            if (callback) callback(new Error(codexState.error), []);
        });
    }

    function openCodexLookup(section, keyOrQuery) {
        codexState.open = true;
        codexState.section = section || "monsters";
        codexState.query = "";
        codexState.selectedKey = keyOrQuery || "";
        ensureHeaderAndDrawer();
        var $drawer = $("#party_insp_codex_drawer");
        $drawer.prop("hidden", false);
        $("#party_insp_codex_toggle").attr("aria-expanded", "true").addClass("active");
        fetchCodexSection(codexState.section, function (err, list) {
            if (!err && keyOrQuery && Array.isArray(list)) {
                var q = String(keyOrQuery).toLowerCase();
                var exact = list.find(function (e) {
                    return (e.key && e.key.toLowerCase() === q) || (e.name && e.name.toLowerCase() === q);
                });
                if (exact) {
                    codexState.selectedKey = exact.key || exact.name;
                } else {
                    codexState.query = String(keyOrQuery);
                }
                renderCodexDrawer();
            }
        });
    }

    function renderEntryDetail(section, entry) {
        var $card = $("<div class='companion-codex-card'></div>");
        if (!entry) {
            $card.append($("<p class='companion-codex-empty'>Select an entry to inspect engine RPG statistics.</p>"));
            return $card;
        }
        var $head = $("<div class='companion-codex-card-head'></div>");
        $head.append($("<h3 class='companion-codex-card-title'></h3>").text(entry.name || entry.key || "Entry"));
        var badgeText = section === "monsters" ? ("HD " + model.display(entry.hd) + (entry.is_unique ? " · Unique" : ""))
            : section === "spells" ? ("Level " + model.display(entry.level) + " · " + ((entry.schools || []).join("/") || "Spell"))
            : section === "items" ? (entry._subcat || entry.base_class || "Item")
            : section === "gods" ? (entry.title || "Deity")
            : (entry.abbr || section);
        $head.append($("<span class='party-insp-badge innate'></span>").text(badgeText));
        $card.append($head);

        var $stats = $("<div class='companion-codex-kv-grid'></div>");
        function addKv(lbl, val) {
            if (val === undefined || val === null || val === "") return;
            var $box = $("<div class='companion-codex-kv'></div>");
            $box.append($("<span class='lbl'></span>").text(lbl));
            $box.append($("<span class='val'></span>").text(String(val)));
            $stats.append($box);
        }

        if (section === "monsters") {
            var hpStr = entry.hp_min !== undefined && entry.hp_max !== undefined
                ? (entry.hp_min === entry.hp_max ? String(entry.hp_min) : entry.hp_min + "–" + entry.hp_max)
                : model.display(entry.hp);
            addKv("HP Range", hpStr);
            addKv("AC / EV", model.display(entry.ac) + " / " + model.display(entry.ev));
            addKv("Willpower", model.display(entry.will));
            addKv("Speed", model.display(entry.speed));
            addKv("XP Value", model.display(entry.xp));
            addKv("Holiness / Size", [entry.holiness, entry.size].filter(Boolean).join(" · "));
            $card.append($stats);

            if (Array.isArray(entry.attacks) && entry.attacks.length > 0) {
                var atkParts = entry.attacks.map(function (a) {
                    return (a.type || "hit") + " " + (a.damage !== undefined ? a.damage + " dmg" : "") +
                           (a.flavour && a.flavour !== "none" ? " (" + a.flavour + ")" : "");
                });
                $card.append($("<div class='companion-codex-sub'></div>")
                    .append($("<strong>Attacks: </strong>"), document.createTextNode(atkParts.join(" · "))));
            }
            if (entry.resistances && typeof entry.resistances === "object") {
                var resKeys = Object.keys(entry.resistances).filter(function (k) { return entry.resistances[k]; });
                if (resKeys.length > 0) {
                    var resStr = resKeys.map(function (k) { return k + ":" + entry.resistances[k]; }).join(", ");
                    $card.append($("<div class='companion-codex-sub'></div>")
                        .append($("<strong>Resistances: </strong>"), document.createTextNode(resStr)));
                }
            }
            if (Array.isArray(entry.spells) && entry.spells.length > 0) {
                var spList = [];
                entry.spells.forEach(function (slot) {
                    if (Array.isArray(slot.spells)) {
                        slot.spells.forEach(function (s) { if (s.spell) spList.push(s.spell); });
                    } else if (slot.name || slot.spell) {
                        spList.push(slot.name || slot.spell);
                    }
                });
                if (spList.length > 0) {
                    $card.append($("<div class='companion-codex-sub'></div>")
                        .append($("<strong>Spells: </strong>"), document.createTextNode(spList.join(", "))));
                }
            }
        } else if (section === "spells") {
            addKv("Level", entry.level);
            addKv("Schools", Array.isArray(entry.schools) ? entry.schools.join(" / ") : entry.schools);
            addKv("Power Cap", entry.power_cap);
            addKv("Range", entry.range_min !== undefined || entry.range_max !== undefined
                ? [entry.range_min, entry.range_max].filter(function (v) { return v !== undefined && v > 0; }).join("–") || "Self/Touch"
                : "");
            addKv("Noise", entry.noise);
            addKv("Books", Array.isArray(entry.books) ? entry.books.join(", ") : "");
            $card.append($stats);
        } else if (section === "items") {
            addKv("Skill", entry.skill);
            addKv("Base Damage", entry.damage);
            addKv("To-Hit", entry.hit !== undefined ? formatSigned(entry.hit) : "");
            addKv("Delay / Min Delay", entry.base_delay !== undefined
                ? entry.base_delay + " aut / " + model.display(entry.min_delay) + " aut" +
                  (entry.min_delay_skill !== undefined ? " (@ sk " + entry.min_delay_skill + ")" : "")
                : "");
            addKv("Base AC / Encumb.", entry.ac !== undefined
                ? "AC " + entry.ac + (entry.ev !== undefined ? " · EV " + entry.ev : "")
                : "");
            addKv("Hands", entry.hands);
            $card.append($stats);
            if (entry.properties && typeof entry.properties === "object") {
                var propText = Object.keys(entry.properties).map(function (k) {
                    return k + ": " + entry.properties[k];
                }).join(" · ");
                if (propText) {
                    $card.append($("<div class='companion-codex-sub'></div>")
                        .append($("<strong>Properties: </strong>"), document.createTextNode(propText)));
                }
            }
        } else if (section === "gods") {
            addKv("Title", entry.title);
            addKv("Wrath", entry.wrath);
            $card.append($stats);
            if (Array.isArray(entry.powers) && entry.powers.length > 0) {
                var powStr = entry.powers.map(function (p) { return p.name || p.power || p; }).join(" · ");
                $card.append($("<div class='companion-codex-sub'></div>")
                    .append($("<strong>Divine Powers: </strong>"), document.createTextNode(powStr)));
            }
        } else {
            addKv("Abbreviation", entry.abbr);
            addKv("Str / Int / Dex", entry.str !== undefined ? (entry.str + " / " + entry.int + " / " + entry.dex) : "");
            $card.append($stats);
        }

        if (entry.description) {
            $card.append($("<div class='companion-codex-desc'></div>").html(richText.render(entry.description)));
        }
        return $card;
    }

    function renderCodexDrawer() {
        var $drawer = $("#party_insp_codex_drawer");
        if ($drawer.length === 0 || $drawer.prop("hidden")) return;

        $drawer.find(".companion-codex-sec-btn").each(function () {
            var active = $(this).attr("data-codex-sec") === codexState.section;
            $(this).toggleClass("active", active).attr("aria-pressed", String(active));
        });

        var $results = $("#companion_codex_results").empty();
        var $detail = $("#companion_codex_detail").empty();

        if (codexState.loading) {
            $results.append($("<div class='companion-codex-status'>Loading engine reference data…</div>"));
            return;
        }
        if (codexState.error) {
            $results.append($("<div class='companion-codex-status'></div>").text(codexState.error));
            return;
        }

        var entries = codexCache[codexState.section] || [];
        var q = (codexState.query || "").trim().toLowerCase();
        var filtered = entries.filter(function (e) {
            if (!q) return true;
            var hay = ((e.name || "") + " " + (e.key || "") + " " + (e.skill || "") + " " +
                       (Array.isArray(e.schools) ? e.schools.join(" ") : "")).toLowerCase();
            return hay.indexOf(q) !== -1;
        });

        var shown = filtered.slice(0, 40);
        var selectedEntry = filtered.find(function (e) {
            return (e.key || e.name) === codexState.selectedKey;
        }) || shown[0] || null;
        if (selectedEntry) codexState.selectedKey = selectedEntry.key || selectedEntry.name;

        if (shown.length === 0) {
            $results.append($("<div class='companion-codex-status'>No matching entries.</div>"));
        } else {
            shown.forEach(function (entry) {
                var eKey = entry.key || entry.name;
                var $btn = $("<button type='button' class='companion-codex-item-btn'></button>")
                    .toggleClass("active", eKey === codexState.selectedKey)
                    .attr("data-codex-key", eKey)
                    .text(entry.name || eKey);
                $results.append($btn);
            });
        }
        $detail.append(renderEntryDetail(codexState.section, selectedEntry));
    }

    function ensureHeaderAndDrawer() {
        var $modal = $("#party_inspector_modal");
        if ($modal.length === 0) return;

        var $header = $modal.find(".party-insp-header");
        if ($header.length > 0 && $("#party_insp_codex_toggle").length === 0) {
            var $actions = $("<div class='companion-header-actions'></div>");
            var $codexBtn = $("<button type='button' id='party_insp_codex_toggle' class='party-mini-btn companion-codex-toggle-btn'></button>")
                .attr({ "aria-expanded": String(codexState.open),
                        title: "Toggle instant zero-turn Monster, Spell, Item & God RPG reference lookup" })
                .text("Codex & Reference");
            var $statsLink = $("<a id='party_insp_stats_link' class='party-mini-btn companion-stats-link' href='/stats' target='_blank' rel='noopener'>Full /stats ↗</a>")
                .attr("title", "Open the full server-wide /stats Companion & Encyclopedia in a new tab");
            $actions.append($codexBtn, $statsLink);
            $header.find(".party-insp-close-form").before($actions);

            $codexBtn.on("click", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                codexState.open = !codexState.open;
                $(this).attr("aria-expanded", String(codexState.open)).toggleClass("active", codexState.open);
                var $drawer = $("#party_insp_codex_drawer");
                $drawer.prop("hidden", !codexState.open);
                if (codexState.open) {
                    fetchCodexSection(codexState.section);
                    $("#companion_codex_search").trigger("focus");
                }
            });
        }

        if ($("#party_insp_codex_drawer").length === 0) {
            var $drawer = $("<section id='party_insp_codex_drawer' class='companion-codex-drawer' aria-label='Companion Reference Codex'></section>")
                .prop("hidden", !codexState.open);
            var $bar = $("<div class='companion-codex-toolbar'></div>");
            var $secNav = $("<div class='companion-codex-sections'></div>");
            codexSections.forEach(function (sec) {
                $("<button type='button' class='companion-codex-sec-btn'></button>")
                    .attr({ "data-codex-sec": sec.key, "aria-pressed": String(sec.key === codexState.section) })
                    .toggleClass("active", sec.key === codexState.section)
                    .text(sec.label)
                    .appendTo($secNav);
            });
            var $search = $("<input type='search' id='companion_codex_search' class='companion-codex-search' placeholder='Filter monsters, spells, items, gods… (0 turns)' aria-label='Filter reference codex'>");
            $bar.append($secNav, $search);
            var $split = $("<div class='companion-codex-split'></div>")
                .append($("<div id='companion_codex_results' class='companion-codex-results'></div>"),
                        $("<div id='companion_codex_detail' class='companion-codex-detail'></div>"));
            $drawer.append($bar, $split);
            $("#party_insp_tab_bar").after($drawer);

            $drawer.on("click", ".companion-codex-sec-btn", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                codexState.section = $(this).attr("data-codex-sec") || "monsters";
                codexState.selectedKey = "";
                fetchCodexSection(codexState.section);
            });
            $drawer.on("click", ".companion-codex-item-btn", function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                codexState.selectedKey = $(this).attr("data-codex-key") || "";
                renderCodexDrawer();
            });
            $search.on("input", function () {
                codexState.query = $(this).val() || "";
                renderCodexDrawer();
            });
        }
    }

    function enhanceOverview(m, state, $panelOverview, onSelectHero) {
        ensureHeaderAndDrawer();

        // 1. Combat, Regen & Progression Metrics Strip
        var $metrics = $("<div id='companion_rpg_metrics' class='companion-rpg-metrics' aria-label='Combat and Progression Metrics'></div>");
        var spellCap = (m.spell_levels_left !== undefined && m.spell_levels_total !== undefined)
            ? (m.spell_levels_left + " / " + m.spell_levels_total + " free")
            : "Unavailable";
        var turnsText = m.turns !== undefined
            ? (m.turns + " turns" + (m.elapsed_aut !== undefined ? " (" + (m.elapsed_aut / 10).toFixed(1) + "t)" : ""))
            : "Unavailable";
        var killsText = m.kill_total !== undefined
            ? (m.kill_total + " slain" + (m.ally_kill_total ? " (+" + m.ally_kill_total + " ally)" : ""))
            : "Unavailable";
        var runesCount = Array.isArray(m.runes) ? m.runes.length : 0;
        var gemsCount = Array.isArray(m.gems) ? m.gems.length : 0;
        var runesText = m.runes_known
            ? (runesCount + " runes" + (runesCount > 0 ? " (" + m.runes.join(", ") + ")" : ""))
            : "Runes unavailable";
        runesText += m.gems_known ? " · " + gemsCount + " gems" : " · Gems unavailable";

        var metricItems = [
            { lbl: "SLAYING", val: formatSigned(m.slaying) },
            { lbl: "HP REGEN", val: formatRegen(m.hp_regen) },
            { lbl: m.species === "Automaton" ? "COOLING" : "MP REGEN", val: formatRegen(m.mp_regen) },
            { lbl: "SPELL LEVELS", val: spellCap },
            { lbl: "TURNS / TIME", val: turnsText },
            { lbl: "VANQUISHED", val: killsText },
            { lbl: "RUNES & GEMS", val: runesText }
        ];
        metricItems.forEach(function (item) {
            var $cell = $("<div class='companion-metric-pill'></div>");
            $cell.append($("<span class='lbl'></span>").text(item.lbl));
            $cell.append($("<span class='val'></span>").text(item.val));
            $metrics.append($cell);
        });
        $panelOverview.find(".party-insp-aut-strip").after($metrics);

        // 2. Live Vanquished Creatures & Action Breakdown Ledger
        $panelOverview.append($("<div class='party-insp-section-title'>Combat &amp; Action Ledger</div>"));
        var $ledgerGrid = $("<div id='companion_rpg_ledger' class='party-insp-split-grid companion-rpg-ledger'></div>");

        // Column A: Vanquished Creatures
        var $killsCol = $("<div class='companion-ledger-col'></div>");
        var killHeader = "Vanquished Creatures (" + model.display(m.kill_total) + " direct" +
                         (m.ally_kill_total ? ", " + m.ally_kill_total + " ally" : "") + ")";
        $killsCol.append($("<div class='companion-sub-header'></div>").text(killHeader));
        var $killsTable = $("<table class='party-insp-table companion-kills-table'><thead><tr><th>Monster</th><th>Slain</th><th>XP</th><th>Codex</th></tr></thead><tbody></tbody></table>");
        var $killsBody = $killsTable.find("tbody");
        if (m.kills_top && m.kills_top.length > 0) {
            m.kills_top.slice(0, 12).forEach(function (k) {
                var $tr = $("<tr></tr>");
                $tr.append($("<td></td>").css("font-weight", "bold").text(k.name || k.key || "Monster"));
                $tr.append($("<td></td>").text(model.display(k.count)));
                $tr.append($("<td></td>").text(k.exp !== undefined ? String(k.exp) : "—"));
                var $lookupBtn = $("<button type='button' class='party-mini-btn companion-codex-jump'>Stats</button>")
                    .attr("title", "Inspect " + (k.name || k.key) + " HD, HP, attacks, and resistances in the Codex")
                    .on("click", function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openCodexLookup("monsters", k.key || k.name);
                    });
                $tr.append($("<td></td>").append($lookupBtn));
                $killsBody.append($tr);
            });
        } else {
            $killsBody.append($("<tr><td colspan='4'></td></tr>").find("td")
                .text(m.kills_top_known ? "No creatures vanquished yet by this hero." : "Kill ledger unavailable.").end());
        }
        $killsCol.append($killsTable);

        // Column B: Action Breakdown
        var $actCol = $("<div class='companion-ledger-col'></div>");
        var totalActions = 0;
        if (Array.isArray(m.actions)) {
            m.actions.forEach(function (a) { totalActions += Number(a.total || 0); });
        }
        $actCol.append($("<div class='companion-sub-header'></div>").text("Action Breakdown (" + (m.actions_known ? totalActions + " recorded" : "Unavailable") + ")"));
        var $actTable = $("<table class='party-insp-table companion-actions-table'><thead><tr><th>Action</th><th>Total</th><th>Top Subtypes</th></tr></thead><tbody></tbody></table>");
        var $actBody = $actTable.find("tbody");
        if (m.actions && m.actions.length > 0) {
            m.actions.forEach(function (act) {
                var $tr = $("<tr></tr>");
                $tr.append($("<td></td>").css("font-weight", "bold").text(act.category || "Action"));
                $tr.append($("<td></td>").text(model.display(act.total)));
                var subText = Array.isArray(act.subtypes) && act.subtypes.length > 0
                    ? act.subtypes.map(function (s) { return s.name + " ×" + s.count; }).join(", ")
                    : "—";
                $tr.append($("<td></td>").text(subText));
                $actBody.append($tr);
            });
        } else {
            $actBody.append($("<tr><td colspan='3'></td></tr>").find("td")
                .text(m.actions_known ? "No combat, spell, or item actions recorded yet." : "Action ledger unavailable.").end());
        }
        $actCol.append($actTable);

        $ledgerGrid.append($killsCol, $actCol);
        $panelOverview.append($ledgerGrid);

        // 3. Party-Wide RPG Stat Comparison
        if (state && Array.isArray(state.members) && state.members.length > 0) {
            $panelOverview.append($("<div class='party-insp-section-title'>Party RPG Comparison (" + state.members.length + " Hero" + (state.members.length === 1 ? "" : "es") + ")</div>"));
            var $cmpTable = $("<table id='companion_party_compare' class='party-insp-table companion-party-compare'><thead><tr><th>Hero</th><th>XL</th><th>HP / resource</th><th>AC / EV / SH</th><th>STR / INT / DEX</th><th>Slay &amp; Regen</th><th>Slain</th><th>Top Action</th></tr></thead><tbody></tbody></table>");
            var $cmpBody = $cmpTable.find("tbody");
            state.members.forEach(function (hm) {
                var $tr = $("<tr></tr>").toggleClass("is-selected-hero", hm.slot === m.slot);
                var $heroBtn = $("<button type='button' class='party-mini-btn companion-hero-switch-btn'></button>")
                    .text("P" + (hm.slot + 1) + " · " + hm.name + " (" + model.abbreviation(hm.species, hm.job) + ")")
                    .on("click", function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        if (onSelectHero) onSelectHero(hm.slot);
                    });
                $tr.append($("<td></td>").append($heroBtn));
                $tr.append($("<td></td>").text("L" + model.display(hm.xl)));
                var resource = model.magicResource(hm);
                $tr.append($("<td></td>").text(hm.hp + "/" + hm.hp_max + " · " + resource.label + " " + model.display(resource.value) + "/" + model.display(resource.max)));
                $tr.append($("<td></td>").text(model.display(hm.ac) + " / " + model.display(hm.ev) + " / " + model.display(hm.sh)));
                $tr.append($("<td></td>").text(model.display(hm.str) + " / " + model.display(hm.intel) + " / " + model.display(hm.dex)));
                $tr.append($("<td></td>").text(formatSigned(hm.slaying) + " · " + formatRegen(hm.hp_regen)));
                $tr.append($("<td></td>").text(model.display(hm.kill_total)));
                var topAct = (Array.isArray(hm.actions) && hm.actions.length > 0)
                    ? (hm.actions[0].category + " (" + hm.actions[0].total + ")")
                    : "—";
                $tr.append($("<td></td>").text(topAct));
                $cmpBody.append($tr);
            });
            $panelOverview.append($cmpTable);
        }
    }

    function enhanceEquipment(m, $panelEquipment) {
        if (!Array.isArray(m.equipment_slots) || m.equipment_slots.length === 0) return;
        var $slotsSection = $("<div id='companion_equip_slots' class='companion-equip-slots-wrap'></div>");
        $slotsSection.append($("<div class='party-insp-section-title'>Equipped Loadout Slots</div>"));
        var $grid = $("<div class='companion-equip-slots-grid'></div>");
        m.equipment_slots.forEach(function (eq) {
            var $slotCard = $("<div class='companion-equip-slot-card'></div>").toggleClass("is-empty", Boolean(eq.empty));
            $slotCard.append($("<span class='slot-lbl'></span>").text(eq.slot_name || "Slot"));
            var $val = $("<span class='slot-val'></span>");
            if (!eq.empty && eq.name) {
                var prefix = eq.letter ? (eq.letter + ") ") : "";
                $val.append(properties.render(prefix + eq.name, { focusable: false }));
                if (eq.melded) {
                    $val.append($("<span class='party-insp-badge temp'>Melded</span>"));
                }
            } else {
                $val.text(eq.name || "(empty)");
            }
            $slotCard.append($val);
            $grid.append($slotCard);
        });
        $slotsSection.append($grid);
        $panelEquipment.append($slotsSection);
    }

    var api = {
        enhanceOverview: enhanceOverview,
        enhanceEquipment: enhanceEquipment,
        openCodex: openCodexLookup
    };
    window.dcss_companion_rpg = api;
    return api;
});
