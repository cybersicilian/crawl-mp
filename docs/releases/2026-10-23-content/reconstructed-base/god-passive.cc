#include "AppHdr.h"

#include "god-passive.h"

#include <algorithm>
#include <cmath>

#include "act-iter.h"
#include "areas.h"
#include "artefact.h"
#include "art-enum.h"
#include "branch.h"
#include "chardump.h"
#include "cloud.h"
#include "coordit.h"
#include "database.h"
#include "directn.h"
#include "env.h"
#include "fight.h"
#include "files.h"
#include "fineff.h"
#include "fprop.h"
#include "god-abil.h"
#include "god-prayer.h"
#include "invent.h" // in_inventory
#include "item-name.h"
#include "item-prop.h"
#include "item-status-flag-type.h"
#include "items.h"
#include "libutil.h"
#include "los.h"
#include "losglobal.h"
#include "map-knowledge.h"
#include "mapdef.h"
#include "melee-attack.h"
#include "message.h"
#include "mon-act.h"
#include "mon-behv.h"
#include "mon-cast.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "player-reacts.h"
#include "religion.h"
#include "shout.h"
#include "skills.h"
#include "spl-clouds.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "spl-zap.h"
#include "state.h"
#include "stringutil.h"
#include "tag-version.h"
#include "terrain.h"
#include "tiledoll.h"
#include "tile-env.h"
#include "rltiles/tiledef-dngn.h"
#include "tileview.h"
#include "throw.h"
#include "unwind.h"

// TODO: template out the differences between this and god_power.
// TODO: add and use a display method rather than dummy powers in god_powers.
// TODO: finish using these for implementing passive abilities.
struct god_passive
{
    // 1-6 means it unlocks at that many stars of piety;
    // 0 means it is always present when in good standing with the god;
    // -1 means it is present even under penance;
    int rank;
    passive_t pasv;

    god_passive(int rank_, passive_t pasv_)
    : rank{rank_}, pasv{pasv_}
    { }

    god_passive(int rank_)
    : god_passive(rank_, passive_t::none)
    { }
};

static const vector<god_passive> god_passives[] =
{
    // no god
    { },

    // Zin
    {
        { -1, passive_t::protect_from_harm },
        { -1, passive_t::resist_mutation },
        { -1, passive_t::resist_polymorph },
        { -1, passive_t::resist_hell_effects },
        { -1, passive_t::warn_shapeshifter },
        { 6, passive_t::cleanse_mut_potions }
    },

    // TSO
    {
        { -1, passive_t::protect_from_harm },
        { -1, passive_t::abjuration_protection_hd },
        { -1, passive_t::no_stabbing },
        {  0, passive_t::halo },
        {  1, passive_t::restore_hp_mp_vs_evil },
        {  1, passive_t::inspire_followers },
    },

    // Kikubaaqudgha
    {
        {  2, passive_t::miscast_protection_necromancy },
        {  4, passive_t::resist_torment },
    },

    // Yredelemnul
    {
        {  -1, passive_t::umbra },
        {  -1, passive_t::reaping },
        {  -1, passive_t::nightvision },
        {  -1, passive_t::r_spectral_mist },
        {  -1, passive_t::r_misery },
    },

    // Xom
    { },

    // Vehumet
    {
        {  1, passive_t::mp_on_kill },
        {  3, passive_t::spells_success },
        {  4, passive_t::spells_range },
    },

    // Okawaru
    {
        { -1, passive_t::no_allies },
    },

    // Makhleb
    {
        { 1, passive_t::restore_hp },
    },

    // Sif Muna
    { },

    // Trog
    {
        { -1, passive_t::abjuration_protection },
        {  0, passive_t::extend_berserk },
    },

    // Nemelex
    {
        // None
    },

    // Elyvilon
    {
        { -1, passive_t::lifesaving },
        { -1, passive_t::protect_ally },
    },

    // Lugonu
    {
        { -1, passive_t::safe_distortion },
        { -1, passive_t::wrath_banishment },
        { -1, passive_t::map_rot_res_abyss },
        {  5, passive_t::attract_abyssal_rune },
    },

    // Beogh
    {
        {  1, passive_t::convert_orcs },
        {  5, passive_t::water_walk },
    },

    // Jiyva
    {
        { -1, passive_t::neutral_slimes },
        { -1, passive_t::jellies_army },
        { -1, passive_t::jelly_eating },
        {  0, passive_t::slime_wall_immune },
        {  1, passive_t::jelly_regen },
        {  2, passive_t::resist_corrosion },
        {  5, passive_t::spawn_slimes_on_hit },
        {  6, passive_t::unlock_slime_vaults },
    },

    // Fedhas
    {
        { -1, passive_t::pass_through_plants },
        { -1, passive_t::shoot_through_plants },
        {  0, passive_t::friendly_plants },
    },

    // Cheibriados
    {
        { -1, passive_t::no_haste },
        { -1, passive_t::slowed },
        {  0, passive_t::slow_orb_run },
        {  0, passive_t::stat_boost },
        {  0, passive_t::slow_abyss },
        // TODO: this one should work regardless of penance, maybe?
        {  0, passive_t::slow_zot },
        {  0, passive_t::slow_poison },
    },

    // Ashenzari
    {
        { -1, passive_t::want_curses },
        {  0, passive_t::detect_portals },
        {  0, passive_t::detect_montier },
        {  0, passive_t::detect_items },
        {  0, passive_t::bondage_skill_boost },
        {  1, passive_t::identify_items },
        {  2, passive_t::see_unseen},
        {  3, passive_t::clarity },
        {  4, passive_t::avoid_traps },
        {  4, passive_t::scrying },
    },

    // Dithmenos
    {
        {  1, passive_t::umbra },
        {  1, passive_t::nightvision },
        {  3, passive_t::hit_smoke },
        {  4, passive_t::shadow_attacks },
        {  4, passive_t::shadow_spells },
    },

    // Gozag
    {
        {  0, passive_t::goldify_corpses },
        {  0, passive_t::gold_aura },
    },

    // Qazlal
    {
        {  0, passive_t::cloud_immunity },
        {  1, passive_t::storm_shield },
        {  4, passive_t::upgraded_storm_shield },
        {  5, passive_t::elemental_adaptation }
    },

    // Ru
    {
        {  1, passive_t::aura_of_power },
        {  2, passive_t::upgraded_aura_of_power },
    },

#if TAG_MAJOR_VERSION == 34
    // Pakellas: maintained devices are funded by native XP, not MP on kills.
    { },
#endif

    // Uskayaw
    { },

    // Hepliaklqana
    {
        {  1, passive_t::frail },
        {  5, passive_t::transfer_drain },
    },

    // Wu Jian
    {
        { 0, passive_t::wu_jian_lunge },
        { 1, passive_t::wu_jian_whirlwind },
        { 2, passive_t::wu_jian_wall_jump },
    },

    // Ignis
    {
        { 0, passive_t::resist_fire },
    }, // TODO

    // Vorr: Red Wake and Communion are queried by the native resource adapter.
    { },
};
COMPILE_CHECK(ARRAYSZ(god_passives) == NUM_GODS);

static bool _god_gives_passive_if(god_type god, passive_t passive,
                                  function<bool(const god_passive&)> condition)
{
    const auto &pasvec = god_passives[god];
    return any_of(begin(pasvec), end(pasvec),
                  [&] (const god_passive &p) -> bool
                  { return p.pasv == passive && condition(p); });
}

