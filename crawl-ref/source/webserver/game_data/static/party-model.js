define([],
function () {
    "use strict";

    var party_slot_colours = ["#fce94f", "#34e2e2", "#8ae234", "#ad7fa8"];

    var species_abbrevs = {
        "Minotaur": "Mi",
        "Mountain Dwarf": "MD",
        "Deep Elf": "DE",
        "Gargoyle": "Gr",
        "Spriggan": "Sp",
        "Draconian": "Dr",
        "Demonspawn": "Ds",
        "Demigod": "Dg",
        "Gnoll": "Gn",
        "Human": "Hu",
        "Kobold": "Ko",
        "Merfolk": "Mf",
        "Troll": "Tr"
    };

    var job_abbrevs = {
        "Fighter": "Fi",
        "Berserker": "Be",
        "Conjurer": "Cj",
        "Earth Elementalist": "EE",
        "Fire Elementalist": "FE",
        "Ice Elementalist": "IE",
        "Air Elementalist": "AE",
        "Enchanter": "En",
        "Alchemist": "Al",
        "Summoner": "Su",
        "Necromancer": "Ne",
        "Hunter": "Hu",
        "Gladiator": "Gl",
        "Monk": "Mo"
    };

    function format_char_abbrev(species, job) {
        function abbreviation(value, known) {
            return known[value] || (value ? value.replace(/[^A-Za-z]/g, "").slice(0, 2) : "?");
        }
        return abbreviation(species, species_abbrevs) + abbreviation(job, job_abbrevs);
    }
    function species_name(member) {
        var trait = member.trait && member.trait !== "none" ? member.trait : "";
        var heads = member.species === "Hydra" && Number.isInteger(member.heads) && member.heads > 0
            ? " (" + member.heads + (member.heads === 1 ? " head)" : " heads)") : "";
        return (trait ? trait.charAt(0).toUpperCase() + trait.slice(1) + " " : "") + (member.species || "") + heads;
    }
    function magic_resource(member) {
        var heat = member.species === "Automaton";
        var known = Number.isFinite(member.mp) && Number.isFinite(member.mp_max);
        var max = known ? Math.max(0, member.mp_max) : null;
        var value = known ? (heat ? Math.max(0, max - member.mp) : member.mp) : null;
        return { label: heat ? "Heat" : "MP", value: value, max: max,
            percent: max > 0 ? Math.max(0, Math.min(100, Math.round(100 * value / max))) : 0 };
    }

    // Normalize shape only. Native empty arrays are meaningful, and missing
    // facts must never turn into plausible equipment, stats, or capabilities.
    function normalize_party_member(member) {
        if (!member) return member;
        ["inventory", "floor_items", "abilities", "spells", "skills", "mutations", "statuses", "banes",
         "equipment_slots", "kills_top", "actions", "runes", "gems"].forEach(function (key) {
            var known = Array.isArray(member[key]);
            if (member[key + "_known"] === undefined) member[key + "_known"] = known;
            if (!known) member[key] = [];
        });
        if (!member.resists || typeof member.resists !== "object") member.resists = {};
        return member;
    }
    function display(value) {
        return value === undefined || value === null || value === "" ? "Unavailable" : String(value);
    }
    function percentage(value) {
        if (value === undefined || value === null || value === "") return "Unavailable";
        return /%$/.test(String(value)) ? String(value) : value + "%";
    }
    function item_name(item) {
        // Current native names already include their quantity. Older explicit
        // names are kept verbatim as well; qty is separate metadata.
        return item.name || "Unknown item";
    }
    function controlled_slot(state) {
        if (state && Number.isInteger(state.controlled_slot)) return state.controlled_slot;
        // An explicit null means spectating the host's personal stream.
        if (state && state.controlled_slot === null) return 0;
        return state && Number.isInteger(state.active_slot) ? state.active_slot : 0;
    }
    function in_combat(state, member) {
        return state && state.multiplayer && member && typeof member.region_combat === "boolean"
            ? member.region_combat : Boolean(state && state.combat_locked);
    }
    function can_control(state, slot) {
        return Boolean(state && Array.isArray(state.controllable_slots)
            && state.controllable_slots.includes(slot));
    }
    function can_switch(state) {
        return Boolean(state && Array.isArray(state.members) && state.members.some(function (member) {
            return member.slot !== controlled_slot(state) && member.alive && !member.ghost_haunting
                && can_control(state, member.slot);
        }));
    }
    function floor_clocks(state) {
        var members = state && Array.isArray(state.members) ? state.members : [];
        var c_slot = controlled_slot(state);
        var controlled = members.find(function (m) { return m.slot === c_slot; }) || members[0];
        var has_regions = Boolean(controlled && Number.isInteger(controlled.region_id));
        function participating(member) {
            if (member.alive === false || member.ghost_haunting || member.hp === 0 || member.on_same_level === false)
                return false;
            if (has_regions && Number.isInteger(member.region_id))
                return member.region_id === controlled.region_id;
            if (member.same_region === false)
                return false;
            return true;
        }
        var peers = members.filter(participating);
        var world = (has_regions && Number.isFinite(controlled.region_aut_clock))
            ? controlled.region_aut_clock
            : (state && state.world_aut_clock);
        var known = Number.isFinite(world)
            && peers.every(function (member) { return Number.isFinite(member.aut_clock); });
        return { members: members, peers: peers, world: world, known: known,
            controlled: controlled, hasRegions: has_regions,
            horizon: known && peers.length ? Math.max.apply(null, peers.map(function (member) {
                return member.aut_clock;
            })) : null };
    }
    // Recovery is measured against the active region clock; catch-up time against the
    // furthest living teammate in the active region. Both can exist simultaneously.
    // Catch-up time is a relative clock gap, never a free-action currency.
    function initiative_timeline(state) {
        var clocks = floor_clocks(state), known = clocks.known;
        var horizon = known ? Math.max(clocks.world, clocks.horizon === null ? clocks.world : clocks.horizon) : 0;
        return clocks.members.map(function (member) {
            var same_region = member.on_same_level === false ? false
                : clocks.hasRegions && Number.isInteger(member.region_id)
                ? member.region_id === clocks.controlled.region_id
                : member.same_region !== false;
            var status = member.alive === false || member.ghost_haunting || member.hp === 0
                ? "downed" : member.on_same_level === false ? "away"
                : !same_region ? "independent"
                : known ? "ready" : "unknown";
            var banked = status === "ready" ? Math.max(0, horizon - member.aut_clock) : undefined;
            var debt = status === "ready" ? Math.max(0, member.aut_clock - clocks.world) : undefined;
            if (banked || debt) status = banked && debt ? "mixed" : banked ? "banked" : "debt";
            var own_world = Number.isFinite(member.region_aut_clock) ? member.region_aut_clock : clocks.world;
            var own_debt = debt !== undefined ? debt
                : (Number.isFinite(member.aut_clock) && Number.isFinite(own_world)
                    ? Math.max(0, member.aut_clock - own_world)
                    : (Number.isFinite(member.aut_lead) ? Math.max(0, member.aut_lead) : 0));
            var action_cost = Math.max(10, Number.isFinite(member.last_action_aut) && member.last_action_aut > 0
                ? member.last_action_aut : 10);
            var cooldown_pct = own_debt > 0 ? Math.round(100 * Math.min(1, own_debt / action_cost)) : 0;
            return { slot: member.slot, status: status, banked: banked, debt: debt,
                cooldown_pct: cooldown_pct, last_action_aut: member.last_action_aut,
                region_id: member.region_id, region_combat: member.region_combat,
                same_region: same_region, queued_action: member.queued_action };
        });
    }
    function monster_timing(state) {
        var clocks = floor_clocks(state);
        if (!clocks.known || !clocks.peers.length || state.enabled === false)
            return { status: "unknown", credit: null, debt: null };
        // This is the shared region scheduler, not an individual monster's energy.
        var gap = clocks.horizon - clocks.world;
        return { status: gap > 0 ? "credit" : gap < 0 ? "debt" : "ready",
            credit: Math.max(0, gap), debt: Math.max(0, -gap),
            world: clocks.world, horizon: clocks.horizon };
    }
    function relative_position(state, member) {
        var origin = (state.members || []).find(function (hero) { return hero.slot === controlled_slot(state); });
        if (!origin || !member) return { kind: "unknown" };
        if (origin.slot === member.slot) return { kind: "self", distance: 0 };
        var same = origin.place && member.place ? origin.place === member.place
            : origin.on_same_level === true && member.on_same_level === true;
        if (!same) return { kind: "away" };
        function position(hero) {
            return hero.pos && Number.isFinite(hero.pos.x) && Number.isFinite(hero.pos.y);
        }
        if (!position(origin) || !position(member)) return { kind: "unknown" };
        var dx = member.pos.x - origin.pos.x, dy = member.pos.y - origin.pos.y;
        var angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        return { kind: "nearby", angle: angle, distance: Math.max(Math.abs(dx), Math.abs(dy)),
            direction: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(angle / 45) % 8] };
    }
    // Projection of facts that affect a party card; positions and clocks do not.
    function members_card_signature(data, controlled_slot, watching)
    {
        return JSON.stringify([
            controlled_slot,
            watching,
            data.combat_locked, data.simultaneous_turns, data.active_slot,
            (data.members || []).flatMap(function (m) {
                return [
                    m.slot, m.active, m.name, m.species, m.trait, m.heads, m.job, m.god, m.title, m.ai, data.ai_manage,
                    m.xl, m.xl_cap, m.xl_next, m.str, m.intel, m.dex, m.place, m.on_same_level,
                    m.region_id, m.region_combat, m.same_region,
                    m.ac, m.ev, m.sh, m.hp, m.hp_max, m.real_hp_max, m.poison_survival, m.mp, m.mp_max,
                    m.ghost_haunting, m.alive, m.connected, m.activity, m.queued_action, m.queued_action_count,
                    m.statuses, m.statuses_known, m.banes, m.banes_known,
                    m.equipment_profile && m.equipment_profile.slots,
                    m.move_aut, m.atk_aut, data.multiplayer && m.can_act,
                    m.god_relation, m.penance, m.god_politics, m.piety_rank, m.faith_description,
                    m.resists, m.defiance, m.elder_rites, m.elder_summary, m.chain_summary,
                    (m.spells || []).flatMap(function (sp) { return [sp.letter, sp.name, sp.level]; }),
                    (m.mutations || []).flatMap(function (mt) { return [mt.name, mt.level]; }),
                    m.weapon,
                    can_control(data, m.slot)
                ];
            })
        ]);
    }

    return { colours: party_slot_colours, normalize: normalize_party_member,
        abbreviation: format_char_abbrev, speciesName: species_name, magicResource: magic_resource, display: display, percentage: percentage, itemName: item_name,
        controlledSlot: controlled_slot, inCombat: in_combat, canControl: can_control, canSwitch: can_switch, cardSignature: members_card_signature,
        initiativeTimeline: initiative_timeline, monsterTiming: monster_timing, relativePosition: relative_position };
});