bool god_gives_passive(god_type god, passive_t passive)
{
  return _god_gives_passive_if(god, passive,
                               [] (god_passive /*p*/) { return true; });
}

bool have_passive(passive_t passive)
{
    return _god_gives_passive_if(you.religion, passive,
                                 [] (god_passive p)
                                 {
                                     return piety_rank() >= p.rank
                                         && (!player_under_penance()
                                             || p.rank < 0);
                                 });
}

bool will_have_passive(passive_t passive)
{
  return _god_gives_passive_if(you.religion, passive,
                               [] (god_passive/*p*/) { return true; });
}

// Returns a large number (10) if we will never get this passive.
int rank_for_passive(passive_t passive)
{
    const auto &pasvec = god_passives[you.religion];
    const auto found = find_if(begin(pasvec), end(pasvec),
                              [passive] (const god_passive &p) -> bool
                              {
                                  return p.pasv == passive;
                              });
    return found == end(pasvec) ? 10 : found->rank;
}

int chei_stat_boost(int piety)
{
    if (!have_passive(passive_t::stat_boost))
        return 0;
    if (piety < piety_breakpoint(0))  // Since you've already begun to slow down.
        return 1;
    if (piety >= piety_breakpoint(5))
        return 15;
    return (piety - 10) / 10;
}

// Eat from one random off-level item stack.
void jiyva_eat_offlevel_items()
{
    // For wizard mode 'J' command
    if (!have_passive(passive_t::jelly_eating))
        return;

    if (crawl_state.game_is_sprint())
        return;

    while (true)
    {
        if (one_chance_in(200))
            break;

        const int branch = random2(NUM_BRANCHES);

        // Choose level based on main dungeon depth so that levels of
        // short branches aren't picked more often.
        ASSERT(brdepth[branch] <= MAX_BRANCH_DEPTH);
        const int level = random2(MAX_BRANCH_DEPTH) + 1;

        const level_id lid(static_cast<branch_type>(branch), level);

        if (lid == level_id::current() || !you.level_visited(lid))
            continue;

        dprf("Checking %s", lid.describe().c_str());

        level_excursion le;
        le.go_to(lid);
        while (true)
        {
            if (one_chance_in(200))
                break;

            const coord_def p = random_in_bounds();

            if (env.igrid(p) == NON_ITEM || testbits(env.pgrid(p), FPROP_NO_JIYVA))
                continue;

            for (stack_iterator si(p); si; ++si)
            {
                if (!item_is_jelly_edible(*si) || one_chance_in(4))
                    continue;

                if (one_chance_in(4))
                    break;

                dprf("Eating %s on %s",
                     si->name(DESC_PLAIN).c_str(), lid.describe().c_str());

                mpr("You hear a distant slurping noise.");
                item_was_destroyed(*si);
                destroy_item(si.index());
            }
            return;
        }
    }
}

static void _curse_boost_skills(const item_def &item)
{
    if (!item.props.exists(CURSE_KNOWLEDGE_KEY))
        return;

    for (auto& curse : item.props[CURSE_KNOWLEDGE_KEY].get_vector())
    {
        for (skill_type sk : curse_skills(curse))
        {
            if (you.skill_boost.count(sk))
                you.skill_boost[sk]++;
            else
                you.skill_boost[sk] = 1;
        }
    }
}

// Checks bondage and sets ash piety
void ash_check_bondage()
{
    if (!will_have_passive(passive_t::bondage_skill_boost))
        return;

#if TAG_MAJOR_VERSION == 34
    // Save compatibility for the new ash tag minor forgot to do this
    initialize_ashenzari_props();
#endif

    you.skill_boost.clear();

    int num_cursed = 0, num_slots = 0;
    for (int j = SLOT_FIRST_STANDARD; j < NUM_EQUIP_SLOTS; ++j)
    {
        // Gizmos are not a curseable slot and should not be counted.
        if (j == SLOT_GIZMO)
            continue;

        // Count melded slot-giving unrands here, since any melded items held
        // in those slots will be counted below, which can otherwise result in
        // having more cursed items than the game thinks we have slots.
        num_slots += get_player_equip_slot_count(static_cast<equipment_slot>(j), nullptr, true);
    }

    // Find what percentage of available slots have a cursed item in them.
    // Overflow slots are counted when determining piety (ie: a two-handed
    // weapon is worth the same piety as a one-hander + shield), but only count
    // a single time for the skill boost.
    for (player_equip_entry& entry : you.equipment.items)
    {
        const item_def& item = entry.get_item();
        if (item.cursed())
        {
            ++num_cursed;
            if (!entry.melded && !entry.is_overflow)
                _curse_boost_skills(item);
        }
    }

    set_piety(ASHENZARI_BASE_PIETY
              + (num_cursed * ASHENZARI_PIETY_SCALE) / num_slots);

    calc_hp(true);
    calc_mp(true);

    // We may have reached training targets for some skills.
    check_training_targets();
}

void ash_id_inventory()
{
    for (int slot = 0; slot < ENDOFPACK; ++slot)
    {
        item_def &item = you.inv[slot];
        if (item.defined() && !item.is_identified())
        {
            ash_id_item(item, false);
            item_def * moved = auto_assign_item_slot(item);
            // We moved the item to later in the pack, so don't
            // miss what we swapped with.
            if (moved != nullptr && moved->link > slot)
                --slot;
        }
    }
}

// XXX: If this is called on an item in inventory, then auto_assign_item_slot
// needs to be called subsequently. However, moving an item in inventory
// invalidates its reference, which is a different behavior than for floor
// items, so we don't do it in this function.
void ash_id_item(item_def& item, bool silent)
{
    if (!have_passive(passive_t::identify_items))
        return;

    // Don't identify runes, gems, or the orb, since this has no purpose
    // and might mess up other things.
    if (item_is_collectible(item))
        return;

    if (item.is_identified())
        return;

    identify_item(item);

    if (!silent)
        mprf_nocap("%s", item.name(DESC_INVENTORY_EQUIP).c_str());

    seen_item(item);
}

static bool is_ash_portal(dungeon_feature_type feat)
{
    if (feat_is_portal_entrance(feat))
        return true;
    switch (feat)
    {
    case DNGN_ENTER_HELL:
    case DNGN_EXIT_DIS:
    case DNGN_EXIT_GEHENNA:
    case DNGN_EXIT_COCYTUS:
    case DNGN_EXIT_TARTARUS:
    case DNGN_ENTER_ABYSS: // for completeness
    case DNGN_EXIT_THROUGH_ABYSS:
    case DNGN_EXIT_ABYSS:
    case DNGN_ENTER_PANDEMONIUM:
    case DNGN_EXIT_PANDEMONIUM:
    // DNGN_TRANSIT_PANDEMONIUM is too mundane
        return true;
    default:
        return false;
    }
}

// Yay for rectangle_iterator and radius_iterator not sharing a base type
static bool _check_portal(coord_def where)
{
    const dungeon_feature_type feat = env.grid(where);
    if (feat != env.map_knowledge(where).feat() && is_ash_portal(feat))
    {
        update_terrain_knowledge(where);
        set_terrain_mapped(where);

        if (!testbits(env.pgrid(where), FPROP_SEEN_OR_NOEXP))
        {
            env.pgrid(where) |= FPROP_SEEN_OR_NOEXP;
            if (!you.see_cell(where))
                return true;
        }
    }
    return false;
}

int ash_detect_portals(bool all)
{
    if (!have_passive(passive_t::detect_portals))
        return 0;

    int portals_found = 0;
    const int map_radius = LOS_DEFAULT_RANGE + 1;

    if (all)
    {
        for (rectangle_iterator ri(0); ri; ++ri)
        {
            if (_check_portal(*ri))
                portals_found++;
        }
    }
    else
    {
        for (radius_iterator ri(you.pos(), map_radius, C_SQUARE); ri; ++ri)
        {
            if (_check_portal(*ri))
                portals_found++;
        }
    }

    you.seen_portals += portals_found;
    return portals_found;
}

monster_type ash_monster_tier(const monster *mon)
{
    return monster_type(MONS_SENSED_TRIVIAL + monster_info(mon).threat);
}

/**
 * Does the player have an ash skill boost for a particular skill?
 */
bool ash_has_skill_boost(skill_type sk)
{
    return have_passive(passive_t::bondage_skill_boost)
           && you.skill_boost.count(sk) && you.skill_boost.find(sk)->second;
}

/**
 * Calculate the ash skill point boost for skill sk.
 *
 * @param scaled_skill the skill level to calculate it for, scaled by 10.
 *
 * @return the skill point bonus to use.
 */
unsigned int ash_skill_point_boost(skill_type sk, int scaled_skill)
{
    unsigned int skill_points = 0;
    const int scale = 10;
    const int skill_boost = scale * (you.skill_boost[sk] * 4 + 3) / 3;

    skill_points += skill_boost * (piety_rank() + 1) * max(scaled_skill, 1)
                    * species_apt_factor(sk) / scale;
    return skill_points;
}

int ash_skill_boost(skill_type sk, int scale)
{
    // It gives a bonus to skill points. The formula is:
    // ( curses * 4 / 3 + 1 ) * (piety_rank + 1) * skill_level

    unsigned int skill_points = you.skill_points[sk]
                  + get_crosstrain_points(sk)
                  + ash_skill_point_boost(sk, you.skill(sk, 10, true));

    int level = you.skills[sk];
    while (level < MAX_SKILL_LEVEL && skill_points >= skill_exp_needed(level + 1, sk))
        ++level;

    level = level * scale + get_skill_progress(sk, level, skill_points, scale);

    return min(level, MAX_SKILL_LEVEL * scale);
}

void ash_scrying()
{
    if (have_passive(passive_t::scrying))
    {
        magic_mapping(LOS_MAX_RANGE, 100, true, true, false, false, false,
                      you.pos());
    }
}

void gozag_count_level_gold()
{
    ASSERT(you.on_current_level);
    vector<coord_def> gold_places;
    int gold = 0;
    for (rectangle_iterator ri(0); ri; ++ri)
    {
        for (stack_iterator j(*ri); j; ++j)
        {
            if (j->base_type == OBJ_GOLD && !(j->flags & ISFLAG_UNOBTAINABLE))
            {
                gold += j->quantity;
                gold_places.push_back(*ri);
            }
        }
    }

    if (!player_in_branch(BRANCH_ABYSS))
        you.attribute[ATTR_GOLD_GENERATED] += gold;
}

int qazlal_sh_boost(int piety)
{
    if (!have_passive(passive_t::storm_shield))
        return 0;

    return min(piety, piety_breakpoint(5)) / 10;
}

void qazlal_storm_clouds()
{
    if (!have_passive(passive_t::storm_shield))
        return;

    // You are a *storm*. You are pretty loud!
    noisy(min((int)you.piety(), piety_breakpoint(5)) / 10, you.pos());

    const int radius = you.piety() >= piety_breakpoint(3) ? 2 : 1;

    vector<coord_def> candidates;
    for (radius_iterator ri(you.pos(), radius, C_SQUARE, LOS_SOLID, true);
         ri; ++ri)
    {
        int count = 0;
        if (cell_is_solid(*ri) || cloud_at(*ri))
            continue;

        // Don't create clouds over firewood (to avoid message spam)
        const monster * mon = monster_at(*ri);
        if (mon && mon->is_firewood())
            continue;

        // No clouds in corridors.
        for (adjacent_iterator ai(*ri); ai; ++ai)
            if (!cell_is_solid(*ai))
                count++;

        if (count >= 5)
            candidates.push_back(*ri);
    }
    const int count =
        div_rand_round(min((int)you.piety(), piety_breakpoint(5))
                       * candidates.size() * you.time_taken,
                       piety_breakpoint(5) * 7 * BASELINE_DELAY);
    if (count < 0)
        return;
    shuffle_array(candidates);
    int placed = 0;
    for (unsigned int i = 0; placed < count && i < candidates.size(); i++)
    {
        bool water = false;
        for (adjacent_iterator ai(candidates[i]); ai; ++ai)
        {
            if (feat_is_water(env.grid(*ai)))
                water = true;
        }

        // No flame clouds over water to avoid steam generation.
        cloud_type ctype;
        do
        {
            ctype = random_choose(CLOUD_FIRE, CLOUD_COLD, CLOUD_STORM,
                                  CLOUD_DUST);
        } while (water && ctype == CLOUD_FIRE);

        place_cloud(ctype, candidates[i], random_range(3, 5), &you);
        placed++;
    }
}

/**
 * Handle Qazlal's elemental adaptation.
 * This should be called (exactly once) for physical, fire, cold, and electrical damage.
 * Right now, it is called only from expose_player_to_element. This may merit refactoring.
 *
 * @param flavour the beam type.
 * @param strength The adaptations will trigger strength in (11 - piety_rank()) times. In practice, this is mostly called with a value of 2.
 */
void qazlal_element_adapt(beam_type flavour, int strength)
{
    if (strength <= 0
        || !have_passive(passive_t::elemental_adaptation)
        || !x_chance_in_y(strength, 11 - piety_rank()))
    {
        return;
    }

    beam_type what = BEAM_NONE;
    duration_type dur = NUM_DURATIONS;
    string descript = "";
    switch (get_beam_resist_type(flavour))
    {
        case BEAM_FIRE:
        case BEAM_STICKY_FLAME:
        case BEAM_STEAM:
            what = BEAM_FIRE;
            dur = DUR_QAZLAL_FIRE_RES;
            descript = "fire";
            break;
        case BEAM_COLD:
            what = BEAM_COLD;
            dur = DUR_QAZLAL_COLD_RES;
            descript = "cold";
            break;
        case BEAM_ELECTRICITY:
            what = BEAM_ELECTRICITY;
            dur = DUR_QAZLAL_ELEC_RES;
            descript = "electricity";
            break;
        case BEAM_MISSILE:
            what = BEAM_MISSILE;
            dur = DUR_QAZLAL_AC;
            descript = "physical attacks";
            break;
        default:
            return;
    }

    if (what != BEAM_FIRE && you.duration[DUR_QAZLAL_FIRE_RES])
    {
        mprf(MSGCH_DURATION, "Your resistance to fire fades away.");
        you.duration[DUR_QAZLAL_FIRE_RES] = 0;
    }

    if (what != BEAM_COLD && you.duration[DUR_QAZLAL_COLD_RES])
    {
        mprf(MSGCH_DURATION, "Your resistance to cold fades away.");
        you.duration[DUR_QAZLAL_COLD_RES] = 0;
    }

    if (what != BEAM_ELECTRICITY && you.duration[DUR_QAZLAL_ELEC_RES])
    {
        mprf(MSGCH_DURATION, "Your resistance to electricity fades away.");
        you.duration[DUR_QAZLAL_ELEC_RES] = 0;
    }

    if (what != BEAM_MISSILE && you.duration[DUR_QAZLAL_AC])
    {
        mprf(MSGCH_DURATION, "Your resistance to physical damage fades away.");
        you.duration[DUR_QAZLAL_AC] = 0;
        you.redraw_armour_class = true;
    }

    mprf(MSGCH_GOD, "You feel %sprotected from %s.",
         you.duration[dur] > 0 ? "more " : "", descript.c_str());

    // was scaled by 10 * strength. But the strength parameter is used so inconsistently that
    // it seems like a constant would be better, based on the typical value of 2.
    you.increase_duration(dur, 20, 80);

    if (what == BEAM_MISSILE)
        you.redraw_armour_class = true;
}

/**
 * Determine whether a Ru worshipper will attempt to interfere with an attack
 * against the player.
 *
 * @return bool Whether or not whether the worshipper will attempt to interfere.
 */
bool does_ru_wanna_redirect(const monster &mon)
{
    return have_passive(passive_t::aura_of_power)
            && !mon.friendly()
            && you.see_cell_no_trans(mon.pos())
            && !mon.is_firewood()
            && !mons_is_projectile(mon.type);
}

/**
 * Determine which, if any, action Ru takes on a possible attack.
 *
 * @return ru_interference
 */
ru_interference get_ru_attack_interference_level()
{
    int r = random2(100);
    int chance = div_rand_round(you.piety(), 16);

    // 10% chance of stopping any attack at max piety
    if (r < chance)
        return DO_BLOCK_ATTACK;

    // 5% chance of redirect at max piety
    else if (r < chance + div_rand_round(chance, 2))
        return DO_REDIRECT_ATTACK;

    else
        return DO_NOTHING;
}

void dithmenos_cleanup_player_shadow(monster* shadow)
{
    if (shadow && dithmenos_get_player_shadow() == shadow)
        you.props.erase(DITH_SHADOW_MID_KEY);
}

monster* dithmenos_get_player_shadow()
{
    if (!you.props.exists(DITH_SHADOW_MID_KEY))
        return nullptr;
    const int mid = you.props[DITH_SHADOW_MID_KEY].get_int();
    return monster_by_mid(mid);
}

// Returns index of the new item
static int _clone_player_weapon(const item_def* wpn)
{
    int index = get_mitm_slot(10);
    if (index == NON_ITEM)
        return index;

    item_def& new_item = env.item[index];
    if (wpn->base_type == OBJ_STAVES)
    {
        new_item.base_type = OBJ_WEAPONS;
        new_item.sub_type  = WPN_STAFF;
    }
    else
    {
        new_item.base_type = wpn->base_type;
        new_item.sub_type  = wpn->sub_type;
    }
    new_item.quantity = 1;
    new_item.rnd = 1;
    new_item.flags   |= ISFLAG_SUMMONED;

    return index;
}

monster* create_player_shadow(coord_def pos, bool friendly, spell_type spell_known)
{
    // If a player shadow already exists, remove it first.
    // But save some state, in case it was currently in decoy mode.
    int decoy_duration = 0;
    int decoy_hp = 0;
    for (monster_iterator mi; mi; ++mi)
    {
        if (mons_is_player_shadow(**mi))
        {
            if (mi->has_ench(ENCH_CHANGED_APPEARANCE))
            {
                decoy_duration = mi->get_ench(ENCH_CHANGED_APPEARANCE).duration;
                decoy_hp = mi->hit_points;
            }
            monster_die(**mi, KILL_RESET, true);
            break;
        }
    }

    // Do a basic clone of the weapon (same base type, but no brand or plusses).
    // Also magical staves become plain staves instead.
    int wpn_index  = NON_ITEM;
    int wpn2_index = NON_ITEM;
    item_def* wpn = you.weapon();
    if (wpn && is_weapon(*wpn))
    {
        wpn_index = _clone_player_weapon(wpn);
        if (wpn_index == NON_ITEM)
            return nullptr;
    }

    // Clone a Coglin's second weapon also
    if (you.has_mutation(MUT_WIELD_OFFHAND) && you.offhand_weapon()
        && is_weapon(*you.offhand_weapon()))
    {
        wpn2_index = _clone_player_weapon(you.offhand_weapon());
        if (wpn2_index == NON_ITEM)
            return nullptr;
    }

    mgen_data mg(MONS_PLAYER_SHADOW, friendly ? BEH_FRIENDLY : BEH_HOSTILE,
                 pos, MHITYOU, MG_AUTOFOE);
    mg.flags |= MG_FORCE_PLACE;

    // This is for weapon accuracy only. Spell HD is calculated differently.
    mg.hd = 7 + (you.experience_level * 5 / 4);
    mg.hp = 5 + you.experience_level * 3 / 2;
    // Preserve the health boost from an active decoy
    if (decoy_duration > 0)
        mg.hp += you.skill_rdiv(SK_INVOCATIONS, 5, 2);

    if (!friendly)
        mg.hp = mg.hp * 3;
    else
        mg.set_summoned(&you, SPELL_NO_SPELL, random_range(4, 6) * BASELINE_DELAY, false);

    monster* mon = create_monster(mg);
    if (!mon)
    {
        if (wpn_index)
            destroy_item(wpn_index);
        if (wpn2_index)
            destroy_item(wpn2_index);
        return nullptr;
    }

    mon->flags      = MF_NO_REWARD | MF_JUST_SUMMONED | MF_SEEN
                    | MF_WAS_IN_VIEW | MF_HARD_RESET;

    if (wpn_index != NON_ITEM)
        mon->pickup_item(env.item[wpn_index], false, true);
    if (wpn2_index != NON_ITEM)
    {
        mon->pickup_item(env.item[wpn2_index], false, true);

        // Randomize order, like for players
        if (coinflip())
            mon->swap_weapons(false);
    }

    // Set damage based on xl, with a bonus for UC characters (since they won't
    // get the damage from their weapon on top of this)
    mon->props[DITH_SHADOW_ATTACK_KEY] = you.experience_level;
    if (wpn_index == NON_ITEM)
        mon->props[DITH_SHADOW_ATTACK_KEY].get_int() += you.skill(SK_UNARMED_COMBAT);

    if (spell_known != SPELL_NO_SPELL)
    {
        mon->spells.emplace_back(spell_known, 50, MON_SPELL_WIZARD);
        mon->props[CUSTOM_SPELLS_KEY] = true;
    }

    if (friendly)
        you.props[DITH_SHADOW_MID_KEY].get_int() = mon->mid;
    else
    {
        mon->props[DITH_SHADOW_ATTACK_KEY].get_int() += 3 + (you.experience_level * 3 / 2);
        mon->props[DITH_SHADOW_SPELLPOWER_KEY] = div_rand_round(you.experience_level * 3, 4);
    }

    // Now, if there was a previously-existing shadow that was in decoy mode,
    // update its tile and remap all existing misdirections onto the new shadow
    if (decoy_duration > 0)
    {
        dithmenos_change_shadow_appearance(*mon, decoy_duration - you.time_taken);
        for (monster_iterator mi; mi; ++mi)
        {
            if (mi->has_ench(ENCH_MISDIRECTED))
            {
                mon_enchant en = mi->get_ench(ENCH_MISDIRECTED);
                en.source = mon->mid;
                mi->update_ench(en);
            }
        }
        mon->hit_points = decoy_hp;
    }

    return mon;
}

static bool _shadow_acts(bool spell)
{
    const passive_t pasv = spell ? passive_t::shadow_spells
                                 : passive_t::shadow_attacks;
    if (!have_passive(pasv) || you.triggers_done[DID_DITH_SHADOW])
        return false;

    const int minpiety = piety_breakpoint(rank_for_passive(pasv) - 1);

    // 10% chance at minimum piety; 50% chance at 200 piety.
    const int range = MAX_PIETY - minpiety;
    const int min   = range / 5;
    return x_chance_in_y(min + ((range - min)
                                * (you.piety() - minpiety)
                                / (MAX_PIETY - minpiety)),
                         2 * range);
}

static monster* _shadow_monster()
{
    if (monster_at(you.pos()))
        return nullptr;

    int wpn_index  = NON_ITEM;

    // Do a basic clone of the weapon.
    item_def* wpn = you.weapon();
    if (wpn
        && is_weapon(*wpn))
    {
        wpn_index = _clone_player_weapon(wpn);
        if (wpn_index == NON_ITEM)
            return nullptr;
    }

    monster* mon = get_free_monster();
    if (!mon)
    {
        if (wpn_index != NON_ITEM)
            destroy_item(wpn_index);
        return nullptr;
    }

    mon->type       = MONS_PLAYER_SHADOW;
    mon->behaviour  = BEH_SEEK;
    mon->base_attitude = ATT_FRIENDLY;
    mon->flags      = MF_NO_REWARD | MF_JUST_SUMMONED | MF_SEEN
                    | MF_WAS_IN_VIEW | MF_HARD_RESET;
    mon->hit_points = you.hp;
    mon->set_hit_dice(min(27, max(1,
                                  you.skill_rdiv(wpn_index != NON_ITEM
                                                 ? item_attack_skill(env.item[wpn_index])
                                                 : SK_UNARMED_COMBAT, 10, 20)
                                  + you.skill_rdiv(SK_FIGHTING, 10, 20))));
    mon->set_position(you.pos());
    mon->set_new_monster_id();
    mon->max_hit_points = mon->hit_points;
    if (wpn_index == NON_ITEM)
        mon->props[DITH_SHADOW_ATTACK_KEY] = max(1, you.skill_rdiv(SK_UNARMED_COMBAT, 10, 20));
    mon->inv[MSLOT_WEAPON]  = wpn_index;
    mon->inv[MSLOT_MISSILE] = NON_ITEM;

    env.mgrid(you.pos()) = mon->mindex();

    return mon;
}

static void _shadow_monster_reset(monster *mon)
{
    if (mon->inv[MSLOT_WEAPON] != NON_ITEM)
        destroy_item(mon->inv[MSLOT_WEAPON]);
    // in case the shadow unwields for some reason, e.g. you clumsily bash with
    // a ranged weapon:
    if (mon->inv[MSLOT_ALT_WEAPON] != NON_ITEM)
        destroy_item(mon->inv[MSLOT_ALT_WEAPON]);
    if (mon->inv[MSLOT_MISSILE] != NON_ITEM)
        destroy_item(mon->inv[MSLOT_MISSILE]);

    if (env.mgrid(mon->pos()) == mon->mindex())
        env.mgrid(mon->pos()) = NON_MONSTER;
    mon->reset();
}

/**
 * Check if the player is in melee range of the target.
 *
 * Certain effects, e.g. distortion blink, can cause monsters to leave melee
 * range between the initial hit & the shadow mimic.
 *
 * XXX: refactor this with attack/fight code!
 *
 * @param target    The creature to be struck.
 * @return          Whether the player is melee range of the target, using
 *                  their current weapon.
 */
static bool _in_melee_range(actor* target)
{
    const int dist = (you.pos() - target->pos()).rdist();
    return dist <= you.reach_range();
}

void dithmenos_shadow_melee(actor* target)
{
    if (!target
        || !target->alive()
        || !_in_melee_range(target)
        || !_shadow_acts(false))
    {
        return;
    }

    monster* mon = _shadow_monster();
    if (!mon)
        return;

    mon->target     = target->pos();
    mon->foe        = target->mindex();

    you.did_trigger(DID_DITH_SHADOW);
    mons_fight(mon, target);

    _shadow_monster_reset(mon);
}

// The original aura reaches normal LOS at six stars; party members use the
// same calculation as the active player.
int dithmenos_umbra_radius(int piety, int vision)
{
    return min(piety, piety_breakpoint(5)) * vision / piety_breakpoint(5);
}

void dithmenos_shadow_shoot(const coord_def& target, missile_type projectile)
{
    if (!_shadow_acts(false))
        return;
    monster* mon = _shadow_monster();
    if (!mon)
        return;

    item_def* missile = mon->launcher();
    if (projectile != NUM_MISSILES)
    {
        const int index = get_mitm_slot(10);
        if (index == NON_ITEM)
        {
            _shadow_monster_reset(mon);
            return;
        }
        missile = &env.item[index];
        missile->base_type = OBJ_MISSILES;
        missile->sub_type = projectile;
        missile->quantity = 1;
        missile->rnd = 1;
        missile->flags |= ISFLAG_SUMMONED;
        mon->inv[MSLOT_MISSILE] = index;
    }
    if (missile)
    {
        you.did_trigger(DID_DITH_SHADOW);
        ranged_attack_beam atk(*mon, *missile);
        atk.beam.target = target;
        atk.beam.stop_at_allies = true;
        mons_throw(mon, atk);
    }
    _shadow_monster_reset(mon);
}

void dithmenos_shadow_spell(const bolt& original, spell_type spell)
{
    const coord_def target = original.target;
    // Only mimic targeted, offensive spells. Never turn self-buffs, summons,
    // terrain effects or a beneficial enchantment into an attack on the player.
    if (!(get_spell_flags(spell) & spflag::targeting_mask)
        || (get_spell_flags(spell) & (spflag::helpful | spflag::obj))
        || (!original.is_enchantment() && !battlesphere_can_mirror(spell))
        || target.origin() || target == you.pos()
        || spell == SPELL_BOULDER
        || (original.is_enchantment() && !is_valid_mon_spell(spell))
        || (original.flavour == BEAM_CHARM && monster_at(target)
            && monster_at(target)->friendly())
        || !_shadow_acts(true))
    {
        return;
    }
    monster* mon = _shadow_monster();
    if (!mon)
        return;
    const int hd = max(1, min(3 * spell_difficulty(spell), you.experience_level) / 2);
    mon->set_hit_dice(hd);
    mon->props[DITH_SHADOW_SPELLPOWER_KEY] = hd;
    mon->target = clamp_in_bounds(target);
    if (actor* victim = actor_at(target))
        mon->foe = victim->mindex();
    const spell_type mimic = original.is_enchantment() ? spell
        : original.pierce ? SPELL_SHADOW_BEAM : SPELL_SHADOW_SHARD;
    bolt beam;
    beam.target = target;
    beam.aimed_at_spot = original.aimed_at_spot;
    you.did_trigger(DID_DITH_SHADOW);
    mprf(MSGCH_FRIEND_SPELL, "%s mimics your spell!", mon->name(DESC_THE).c_str());
    mons_cast(mon, beam, mimic, MON_SPELL_WIZARD, false);
    _shadow_monster_reset(mon);
}

void wu_jian_trigger_serpents_lash(bool wall_jump)
{
    if (you.attribute[ATTR_SERPENTS_LASH] == 0)
       return;

    if (wall_jump && you.attribute[ATTR_SERPENTS_LASH] == 1)
    {
        // No turn manipulation, since we are only refunding half a wall jump's
        // time (the walk speed modifier for this special case is already
        // factored in main.cc)
        you.attribute[ATTR_SERPENTS_LASH] = 0;
    }
    else
    {
        you.attribute[ATTR_SERPENTS_LASH] -= wall_jump ? 2 : 1;
        you.redraw_status_lights = true;
        player_takes_instant_action();
        fire_final_effects();
    }

    if (you.attribute[ATTR_SERPENTS_LASH] == 0)
    {
        you.increase_duration(DUR_EXHAUSTED, 12 + random2(5));
        mpr("Your supernatural speed expires.");
    }
}

static void _wu_jian_increment_heavenly_storm()
{
    int storm = you.props[WU_JIAN_HEAVENLY_STORM_KEY].get_int();
    if (storm < WU_JIAN_HEAVENLY_STORM_MAX)
    {
        you.props[WU_JIAN_HEAVENLY_STORM_KEY].get_int()++;
        you.redraw_evasion = true;
    }
}

void wu_jian_heaven_tick()
{
    for (radius_iterator ai(you.pos(), 2, C_SQUARE, LOS_SOLID); ai; ++ai)
        if (!cell_is_solid(*ai))
            place_cloud(CLOUD_GOLD_DUST, *ai, 5 + random2(5), &you);

    noisy(12, you.pos());
}

void wu_jian_decrement_heavenly_storm()
{
    int storm = you.props[WU_JIAN_HEAVENLY_STORM_KEY].get_int();

    if (storm > 1)
    {
        you.props[WU_JIAN_HEAVENLY_STORM_KEY].get_int()--;
        you.set_duration(DUR_HEAVENLY_STORM, random_range(2, 3));
        you.redraw_evasion = true;
    }
    else
        wu_jian_end_heavenly_storm();
}

// TODO: why isn't this implemented as a duration end effect?
void wu_jian_end_heavenly_storm()
{
    you.props.erase(WU_JIAN_HEAVENLY_STORM_KEY);
    you.duration[DUR_HEAVENLY_STORM] = 0;
    you.redraw_evasion = true;
    invalidate_agrid();
    mprf(MSGCH_GOD, "The heavenly storm settles.");
}

bool wu_jian_has_momentum(wu_jian_attack_type attack_type)
{
    return you.attribute[ATTR_SERPENTS_LASH]
           && attack_type != WU_JIAN_ATTACK_NONE;
}

static bool _can_attack_martial(const monster* mons)
{
    return !(mons->wont_attack()
             || mons->is_firewood()
             || mons_is_projectile(mons->type)
             || !you.can_see(*mons));
}

// A mismatch between attack speed and move speed may cause any particular
// martial attack to be doubled, tripled, or not happen at all. Given enough
// time moving, you would have made the same amount of attacks as tabbing.
static int _wu_jian_number_of_attacks(int& dmg_penalty, bool wall_jump)
{
    // Under the effect of serpent's lash, move delay is normalized to
    // 10 aut for every character, to avoid punishing fast races.
    const int move_delay = (you.attribute[ATTR_SERPENTS_LASH]
                            ? 100
                            : player_overall_move_delay(BASELINE_DELAY))
                                                        * (wall_jump ? 2 : 1);

    int attack_delay = you.attack_delay().roll() * BASELINE_DELAY;

    // Rather than sometimes performing 0 attacks if we're moving too quickly for
    // our attack speed, perform a single attack with proportionally lowered damage.
    if (attack_delay > move_delay)
    {
        dmg_penalty = (move_delay * 100 / attack_delay) - 100;
        return 1;
    }

    return div_rand_round(move_delay, attack_delay);
}

static bool _wu_jian_lunge(coord_def old_pos, coord_def new_pos,
                           bool check_only)
{
    coord_def lunge_direction = (new_pos - old_pos).sgn();
    coord_def potential_target = new_pos + lunge_direction;
    monster* mons = monster_at(potential_target);

    if (!mons || !_can_attack_martial(mons) || !mons->alive())
        return false;
    if (check_only)
        return true;

    if (you.props.exists(WU_JIAN_HEAVENLY_STORM_KEY))
        _wu_jian_increment_heavenly_storm();

    int dmg_mult = 0;
    const int number_of_attacks = _wu_jian_number_of_attacks(dmg_mult, false);

    mprf("You lunge%s at %s%s.",
            wu_jian_has_momentum(WU_JIAN_ATTACK_LUNGE) ?
                " with incredible momentum" : "",
            mons->name(DESC_THE).c_str(),
            number_of_attacks > 1 ? ", in a flurry of attacks" : "");

    count_action(CACT_ATTACK, ATTACK_LUNGE);

    for (int i = 0; i < number_of_attacks; i++)
    {
        if (!mons->alive())
            break;
        melee_attack lunge(&you, mons);
        lunge.wu_jian_attack = WU_JIAN_ATTACK_LUNGE;
        lunge.dmg_mult = dmg_mult;
        lunge.launch_attack_set();
    }

    return true;
}

// Monsters adjacent to the given pos that are valid targets for whirlwind.
static vector<monster*> _get_whirlwind_targets(coord_def pos)
{
    vector<monster*> targets;
    for (adjacent_iterator ai(pos, true); ai; ++ai)
        if (monster* mon = monster_at(*ai))
            if (_can_attack_martial(mon) && !you.whirlwind_targets.count(mon->mid))
                targets.push_back(mon);
    sort(targets.begin(), targets.end());
    return targets;
}

static bool _wu_jian_whirlwind(coord_def old_pos, coord_def new_pos,
                               bool check_only)
{
    const vector<monster*> targets = _get_whirlwind_targets(new_pos);
    if (targets.empty())
        return false;

    const vector<monster*> old_targets = _get_whirlwind_targets(old_pos);
    vector<monster*> common_targets;
    set_intersection(targets.begin(), targets.end(),
                     old_targets.begin(), old_targets.end(),
                     back_inserter(common_targets));

    if (check_only)
        return !common_targets.empty();

    bool did_at_least_one_attack = false;
    for (auto mons : common_targets)
    {
        if (!mons->alive())
            continue;

        if (you.props.exists(WU_JIAN_HEAVENLY_STORM_KEY))
            _wu_jian_increment_heavenly_storm();

        int dmg_mult = 0;
        const int number_of_attacks = _wu_jian_number_of_attacks(dmg_mult, false);
        mprf("You spin and attack %s%s%s.",
                mons->name(DESC_THE).c_str(),
                number_of_attacks > 1 ? " repeatedly" : "",
                wu_jian_has_momentum(WU_JIAN_ATTACK_WHIRLWIND) ?
                    ", with incredible momentum" : "");

        count_action(CACT_ATTACK, ATTACK_WHIRLWIND);
        you.whirlwind_targets.insert(mons->mid);

        for (int i = 0; i < number_of_attacks; i++)
        {
            if (!mons->alive())
                break;
            melee_attack whirlwind(&you, mons);
            whirlwind.wu_jian_attack = WU_JIAN_ATTACK_WHIRLWIND;
            whirlwind.dmg_mult = dmg_mult;
            whirlwind.wu_jian_number_of_targets = common_targets.size();
            did_at_least_one_attack |= whirlwind.launch_attack_set(true);
        }
    }

    // Even failing to land any blows due to movement speed will maintain
    // status effects, but we can't trigger things like paragon unless a real
    // attack was made.
    if (!common_targets.empty())
        player_attempted_attack(did_at_least_one_attack);

    return !common_targets.empty();
}

static bool _wu_jian_trigger_martial_arts(coord_def old_pos,
                                          coord_def new_pos,
                                          bool check_only = false,
                                          bool allow_lunge = true)
{
    if (new_pos == old_pos
        || you.duration[DUR_CONF]
        || you.weapon() && !is_melee_weapon(*you.weapon()))
    {
        return false;
    }

    bool attacked = false;

    if (allow_lunge && have_passive(passive_t::wu_jian_lunge))
        attacked = _wu_jian_lunge(old_pos, new_pos, check_only);

    if (have_passive(passive_t::wu_jian_whirlwind))
        attacked |= _wu_jian_whirlwind(old_pos, new_pos, check_only);

    return attacked;
}

// Return a monster at pos which a wall jump could attack, nullptr if none.
monster *wu_jian_wall_jump_monster_at(const coord_def &pos)
{
    monster *target = monster_at(pos);
    if (target && target->alive() && _can_attack_martial(target))
        return target;
    return nullptr;
}

static vector<monster*> _wu_jian_wall_jump_monsters(const coord_def &pos)
{
    vector<monster*> targets;
    for (adjacent_iterator ai(pos, true); ai; ++ai)
        if (monster *target = wu_jian_wall_jump_monster_at(*ai))
            targets.push_back(target);
    return targets;
}

// Return true if wu_jian_wall_jump_effects() would attack a monster when
// called with you.pos() as pos.
bool wu_jian_wall_jump_triggers_attacks(const coord_def &pos)
{
    return !_wu_jian_wall_jump_monsters(pos).empty();
}

// Returns true if at least one monster could have been attacked (even if our
// attack speed was somehow too slow to succeed at doing so.)
void wu_jian_wall_jump_effects()
{
    for (adjacent_iterator ai(you.pos(), true); ai; ++ai)
        place_cloud(CLOUD_DUST, *ai, 1 + random2(3) , &you, 0, -1);

    vector<monster*> targets = _wu_jian_wall_jump_monsters(you.pos());
    bool did_attack = false;
    for (auto target : targets)
    {
        if (!target->alive())
            continue;

        if (you.props.exists(WU_JIAN_HEAVENLY_STORM_KEY))
            _wu_jian_increment_heavenly_storm();

        // Twice the attacks as Wall Jump spends twice the time
        int dmg_mult = 0;
        const int number_of_attacks = _wu_jian_number_of_attacks(dmg_mult, true);
        mprf("You %sattack %s from above%s.",
                number_of_attacks > 1 ? "repeatedly " : "",
                target->name(DESC_THE).c_str(),
                wu_jian_has_momentum(WU_JIAN_ATTACK_WALL_JUMP) ?
                    ", with incredible momentum" : "");

        for (int i = 0; i < number_of_attacks; i++)
        {
            if (!target->alive())
                break;

            melee_attack aerial(&you, target);
            aerial.wu_jian_attack = WU_JIAN_ATTACK_WALL_JUMP;
            aerial.dmg_mult = dmg_mult;
            aerial.wu_jian_number_of_targets = targets.size();
            did_attack |= aerial.launch_attack_set();
        }
    }

    if (!targets.empty())
        player_attempted_attack(did_attack);
}

bool wu_jian_post_move_effects(bool did_wall_jump,
                               const coord_def& old_pos,
                               bool allow_lunge)
{
    bool attacked = false;
    if (!did_wall_jump)
        attacked = _wu_jian_trigger_martial_arts(old_pos, you.pos(), false, allow_lunge);

    if (you.attribute[ATTR_SERPENTS_LASH])
        place_cloud(CLOUD_DUST, old_pos, 2 + random2(3) , &you, 1, -1);

    return attacked;
}

bool wu_jian_move_triggers_attacks(coord_def new_pos)
{
    return _wu_jian_trigger_martial_arts(you.pos(), new_pos, true);
}

/**
 * check if the monster in this cell exists and is a valid target for Uskayaw
 */
static int _check_for_uskayaw_targets(coord_def where)
{
    if (!cell_has_valid_target(where))
        return 0;
    monster* mons = monster_at(where);
    ASSERT(mons);

    if (mons->is_firewood())
        return 0;

    return 1;
}

/**
 * Paralyse the monster in this cell, assuming one exists.
 *
 * Duration increases with invocations and experience level, and decreases
 * with target HD. The duration is pretty low, maxing out at 40 AUT.
 */
static int _prepare_audience(coord_def where)
{
    if (!_check_for_uskayaw_targets(where))
        return 0;

    monster* mons = monster_at(where);

    int power =  max(1, random2(1 + you.skill(SK_INVOCATIONS, 2))
                 + you.experience_level - mons->get_hit_dice());
    int duration = min(max(10, 5 + power), 40);
    mons->add_ench(mon_enchant(ENCH_PARALYSIS, &you, duration));

    return 1;
}

/**
 * On hitting *** piety, all the monsters are paralysed by their appreciation
 * for your dance.
 */
void uskayaw_prepares_audience()
{
    int count = apply_area_visible(_check_for_uskayaw_targets, you.pos());
    if (count > 0)
    {
        simple_god_message(" prepares the audience for your solo!");
        apply_area_visible(_prepare_audience, you.pos());

        // Increment a delay timer to prevent players from spamming this ability
        // via piety loss and gain. Timer is in AUT.
        you.props[USKAYAW_AUDIENCE_TIMER] = 300 + random2(201);
    }
    else // Reset the timer because we didn't actually execute.
        you.props[USKAYAW_AUDIENCE_TIMER] = 0;
}

/**
 * Apply pain bond to the monster in this cell.
 */
static int _bond_audience(coord_def where)
{
    if (!_check_for_uskayaw_targets(where))
        return 0;

    monster* mons = monster_at(where);

    // Don't pain bond monsters that aren't invested in fighting the player
    if (mons->wont_attack())
        return 0;

    int power = you.skill(SK_INVOCATIONS, 7) + you.experience_level
                 - mons->get_hit_dice();
    int duration = 20 + random2avg(power, 2);
    mons->add_ench(mon_enchant(ENCH_PAIN_BOND, &you, duration));

    return 1;
}

/**
 * On hitting **** piety, all the monsters are pain bonded.
 */
void uskayaw_bonds_audience()
{
    int count = apply_area_visible(_check_for_uskayaw_targets, you.pos());
    if (count > 1)
    {
        simple_god_message(" links your audience in an emotional bond!");
        apply_area_visible(_bond_audience, you.pos());

        // Increment a delay timer to prevent players from spamming this ability
        // via piety loss and gain. Timer is in AUT.
        you.props[USKAYAW_BOND_TIMER] = 300 + random2(201);
    }
    else // Reset the timer because we didn't actually execute.
        you.props[USKAYAW_BOND_TIMER] = 0;
}

// Checks whether there is at least one possible Tyrant buff that a given
// qualifies for, but does not yet have.
static bool _is_tyrant_buffable(monster* mon)
{
    return !mon->has_ench(ENCH_HASTE)
            || !mon->has_ench(ENCH_MIGHT)
            || !mon->has_ench(ENCH_REGENERATION)
            || (mon->has_spells() && !mon->has_ench(ENCH_EMPOWERED_SPELLS));
}

// Upon killing an enemy, maybe buff a nearby servant
void makhleb_tyrant_buff()
{
    int count = 0;
    monster* demon = nullptr;
    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        if (mi->friendly() && mi->was_created_by(you, MON_SUMM_AID)
            && _is_tyrant_buffable(*mi) && one_chance_in(++count))
        {
            {
                demon = *mi;
            }
        }
    }

    enum tyrant_buff
    {
        HASTE,
        MIGHT,
        REGEN,
        BRILLIANCE,
    };

    if (demon)
    {
        vector<tyrant_buff> buffs;

        if (!demon->has_ench(ENCH_HASTE))
            buffs.push_back(HASTE);
        if (!demon->has_ench(ENCH_MIGHT))
            buffs.push_back(MIGHT);
        if (!demon->has_ench(ENCH_REGENERATION))
            buffs.push_back(REGEN);
        if (demon->has_spells() && !demon->has_ench(ENCH_EMPOWERED_SPELLS))
            buffs.push_back(BRILLIANCE);

        shuffle_array(buffs);

        switch (buffs[0])
        {
            case HASTE:
                demon->add_ench(ENCH_HASTE);
                break;

            case MIGHT:
                demon->add_ench(ENCH_MIGHT);
                break;

            case REGEN:
                demon->add_ench(ENCH_REGENERATION);
                break;

            case BRILLIANCE:
                demon->add_ench(ENCH_EMPOWERED_SPELLS);
                break;
        }

        simple_monster_message(*demon, " is spurred on by your onslaught.");
    }
    else if (party::is_enabled())
    {
        const int active = party::active_slot();
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == active || !party::slot_is_alive(i)
                || !party::slot_is_on_current_floor(i))
            {
                continue;
            }
            const player &ally = party::Member(i);
            if (!you.see_cell_no_trans(ally.pos()))
                continue;
            if (party::are_gods_concordant(GOD_MAKHLEB, ally.religion))
            {
                const duration_type chosen = random_choose(
                    DUR_MIGHT, DUR_HASTE, DUR_REGENERATION);
                party::heal_or_buff_party_member(
                    i, 0, 0, chosen, 6 + random2(6),
                    "Makhleb's tyrannical onslaught spurs on");
                break;
            }

        }
    }
}

void makhleb_celebrant_bloodrite()
{
    if (you.hp * 2 > you.hp_max
        || !you.has_mutation(MUT_MAKHLEB_MARK_CELEBRANT)
        || you.duration[DUR_CELEBRANT_COOLDOWN])
    {
        return;
    }

    schedule_celebrant_bloodrite_fineff();
}

void makhleb_execution_activate()
{
    string talk = getSpeakString("Makhleb executioner chatter");
    mprf(MSGCH_TALK, "<lightred>%s</lightred>", talk.c_str());
    mprf(MSGCH_DURATION, "A whirlwind of blades manifests around you!");

    you.duration[DUR_EXECUTION] = random_range(50, 70);
#ifdef USE_TILE
    init_player_doll();
#endif

    for (adjacent_iterator ai(you.pos()); ai; ++ai)
    {
        monster* mon = monster_at(*ai);
        if (mon && mon->alive() && !mon->wont_attack())
        {
            melee_attack shred(&you, mon);
            shred.player_do_aux_attack(UNAT_EXECUTIONER_BLADE);
        }
    }
}

bool makhleb_haemoclasm_trigger_check(const monster& victim)
{
    int count = 0;
    for (adjacent_iterator ai(victim.pos()); ai; ++ai)
    {
        if (monster* mons = monster_at(*ai))
        {
            if (!mons->wont_attack() && !mons->is_firewood())
                ++count;
        }
    }

    // These explosions can never hit anything, and so are useless or actively
    // negative, but it looks better if they can still *sometimes* happen.
    if (count == 0)
        return one_chance_in(20);
    // A much higher chance if there's at least one thing the explosion could
    // hit, scaling slightly with *how* many things could be hit.
    else
        return x_chance_in_y(6, 30 - count * 3);
}

void tso_maybe_bless_follower()
{
    // Chance scales from 20% at 1* to 35% at 6*.
    int chance = 15 * (min(piety_breakpoint(5), (int)you.piety()) - 30)
                                    / (piety_breakpoint(5) - piety_breakpoint(0)) + 20;
    if (!x_chance_in_y(chance, 100))
        return;

    // Can either give a divine shield to an injured ally or extra energy to any
    // ally who is able to act (and hasn't just gotten an energy infusion already).
    monster* fervor_targ = nullptr;
    monster* protection_targ = nullptr;
    int fervor_count = 0;
    int protection_count = 0;
    for (monster_near_iterator mi(you.pos()); mi; ++mi)
    {
        if (mi->friendly() && !mi->is_peripheral())
        {
            if (party::is_enabled() && party::is_proxy_monster(**mi))
            {
                const int slot = party::proxy_slot(**mi);
                if (slot >= 0)
                {
                    const player &ally = party::Member(slot);
                    if (!party::are_gods_concordant(GOD_SHINING_ONE, ally.religion)
                        || (ally.holiness() & (MH_UNDEAD | MH_DEMONIC)))
                    {
                        continue;
                    }
                }
            }
            if (mi->hit_points < mi->max_hit_points && !mi->has_ench(ENCH_DIVINE_SHIELD))
                if (one_chance_in(++protection_count))
                    protection_targ = *mi;

            if (mi->speed_increment < 100 && !mi->cannot_act())
                if (one_chance_in(++fervor_count))
                    fervor_targ = *mi;
        }
    }

    if (protection_targ && (!fervor_targ || coinflip()))
    {
        flash_tile(protection_targ->pos(), YELLOW, 35);
        string msg = make_stringf(" blesses %s with protection!", protection_targ->name(DESC_THE).c_str());
        simple_god_message(msg.c_str());
        protection_targ->add_ench(mon_enchant(ENCH_DIVINE_SHIELD, &you, random_range(100, 150), random_range(4, 7)));
        if (party::is_enabled() && party::is_proxy_monster(*protection_targ))
        {
            party::heal_or_buff_party_member(party::proxy_slot(*protection_targ),
                                             0, DUR_DIVINE_SHIELD, 5, false);
        }
    }
    else if (fervor_targ)
    {
        flash_tile(fervor_targ->pos(), YELLOW, 35);
        string msg = make_stringf(" blesses %s with fervor!", fervor_targ->name(DESC_THE).c_str());
        simple_god_message(msg.c_str());

        fervor_targ->speed_increment += 30;
        queue_monster_for_action(fervor_targ);
        if (party::is_enabled() && party::is_proxy_monster(*fervor_targ))
        {
            party::heal_or_buff_party_member(party::proxy_slot(*fervor_targ),
                                             0, DUR_HASTE, 12, false);
        }
    }
    else if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot() || party::is_player_downed(i))
                continue;
            player &member = party::get_player(i);
            if (member.where_are_you == you.where_are_you
                && member.depth == you.depth
                && you.see_cell(member.pos()))
            {
                if (party::are_gods_concordant(GOD_SHINING_ONE, member.religion)
                    && !(member.holiness() & (MH_UNDEAD | MH_DEMONIC)))
                {
                    if (member.hp < member.hp_max && coinflip())
                    {
                        party::heal_or_buff_party_member(i, 0, DUR_DIVINE_SHIELD, 5, false);
                        simple_god_message(make_stringf(" blesses %s with protection!",
                                                        member.your_name.c_str()).c_str());
                    }
                    else
                    {
                        party::heal_or_buff_party_member(i, 0, DUR_HASTE, 12, false);
                        simple_god_message(make_stringf(" blesses %s with fervor!",
                                                        member.your_name.c_str()).c_str());
                    }
                    break;
                }

            }
        }
    }
}
