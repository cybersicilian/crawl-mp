/**
 * @file
 * @brief Functions for using some of the wackier inventory items.
**/

#include "AppHdr.h"
#include "coop-content.h"

#include "evoke.h"
#include "god-pakellas.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>

#include "act-iter.h"
#include "areas.h"
#include "artefact.h"
#include "art-enum.h"
#include "branch.h"
#include "chardump.h"
#include "cloud.h"
#include "coordit.h"
#include "delay.h"
#include "directn.h"
#include "dungeon.h"
#include "english.h"
#include "env.h"
#include "exercise.h"
#include "fight.h"
#include "fineff.h"
#include "god-abil.h"
#include "god-conduct.h"
#include "god-item.h"
#include "god-passive.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "item-use.h"
#include "level-state-type.h"
#include "libutil.h"
#include "los.h"
#include "losglobal.h"
#include "losparam.h"
#include "message.h"
#include "mgen-data.h"
#include "misc.h"
#include "mon-behv.h"
#include "mon-clone.h"
#include "mon-pick.h"
#include "mon-place.h"
#include "mutant-beast.h"
#include "nearby-danger.h" // i_feel_safe
#include "party.h"
#include "place.h"
#include "player.h"
#include "player-stats.h"
#include "prompt.h"
#include "religion.h"
#include "shout.h"
#include "skills.h"
#include "spl-book.h"
#include "spl-cast.h"
#include "spl-clouds.h"
#include "spl-damage.h"
#include "spl-monench.h" // FASTROOT_POWER_KEY
#include "spl-summoning.h"
#include "spl-util.h"
#include "state.h"
#include "stepdown.h"
#include "stringutil.h"
#include "tag-version.h"
#include "target.h"
#include "terrain.h"
#include "throw.h"
#ifdef USE_TILE
 #include "tilepick.h"
#endif
#include "transform.h"
#include "traps.h"
#include "unicode.h"
#include "view.h"

#define PHIAL_RANGE 5

static bool _evoke_horn_of_geryon(const evocation& activation)
{
    if (!player_summon_check(MONS_SIN_BEAST))
        return false;

    if (!activation.commit())
        return false;
    bool created = false;

    mprf(MSGCH_SOUND, "You produce a hideous howling noise!");
    noisy(15, you.pos()); // same as hell effect noise
    int num = 1;
    const int adjusted_power = you.skill(SK_EVOCATIONS, 10);
    if (adjusted_power + random2(90) > 130)
        ++num;
    if (adjusted_power + random2(90) > 180)
        ++num;
    if (adjusted_power + random2(90) > 230)
        ++num;
    for (int n = 0; n < num; ++n)
    {
        monster* mon;
        beh_type beh = BEH_HOSTILE;

        if (random2(adjusted_power) > 7)
            beh = BEH_FRIENDLY;
        mgen_data mg(MONS_SIN_BEAST, beh, you.pos(), MHITYOU, MG_AUTOFOE);
        mg.set_summoned(&you, SPELL_NO_SPELL, activation.duration(summ_dur(3)));
        mg.set_prox(PROX_CLOSE_TO_PLAYER);
        mon = create_monster(mg);
        if (mon)
            created = true;
    }
    if (!created)
        mpr("Nothing answers your call.");
    return true;
}

static int _lightning_rod_power()
{
    return 5 + you.skill(SK_EVOCATIONS, 3);
}

/**
 * Evoke a lightning rod, creating an arc of lightning that can be sustained
 * by continuing to evoke.
 *
 * @return  Whether anything happened.
 */
static bool _lightning_rod(dist *preselect, const evocation& activation)
{
    const spret ret = your_spells(SPELL_THUNDERBOLT, _lightning_rod_power(),
            false, nullptr, preselect, false, activation);

    if (ret == spret::abort)
        return false;

    return true;
}

/**
 * Returns the MP cost of zapping a wand, depending on the player's MP-powered wands
 * level and their available MP (or HP, if they're a djinn).
 */
int wand_mp_cost()
{
    const int cost = you.get_mutation_level(MUT_MP_WANDS) * 3;
    if (you.has_mutation(MUT_HP_CASTING))
        return min(you.hp - 1, cost);
    // Update mutation-data.h when updating this value.
    return min(you.magic_points, cost);
}

int wand_power(spell_type wand_spell, int skill_bonus)
{
    const int cap = spell_power_cap(wand_spell);
    if (cap == 0)
        return -1;
    const int mp_cost = wand_mp_cost();
    const int skill = min(27 * 7, you.skill(SK_EVOCATIONS, 7) + skill_bonus * 7);
    int pow = (15 + skill / 2) * (mp_cost + 9) / 9;
    if (you.unrand_equipped(UNRAND_GADGETEER))
        pow = pow * 130 / 100;
    return min(pow, cap);
}

static spret _evoke_wand(item_def& wand, dist* target, const evocation& activation)
{
    const int mp_cost = wand_mp_cost();
    const spell_type spell = spell_in_wand(static_cast<wand_type>(wand.sub_type));
    int power = wand_power(spell, activation.skill_bonus);
    if (activation.application_percent != 100 && (wand.sub_type == WAND_PARALYSIS
        || wand.sub_type == WAND_CHARMING || wand.sub_type == WAND_POLYMORPH))
    {
        power = min(spell_power_cap(spell), power * activation.application_percent / 100);
    }
    pay_mp(mp_cost);
    if (spell == SPELL_FASTROOT)
        you.props[FASTROOT_POWER_KEY] = power;
    const spret result = your_spells(spell, power, false, &wand, target, false, activation);
    if (result != spret::success)
    {
        refund_mp(mp_cost);
        if (result != spret::abort)
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            you.turn_is_over = true;
        }
        return result;
    }
    if (mp_cost)
    {
        stardust_orb_trigger(mp_cost);
        finalize_mp_cost();
    }
    if (!activation.externally_funded)
    {
        if ((you.wearing_ego(OBJ_GIZMOS, SPGIZMO_GADGETEER)
             || you.unrand_equipped(UNRAND_GADGETEER)) && x_chance_in_y(3, 10))
            mpr("You conserve a charge of your wand.");
        else
            --wand.charges;
    }
    return result;
}

void zap_wand(int slot, dist* target)
{
    if (!item_currently_evokable(slot == -1 ? nullptr : &you.inv[slot]))
        return;
    if (slot == -1)
        slot = prompt_invent_item("Zap which item?", menu_type::invlist, OBJ_WANDS, OPER_ZAP);
    if (prompt_failed(slot))
        return;
    if (you.inv[slot].base_type != OBJ_WANDS)
    {
        mpr("You can't zap that!");
        return;
    }
    evoke_device(you.inv[slot], target);
}

string manual_skill_names(bool short_text)
{
    skill_set skills;
    for (skill_type sk = SK_FIRST_SKILL; sk < NUM_SKILLS; sk++)
        if (you.skill_manual_points[sk])
            skills.insert(sk);

    if (short_text && skills.size() > 1)
        return make_stringf("%d skills", static_cast<int>(skills.size()));
    else
        return skill_names(skills);
}

static bool _box_of_beasts(const evocation& activation)
{
    // While some mutant beasts can fly, the game still refuses to place them
    // on top of water (since they can't fly until facets are fully generated).
    if (!player_summon_check(MONS_MUTANT_BEAST))
        return false;

    if (!activation.commit())
        return false;
    mpr("You open the lid...");

    // two rolls to reduce std deviation - +-6 so can get < max even at 27 sk
    int rnd_factor = random2(7);
    rnd_factor -= random2(7);
    const int hd_min = min(27, you.skill(SK_EVOCATIONS) + rnd_factor);
    const int tier = mutant_beast_tier(hd_min);
    ASSERT(tier < NUM_BEAST_TIERS);

    mgen_data mg(MONS_MUTANT_BEAST, BEH_FRIENDLY, you.pos(), MHITYOU,
                 MG_AUTOFOE);
    mg.set_summoned(&you, 0, activation.duration(summ_dur(3 + random2(3))));

    mg.hd = beast_tiers[tier];
    dprf("hd %d (min %d, tier %d)", mg.hd, hd_min, tier);
    const monster* mons = create_monster(mg);

    if (!mons)
    {
        // Failed to create monster for some reason
        mpr("...but nothing happens.");
        return true;
    }

    mprf("...and %s %s out!",
         mons->name(DESC_A).c_str(), mons->airborne() ? "flies" : "leaps");

    return true;
}

// Generate webs on hostile monsters and trap them.
static bool _place_webs()
{
    bool webbed = false;
    const int evo_skill = you.skill(SK_EVOCATIONS);
    // At 0 evo skill, this is about a 1/3 chance of webbing each
    // enemy. At 27 skill, it's about an 9/10 chance.
    const int web_chance = 36 + evo_skill * 2;
    const int max_range = LOS_DEFAULT_RANGE / 2 + 2;
    for (monster_near_iterator mi(you.pos(), LOS_SOLID); mi; ++mi)
    {
        if (you.pos().distance_from((*mi)->pos()) > max_range
            || (*mi)->friendly()
            || (*mi)->caught())
        {
            continue;
        }

        if (!x_chance_in_y(web_chance, 100))
            continue;

        mi->trap_in_web();
        webbed = true;
    }
    return webbed;
}

static const vector<pop_entry> pop_spiders =
{ // Sack of Spiders
  // tier zero :(
  {  0,  13,  200, FALL, MONS_SCORPION },
  // tier one
  {  0,  18,  100, PEAK, MONS_REDBACK },
  {  0,  18,  100, PEAK, MONS_CULICIVORA },
  // tier two
  {  6,  13,  100, RISE, MONS_JUMPING_SPIDER },
  { 14,  27,  100, FALL, MONS_JUMPING_SPIDER },
  {  6,  13,  100, RISE, MONS_TARANTELLA },
  { 14,  27,  100, FALL, MONS_TARANTELLA },
  // tier three
  { 13,  20,  100, RISE, MONS_WOLF_SPIDER },
  { 13,  20,  100, RISE, MONS_STEELBARB_WORM },
  { 21,  33,  100, FALL, MONS_WOLF_SPIDER },
  { 21,  33,  100, FALL, MONS_STEELBARB_WORM },
  // tier MAXX
  { 18,  27,  100, RISE, MONS_DEMONIC_CRAWLER },
  { 21,  27,  100, RISE, MONS_BROODMOTHER },
};

static bool _sack_of_spiders_veto_mon(monster_type mon)
{
   // Don't summon any beast that would anger your god.
    return god_hates_monster(mon);
}

static bool _spill_out_spiders(const evocation& activation)
{
    const int evo_skill = you.skill_rdiv(SK_EVOCATIONS);
    // 2 at min skill, 3-4 at mid, 4-6 at max
    const int min_pals = 2 + div_rand_round(2 * evo_skill, 27);
    const int max_buds = 2 + div_rand_round(4 * evo_skill, 27);
    const int n_mons = random_range(min_pals, max(min_pals, max_buds));
    bool made_mons = false;
    for (int n = 0; n < n_mons; n++)
    {
        // Invoke mon-pick with our custom list
        monster_type mon = pick_monster_from(pop_spiders, evo_skill,
                                             _sack_of_spiders_veto_mon);
        mgen_data mg(mon, BEH_FRIENDLY, you.pos(), MHITYOU, MG_AUTOFOE);
        mg.set_summoned(&you, 0, activation.duration(summ_dur(3 + random2(4))));
        if (create_monster(mg))
            made_mons = true;
    }
    return made_mons;
}

static bool _sack_of_spiders(const evocation& activation)
{
    if (!player_summon_check(MONS_REDBACK))
        return false;

    if (!activation.commit())
        return false;
    mpr("You reach into the sack...");

    const bool made_mons = _spill_out_spiders(activation);
    if (made_mons)
        mpr("...and things crawl out!");

    const bool webbed = _place_webs();
    if (!made_mons && !webbed)
    {
        mpr("...but nothing happens.");
        return true;
    }

    if (!made_mons)
        mpr("...but only cobwebs fall out.");
    return true;
}


static bool _make_zig(item_def &zig)
{
    if (feat_is_critical(env.grid(you.pos()))
        || player_in_branch(BRANCH_ARENA)
        || is_temp_terrain(you.pos()))
    {
        mpr("You can't place a gateway to a ziggurat here.");
        return false;
    }
    for (int lev = 1; lev <= brdepth[BRANCH_ZIGGURAT]; lev++)
    {
        if (is_level_on_stack(level_id(BRANCH_ZIGGURAT, lev))
            || you.where_are_you == BRANCH_ZIGGURAT)
        {
            mpr("Finish your current ziggurat first!");
            return false;
        }
    }

    ASSERT(in_inventory(zig));
    dec_inv_item_quantity(zig.link, 1);
    dungeon_terrain_changed(you.pos(), DNGN_ENTER_ZIGGURAT);
    mpr("You set the figurine down, and a mystic portal to a ziggurat forms.");
    return true;
}

static int _gale_push_dist(const actor* agent, const actor* victim, int pow)
{
    int dist = 1 + random2(pow / 20);

    if (victim->body_size(PSIZE_BODY) < SIZE_MEDIUM)
        dist++;
    else if (victim->body_size(PSIZE_BODY) > SIZE_LARGE)
        dist /= 2;
    else if (victim->body_size(PSIZE_BODY) > SIZE_MEDIUM)
        dist -= 1;

    int range = victim->pos().distance_from(agent->pos());
    if (range > 5)
        dist -= 2;
    else if (range > 2)
        dist--;

    if (dist < 0)
        return 0;
    else
        return dist;
}

static double _angle_between(coord_def origin, coord_def p1, coord_def p2)
{
    double ang0 = atan2(p1.x - origin.x, p1.y - origin.y);
    double ang  = atan2(p2.x - origin.x, p2.y - origin.y);
    return min(fabs(ang - ang0), fabs(ang - ang0 + 2 * PI));
}

void wind_blast(actor* agent, int pow, coord_def target)
{
    vector<actor *> act_list;

    int radius = min(5, 4 + div_rand_round(pow, 60));

    for (actor_near_iterator ai(agent->pos(), LOS_SOLID); ai; ++ai)
    {
        if (ai->pos().distance_from(agent->pos()) > radius
            || ai->pos() == agent->pos() // so it's never aimed_at_feet
            || !target.origin()
               && _angle_between(agent->pos(), target, ai->pos()) > PI/4.0)
        {
            continue;
        }

        act_list.push_back(*ai);
    }

    far_to_near_sorter sorter = {agent->pos()};
    sort(act_list.begin(), act_list.end(), sorter);

    bolt wind_beam = bolt::path_tracer(agent->pos(), coord_def());

    if (agent->is_player())
    {
        // Nemelex card only.
        if (pow > 120)
            mpr("A mighty gale blasts forth from the card!");
        else
            mpr("A fierce wind blows from the card.");
    }

    noisy(8, agent->pos());

    for (actor *act : act_list)
    {
        // May have died to a previous collision.
        if (act->alive())
        {
            const int push = _gale_push_dist(agent, act, pow);
            act->knockback(*agent, push, default_collision_damage(pow, true).roll(),
                           "gust of wind");
        }
    }

    // Now move clouds
    vector<coord_def> cloud_list;
    for (distance_iterator di(agent->pos(), true, false, radius + 2); di; ++di)
    {
        if (cloud_at(*di)
            && cell_see_cell(agent->pos(), *di, LOS_SOLID)
            && (target.origin()
                || _angle_between(agent->pos(), target, *di) <= PI/4.0))
        {
            cloud_list.push_back(*di);
        }
    }

    for (int i = cloud_list.size() - 1; i >= 0; --i)
    {
        wind_beam.target = cloud_list[i];
        wind_beam.fire();

        int dist = cloud_list[i].distance_from(agent->pos());
        int push = (dist > 5 ? 2 : dist > 2 ? 3 : 4);

        if (dist == 0 && agent->is_player())
        {
            delete_cloud(agent->pos());
            break;
        }

        for (int j = 0; j < (int)wind_beam.path_taken.size() - 1 && push; ++j)
        {
            if (wind_beam.path_taken[j] == cloud_list[i])
            {
                coord_def newpos = wind_beam.path_taken[j+1];
                if (!cell_is_solid(newpos)
                    && !cloud_at(newpos))
                {
                    swap_clouds(newpos, wind_beam.path_taken[j]);
                    --push;
                }
                else //Try to find an alternate route to push
                {
                    for (distance_iterator di(wind_beam.path_taken[j],
                         false, true, 1); di; ++di)
                    {
                        if (di->distance_from(agent->pos())
                                == newpos.distance_from(agent->pos())
                            && *di != agent->pos() // never aimed_at_feet
                            && !cell_is_solid(*di)
                            && !cloud_at(*di))
                        {
                            swap_clouds(*di, wind_beam.path_taken[j]);
                            --push;
                            wind_beam.target = *di;
                            wind_beam.fire();
                            j--;
                            break;
                        }
                    }
                }
            }
        }
    }
}

static int _phial_power()
{
    return 10 + you.skill(SK_EVOCATIONS, 4);
}

static bool _phial_of_floods(dist *target, const evocation& activation)
{
    dist target_local;
    if (!target)
        target = &target_local;
    bolt beam;

    const int power = _phial_power();
    beam.damage_percent = activation.damage_percent;
    zappy(ZAP_PRIMAL_WAVE, power, false, beam);
    beam.range = PHIAL_RANGE;
    beam.aimed_at_spot = true;

    // TODO: this needs a custom targeter
    direction_chooser_args args;
    args.mode = TARG_HOSTILE;
    args.top_prompt = "Aim the phial where?";

    unique_ptr<targeter> hitfunc = find_spell_targeter(SPELL_PRIMAL_WAVE,
            power, beam.range);
    targeter_beam* beamfunc = dynamic_cast<targeter_beam*>(hitfunc.get());
    if (beamfunc && beamfunc->beam.hit > 0)
    {
        args.get_desc_func = bind(desc_beam_hit_chance, placeholders::_1,
            hitfunc.get());
    }

    if (spell_direction(*target, beam, &args)
        && player_tracer(ZAP_PRIMAL_WAVE, power, beam))
    {
        if (!activation.commit())
            return false;
        zappy(ZAP_PRIMAL_WAVE, power, false, beam);
        beam.damage_percent = activation.damage_percent;
        beam.fire();
        return true;
    }

    return false;
}

bool mirror_can_effect(monster *victim)
{
    // Mirrored monsters (including by Mara, rakshasas) can still be
    // re-reflected.
    return actor_is_illusion_cloneable(victim)
        || victim->has_ench(ENCH_PHANTOM_MIRROR);
}

static spret _phantom_mirror(dist *target, const evocation& activation)
{
    bolt beam;
    monster* victim = nullptr;
    dist target_local;
    if (!target)
        target = &target_local;

    targeter_phantom_mirror tgt(&you);

    direction_chooser_args args;
    args.restricts = DIR_TARGET;
    args.needs_path = false;
    args.self = confirm_prompt_type::cancel;
    args.top_prompt = "Aiming: <white>Phantom Mirror</white>";
    args.hitfunc = &tgt;
    if (!spell_direction(*target, beam, &args))
        return spret::abort;
    victim = monster_at(beam.target);

    monster_info mi(victim);
    habitat_type habitat = mons_habitat(*victim);
    monclass_flags_t mf = M_NO_FLAGS;
    if (mi.airborne())
        mf |= M_FLIES;

    // XXX: Can't do this with player_summon_prompt since we're summoning a
    //      monster who may have gear that lets them use different habitats
    //      than their base type.
    if (!you_can_see_habitable_spot_near(victim->pos(), habitat, 1))
    {
        canned_msg(MSG_NO_AVAILABLE_SPACE);
        return spret::abort;
    }
    if (stop_summoning_prompt(mi.mresists, mf))
        return spret::abort;

    if (!activation.commit())
        return spret::abort;
    monster* mon = clone_mons(victim, true, nullptr, ATT_FRIENDLY);
    if (!mon)
    {
        canned_msg(MSG_NOTHING_HAPPENS);
        return spret::fail;
    }
    const int power = 5 + you.skill(SK_EVOCATIONS, 3);
    int dur = min(6, max(1, (you.skill(SK_EVOCATIONS, 1) / 4 + 1)
                         * (100 - victim->check_willpower(&you, power)) / 100));

    mon->mark_summoned(SPELL_PHANTOM_MIRROR, activation.duration(summ_dur(dur)), true, true);

    mon->summoner = you.mid;
    mons_add_blame(mon, "mirrored by the player character");
    mon->add_ench(ENCH_PHANTOM_MIRROR);
    mon->add_ench(mon_enchant(ENCH_DRAINED, &you, INFINITE_DURATION,
                              div_rand_round(mon->get_experience_level(), 3)));

    mon->behaviour = BEH_SEEK;
    set_nearest_monster_foe(mon);

    // If the original monster was unrewarding, and these flags are copied, the
    // mirrored copy will not properly count as summoned for some purposes.
    mon->flags &= ~(MF_HARD_RESET | MF_NO_REWARD);

    mprf("You reflect %s with the mirror!",
         victim->name(DESC_THE).c_str());

    return spret::success;
}

static bool _valid_tremorstone_target(const monster &m)
{
    return !m.is_firewood();
}

/**
 * Find the cell at range 3 closest to the center of mass of monsters in range,
 * or a random range 3 cell if there are none.
 *
 * @param see_targets a boolean parameter indicating if the user can see any of
 * the targets
 * @return The cell in question.
 */
static coord_def _find_tremorstone_target(bool& see_targets)
{
    coord_def com = {0, 0};
    see_targets = false;
    int num = 0;

    for (radius_iterator ri(you.pos(), LOS_NO_TRANS); ri; ++ri)
    {
        if (monster_at(*ri) && _valid_tremorstone_target(*monster_at(*ri)))
        {
            com += *ri;
            see_targets = see_targets || you.can_see(*monster_at(*ri));
            ++num;
        }
    }

    coord_def target = {0, 0};
    int distance = LOS_RADIUS * num;
    int ties = 0;

    for (radius_iterator ri(you.pos(), 3, C_SQUARE, LOS_NO_TRANS, true); ri; ++ri)
    {
        if (ri->distance_from(you.pos()) != 3 || cell_is_invalid_target(*ri))
            continue;

        if (num > 0)
        {
            if (com.distance_from((*ri) * num) < distance)
            {
                ties = 1;
                target = *ri;
                distance = com.distance_from((*ri) * num);
            }
            else if (com.distance_from((*ri) * num) == distance
                     && one_chance_in(++ties))
            {
                target = *ri;
            }
        }
        else if (one_chance_in(++ties))
            target = *ri;
    }

    // It's possible to not find any targets at radius 3 if e.g. we're in fog.
    if (!target.origin())
        return target;

    // Be very careless for this rare case.
    for (radius_iterator ri(you.pos(), 2, C_SQUARE, LOS_NO_TRANS, true); ri; ++ri)
    {
        if (ri->distance_from(you.pos()) == 2
            && !cell_is_invalid_target(*ri)
            && one_chance_in(++ties))
        {
            target = *ri;
        }
    }

    if (!target.origin())
        return target;

    for (adjacent_iterator ai(you.pos()); ai; ++ai)
        if (!cell_is_invalid_target(*ai) && one_chance_in(++ties))
            target = *ai;
    return target;
}

/**
 * Find an adjacent tile for a tremorstone explosion to go off in.
 *
 * @param center    The original target of the stone.
 * @return          The new, final origin of the stone's explosion.
 */
static coord_def _fuzz_tremorstone_target(coord_def center)
{
    coord_def chosen = center;
    int seen = 1;
    for (adjacent_iterator ai(center); ai; ++ai)
        if (!cell_is_invalid_target(*ai) && one_chance_in(++seen))
            chosen = *ai;
    return chosen;
}

static int _tremorstone_power()
{
    return 15 + you.skill(SK_EVOCATIONS);
}

/**
 * Number of explosions, scales up from 1 at 0 evo to 6 at 27 evo,
 * via a stepdown.
 *
 * Currently pow is just evo + 15, but the abstraction is kept around in
 * case an evocable enhancer returns to the game so that 0 evo with enhancer
 * gets some amount of enhancement.
 */
int tremorstone_count(int pow)
{
    return 1 + stepdown((pow - 15) / 3, 2, ROUND_CLOSE);
}

/**
 * Evokes a tremorstone, blasting something in the general area of a
 * chosen target.
 *
 * @return          spret::abort if the player cancels, spret::fail if they
 *                  try to evoke but fail, and spret::success otherwise.
 */
static spret _tremorstone(const evocation& activation)
{
    bool see_target;
    const coord_def center = _find_tremorstone_target(see_target);

    targeter_radius hitfunc(&you, LOS_NO_TRANS);
    auto vulnerable = [](const actor *act) -> bool
    {
        return act && _valid_tremorstone_target(*act->as_monster());
    };
    if ((!see_target
        && !yesno("You can't see anything, release a tremorstone anyway?",
                 true, 'n'))
        || stop_attack_prompt(hitfunc, "release a tremorstone", vulnerable))
    {
        return spret::abort;
    }

    if (!activation.commit())
        return spret::abort;
    const int power = _tremorstone_power();

    bolt beam;
    beam.damage_percent = activation.damage_percent;
    beam.source_id  = you.mid;
    beam.thrower    = KILL_YOU;
    zappy(ZAP_TREMORSTONE, power, false, beam);
    beam.ex_size = 2;
    beam.target = center;

    mpr("The tremorstone explodes into fragments!");

    const int num_explosions = tremorstone_count(power);
    for (int i = 0; i < num_explosions; i++)
    {
        bolt explosion = beam;
        explosion.target = _fuzz_tremorstone_target(center);
        explosion.explode(i == num_explosions - 1);
    }

    return spret::success;
}

static const vector<random_pick_entry<cloud_type>> condenser_clouds =
{
  { 0,   50, 200, FALL, CLOUD_MEPHITIC },
  { 0,  100, 125, PEAK, CLOUD_FIRE },
  { 0,  100, 125, PEAK, CLOUD_COLD },
  { 0,  100, 125, PEAK, CLOUD_POISON },
  { 0,  110, 50, RISE, CLOUD_MISERY },
  { 0,  110, 50, RISE, CLOUD_STORM },
  { 0,  110, 50, RISE, CLOUD_ACID },
};

static spret _condenser(const evocation& activation)
{
    const int pow = 15 + you.skill(SK_EVOCATIONS, 7) / 2;

    random_picker<cloud_type, NUM_CLOUD_TYPES> cloud_picker;

    set<coord_def> target_cells;
    bool see_targets = false;

    for (radius_iterator di(you.pos(), LOS_NO_TRANS); di; ++di)
    {
        monster *mons = monster_at(*di);

        if (!mons || mons->wont_attack() || !mons_is_threatening(*mons))
            continue;

        if (you.can_see(*mons))
            see_targets = true;

        for (adjacent_iterator ai(mons->pos(), false); ai; ++ai)
        {
            if (cell_is_solid(*ai) || !you.see_cell(*ai) || cloud_at(*ai))
                continue;
            const actor *act = actor_at(*ai);
            if (!act || !act->wont_attack())
                target_cells.insert(*ai);
        }
    }

    if (!see_targets
        && !yesno("You can't see anything. Try to condense clouds anyway?",
                  true, 'n'))
    {
        canned_msg(MSG_OK);
        return spret::abort;
    }

    if (target_cells.empty())
    {
        canned_msg(MSG_NOTHING_HAPPENS);
        return spret::fail;
    }

    if (!activation.commit())
        return spret::abort;
    vector<coord_def> target_list;
    for (coord_def t : target_cells)
        target_list.push_back(t);
    shuffle_array(target_list);
    bool did_something = false;

    for (auto p : target_list)
    {
        cloud_type cloud = cloud_picker.pick(condenser_clouds, pow, CLOUD_NONE);

        // Reroll misery clouds until we get something our god is okay with
        while (is_good_god(you.religion) && cloud == CLOUD_MISERY)
            cloud = cloud_picker.pick(condenser_clouds, pow, CLOUD_NONE);

        // Get at least one cloud, even at 0 power.
        if (did_something && !x_chance_in_y(50 + pow, 160))
            continue;

        const int cloud_power = 5
            + random2avg(12 + div_rand_round(pow * 3, 4), 3);
        place_cloud(cloud, p, activation.duration(cloud_power), &you);
        did_something = true;
    }

    if (did_something)
        mpr("Clouds condense from the air!");

    return spret::success;
}

static int _gravitambourine_power()
{
    return 15 + you.skill(SK_EVOCATIONS, 7) / 2;
}

static bool _gravitambourine(dist *target, const evocation& activation)
{
    const spret ret = your_spells(SPELL_GRAVITAS, _gravitambourine_power(),
            false, nullptr, target, false, activation);

    if (ret == spret::abort)
        return false;

    return true;
}

/// Does the item only serve to produce summons or allies?
static bool _evoke_ally_only(const item_def &item, bool ident)
{
    if (item.base_type == OBJ_WANDS && ident)
        return item.sub_type == WAND_CHARMING;
    else if (item.base_type == OBJ_MISCELLANY)
    {
        switch (item.sub_type)
        {
        case MISC_PHANTOM_MIRROR:
        case MISC_HORN_OF_GERYON:
        case MISC_BOX_OF_BEASTS:
        case MISC_SACK_OF_SPIDERS:
            return true;
        default:
            return false;
        }
    }
    return false;
}

static bool _centipede_bauble(item_def& item)
{
    const int skill = you.skill(SK_SHAPESHIFTING, 10);

    int index = items(false, OBJ_WEAPONS, WPN_CENTIPEDE, 0);

    // Let's be real; this isn't going to happen.
    if (index == NON_ITEM)
        return false;

    item_def& wpn = env.item[index];
    wpn.props[ATTACKS_REMAINING_KEY] = random_range(20, 25);
    wpn.plus = min(9, div_rand_round(max(0, skill - 40), 10));
    wpn.flags = ISFLAG_SUMMONED | ISFLAG_IDENTIFIED;

    if (!room_in_inventory(wpn))
    {
        mpr("You don't have enough room in your inventory!");
        destroy_item(index);
        return false;
    }

    if (!try_equip_item(wpn, true))
    {
        destroy_item(index);
        return false;
    }

    dec_mitm_item_quantity(index, 1);
    dec_inv_item_quantity(item.link, 1);

    return true;
}

string cannot_evoke_item_reason(const item_def *item, bool temp, bool ident,
                                bool *god_forbids, bool allow_empty)
{
    if (god_forbids)
        *god_forbids = false;
    // id is not at issue here
    if (temp && you.berserk())
        return "You are too berserk!";

    if (temp && you.confused())
        return "You are too confused!";

    // all generic checks passed
    if (!item)
        return "";

    if (item->is_type(OBJ_MISCELLANY, MISC_ANCIENT_CRATE))
        return "The crate opens after its owner's tome has been studied.";
    if (item->is_type(OBJ_MISCELLANY, MISC_DUSTY_TOME))
        return "Its owner can decipher the tome at experience level 3.";

    // historically allowed under confusion/berserk, but why?
    if (item->is_type(OBJ_MISCELLANY, MISC_ZIGGURAT))
    {
        // override sac artifice for zigfigs, including a general check
        // TODO: zigfig has some terrain/level constraints that aren't handled
        // here
        return "";
    }

    // Your god won't let you evoke items they forbid.
    if (god_forbids_item(*item, temp))
    {
        if (god_forbids)
            *god_forbids = true;
        return make_stringf("%s forbids the use of this item.",
                            uppercase_first(god_name(you.religion)).c_str());
    }

    if (item->base_type == OBJ_BAUBLES)
    {
        if (you.form == transformation::flux && temp && item->sub_type == BAUBLE_FLUX)
            return "you are already filled with unstable energy.";

        if (item->sub_type == BAUBLE_CENTIPEDE)
        {
            if (temp && you.skill(SK_SHAPESHIFTING) < CENTIPEDE_BAUBLE_MINSKILL)
            {
                return make_stringf("you need at least %s shapeshifting skill to use this effectively.",
                                    to_string(CENTIPEDE_BAUBLE_MINSKILL).c_str());
            }

            item_def dummy;
            dummy.base_type = OBJ_WEAPONS;
            dummy.sub_type = WPN_CENTIPEDE;
            string reason;
            if (!can_equip_item(dummy, temp, &reason))
                return reason;
            if (you.allies_forbidden())
                return "allies are forbidden to you.";
        }

        // XXX: Centipede bauble isn't actually changing you into flux form, of course,
        //      but the same form-changing limitations apply.
        const string form_unreason = cant_transform_reason(transformation::flux, false, temp);
        if (!form_unreason.empty())
            return lowercase_first(form_unreason);
        return "";
    }

    if (you.get_mutation_level(MUT_NO_ARTIFICE))
        return "You cannot evoke magical items.";

    // is this really necessary?
    if (!coop_content::enabled()
        && coop_content::exclusive_item(item->base_type, item->sub_type))
    {
        return "This device requires a multiplayer game.";
    }

    if (item_type_removed(item->base_type, item->sub_type))
        return "Sorry, this item was removed!";
    if (item->base_type != OBJ_WANDS && item->base_type != OBJ_MISCELLANY)
        return "You can't evoke that!";

#if TAG_MAJOR_VERSION == 34
    if (!allow_empty && is_known_empty_wand(*item))
        return "This wand has no charges.";
#endif

    if (_evoke_ally_only(*item, ident) && you.allies_forbidden())
        return "That item cannot be used by those who cannot gain allies!";

    if (temp
        && item->base_type == OBJ_MISCELLANY
        && item->sub_type == MISC_CONDENSER_VANE
        && (env.level_state & LSTATE_STILL_WINDS))
    {
        return "The air is too still for clouds to form.";
    }

    if (temp
        && item->base_type == OBJ_MISCELLANY
        && (item->sub_type == MISC_HORN_OF_GERYON
            || item->sub_type == MISC_SKALD_HORN)
        && you.is_silenced())
    {
        return "You can't produce a sound!";
    }

    if (temp
        && item->base_type == OBJ_MISCELLANY
        && (item->sub_type == MISC_AEGIS_STANDARD
            || item->sub_type == MISC_ASTRAL_BEACON
            || item->sub_type == MISC_TWIN_SPARK_CONDUIT))
    {
        if (!party::is_enabled())
            return "You have no party members to attune with.";

        bool has_ally_in_los = false;
        bool has_ghost_in_los = false;
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            if (slot == party::active_slot())
                continue;
            const player &ally = party::get_player(slot);
            if (ally.depth != you.depth || ally.where_are_you != you.where_are_you)
                continue;
            if (party::is_player_downed(slot))
            {
                const monster *ghost = party::get_proxy_monster(slot);
                if (ghost && ghost->alive() && you.see_cell_no_trans(ghost->pos()))
                    has_ghost_in_los = true;
            }
            else if (you.see_cell_no_trans(ally.pos()))
                has_ally_in_los = true;
        }

        if (item->sub_type == MISC_ASTRAL_BEACON)
        {
            if (!has_ally_in_los && !has_ghost_in_los)
                return "There are no companions or fallen souls in sight.";
        }
        else if (!has_ally_in_los)
        {
            return "There are no living companions in sight.";
        }
    }

    if (temp && !allow_empty && is_xp_evoker(*item) && evoker_charges(item->sub_type) <= 0)
    {
        // DESC_THE prints "The tin of tremorstones (inert) is presently inert."
        return make_stringf("The %s is presently inert.",
                                            item->name(DESC_DBNAME).c_str());
    }

    return "";
}

bool item_currently_evokable(const item_def *item)
{
    bool god_forbids = false;
    const string err = cannot_evoke_item_reason(item, true, true, &god_forbids);
    if (!err.empty())
        mprf(god_forbids ? MSGCH_GOD : MSGCH_PLAIN, "%s", err.c_str());
    return err.empty();
}

bool item_ever_evokable(const item_def &item)
{
    return cannot_evoke_item_reason(&item, false).empty();
}

static spret _evoke_aegis_standard(int plus, const evocation& activation)
{
    if (!activation.commit())
        return spret::abort;
    const int pow = 15 + you.skill(SK_EVOCATIONS, 4) + plus * 6;
    const int dur_turns = 8 + random2avg(pow / 6, 2);
    const int ac_bonus = 4 + you.skill_rdiv(SK_EVOCATIONS, 1, 4) + plus + activation.ward_bonus;
    const int sh_bonus = 4 + you.skill_rdiv(SK_EVOCATIONS, 1, 4) + plus + activation.ward_bonus;
    const int caster_slot = party::active_slot();

    mprf("You plant the aegis standard! A golden phalanx ward washes over your party!");
    noisy(10, you.pos());
    draw_ring_animation(you.pos(), LOS_DEFAULT_RANGE, YELLOW, LIGHTCYAN, true, 25);

    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (party::is_player_downed(slot))
            continue;

        player &p = party::get_player(slot);
        if (p.depth != you.depth || p.where_are_you != you.where_are_you)
            continue;
        if (slot != caster_slot && !you.see_cell_no_trans(p.pos()))
            continue;

        {
            party::scoped_player_context ctx(slot);
            you.increase_duration(DUR_PHALANX_BARRIER, dur_turns, 50);
            you.increase_duration(DUR_ENLIGHTENED, dur_turns, 50);
            you.props[PHALANX_BARRIER_POWER_KEY] = ac_bonus * 100;
            you.props[AEGIS_SH_BONUS_KEY] = sh_bonus;
            if (slot != caster_slot)
                you.props[AEGIS_ANCHOR_SLOT_KEY] = caster_slot;
            else
                you.props.erase(AEGIS_ANCHOR_SLOT_KEY);

            you.redraw_armour_class = true;
            you.redraw_evasion = true;
        }

        if (slot != caster_slot)
        {
            if (monster *proxy = party::get_proxy_monster(slot))
            {
                proxy->add_ench(mon_enchant(ENCH_RESISTANCE, &you,
                                            dur_turns * BASELINE_DELAY, 1));
            }
            mprf(MSGCH_FRIEND_ACTION,
                 "%s is shielded by your aegis (+%d AC, +%d SH, Will+)!",
                 p.your_name.c_str(), ac_bonus, sh_bonus);
        }
    }

    return spret::success;
}

static spret _evoke_astral_beacon(int plus, const evocation& activation)
{
    const int caster_slot = party::active_slot();
    const int pow = 20 + you.skill(SK_EVOCATIONS, 4) + plus * 8;

    // 1. Check for a downed teammate's ghost in LOS first (highest priority).
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (slot == caster_slot || !party::is_player_downed(slot))
            continue;

        monster *ghost = party::get_proxy_monster(slot);
        coord_def ghost_pos = ghost && ghost->alive() ? ghost->pos()
                                                      : party::get_player(slot).pos();
        if (!you.see_cell_no_trans(ghost_pos))
            continue;

        if (!activation.commit())
            return spret::abort;
        mprf(MSGCH_FRIEND_ACTION,
             "You hold aloft the astral beacon! Starlight anchors %s's soul!",
             party::get_player(slot).your_name.c_str());
        noisy(12, you.pos());
        flash_tile(ghost_pos, LIGHTCYAN, 60);

        party::set_player_downed(slot, false);

        coord_def revive_pos = ghost_pos;
        for (adjacent_iterator ai(you.pos()); ai; ++ai)
        {
            if (in_bounds(*ai) && !actor_at(*ai)
                && monster_habitable_grid(MONS_HUMAN, *ai))
            {
                revive_pos = *ai;
                break;
            }
        }

        const int hp_pct = min(activation.revival_hp_cap, 25 + you.skill_rdiv(SK_EVOCATIONS, 25, 27) + plus * 3 + activation.revival_hp_bonus);
        {
            party::scoped_player_context ctx(slot);
            you.set_position(revive_pos);
            you.hp_max_adj_temp = max(you.hp_max_adj_temp - max(1, you.hp_max / 5),
                                      -(you.hp_max * 2 / 5));
            calc_hp();
            you.hp = max(1, you.hp_max * hp_pct / 100);
            you.magic_points = max(you.magic_points, you.max_magic_points / 2);
            you.duration[DUR_CONF] = 0;
            you.duration[DUR_SLOW] = 0;
            you.duration[DUR_POISONING] = 0;
            you.increase_duration(DUR_DIVINE_SHIELD, 5 + plus, 10);
            you.redraw_hit_points = true;
            you.redraw_magic_points = true;
        }

        mprf(MSGCH_RECOVERY,
             "%s returns to life beside you (%d/%d HP)!",
             party::get_player(slot).your_name.c_str(),
             party::get_player(slot).hp,
             party::get_player(slot).hp_max);
        return spret::success;
    }

    // 2. Otherwise, heal, restore MP, cleanse, and tether endangered living allies in LOS.
    if (!activation.commit())
        return spret::abort;
    mprf("You raise the astral beacon! Soothing starlight washes over your companions!");
    noisy(8, you.pos());

    const int heal_base = activation.damage(12 + roll_dice(2, pow / 5));
    const int mp_restore = 4 + you.skill_rdiv(SK_EVOCATIONS, 1, 3) + plus;

    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (slot == caster_slot || party::is_player_downed(slot))
            continue;

        player &ally = party::get_player(slot);
        if (ally.depth != you.depth || ally.where_are_you != you.where_are_you)
            continue;
        if (!you.see_cell_no_trans(ally.pos()))
            continue;

        const bool endangered = (ally.hp <= ally.hp_max * 30 / 100)
                                && grid_distance(you.pos(), ally.pos()) > 1
                                && !ally.no_tele(true, true);

        party::heal_or_buff_party_member(slot, heal_base, DUR_REGENERATION,
                                         5 + plus * 2, true);

        {
            party::scoped_player_context ctx(slot);
            inc_mp(mp_restore, true);
            you.redraw_magic_points = true;

            if (endangered)
            {
                for (adjacent_iterator ai(party::get_player(caster_slot).pos()); ai; ++ai)
                {
                    if (in_bounds(*ai) && !actor_at(*ai)
                        && monster_habitable_grid(MONS_HUMAN, *ai))
                    {
                        you.set_position(*ai);
                        break;
                    }
                }
            }
        }

        if (endangered)
        {
            mprf(MSGCH_FRIEND_ACTION,
                 "The astral beacon pulls %s to safety beside you!",
                 ally.your_name.c_str());
        }
    }

    inc_hp(max(1, heal_base / 2));
    return spret::success;
}

static spret _evoke_twin_spark_conduit(int plus, const evocation& activation)
{
    const int pow = 20 + you.skill(SK_EVOCATIONS, 4) + plus * 7;
    const dice_def dmg_dice(3, 7 + pow / 6);

    vector<coord_def> nodes;
    nodes.push_back(you.pos());

    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (slot == party::active_slot() || party::is_player_downed(slot))
            continue;
        const player &ally = party::get_player(slot);
        if (ally.depth == you.depth
            && ally.where_are_you == you.where_are_you
            && you.see_cell_no_trans(ally.pos()))
        {
            nodes.push_back(ally.pos());
        }
    }

    if (nodes.size() < 2)
    {
        mpr("The conduit hums, but finds no companion in sight to complete the circuit.");
        return spret::abort;
    }

    if (!activation.commit())
        return spret::abort;
    mprf("Resonant lightning arcs between you and your %s!",
         nodes.size() > 2 ? "companions" : "companion");
    noisy(15, you.pos());

    set<coord_def> arc_cells;
    for (size_t i = 0; i < nodes.size(); ++i)
    {
        for (adjacent_iterator ai(nodes[i]); ai; ++ai)
            if (in_bounds(*ai) && !cell_is_solid(*ai))
                arc_cells.insert(*ai);

        for (size_t j = i + 1; j < nodes.size(); ++j)
        {
            ray_def ray;
            if (!find_ray(nodes[i], nodes[j], ray, opc_solid_see))
                continue;
            while (ray.advance())
            {
                const coord_def p = ray.pos();
                if (!in_bounds(p) || cell_is_solid(p))
                    break;
                arc_cells.insert(p);
                if (p == nodes[j])
                    break;
            }
        }
    }

    for (const coord_def &np : nodes)
        arc_cells.erase(np);

    for (const coord_def &p : arc_cells)
    {
        if (you.see_cell(p))
            flash_tile(p, LIGHTBLUE, 15);

        monster *mon = monster_at(p);
        if (!mon || !mon->alive() || mon->wont_attack() || party::is_proxy_monster(*mon))
            continue;

        const int raw_dmg = activation.damage(dmg_dice.roll());
        const int hurt_dmg = resist_adjust_damage(mon, BEAM_ELECTRICITY, raw_dmg);
        mprf("%s is caught in the twin-spark arc%s",
              mon->name(DESC_THE).c_str(),
              attack_strength_punctuation(hurt_dmg).c_str());

        if (hurt_dmg > 0)
        {
            mon->hurt(&you, hurt_dmg, BEAM_ELECTRICITY);
            if (mon->alive())
            {
                you.expose_to_element(BEAM_ELECTRICITY, 2);
                if (x_chance_in_y(pow, 100))
                    mon->corrode(&you);
                if (x_chance_in_y(pow + 20, 100))
                {
                    mon->add_ench(mon_enchant(ENCH_BLIND, &you,
                                              random_range(4, 8) * BASELINE_DELAY, 1));
                }
            }
        }
    }

    return spret::success;
}

static spret _evoke_skald_horn(int plus, const evocation& activation)
{
    if (you.is_silenced())
    {
        mpr("You can't produce a sound!");
        return spret::abort;
    }

    const int pow = 20 + you.skill(SK_EVOCATIONS, 4) + plus * 7;
    const int dur = activation.duration(6 + plus * 2 + you.skill_rdiv(SK_EVOCATIONS, 1, 3));
    const dice_def dmg_dice(2, 6 + pow / 6);

    if (!activation.commit())
        return spret::abort;
    mpr("You sound the horn of the Vanguard! A brassy shockwave rings across the battlefield!");
    noisy(18, you.pos());

    for (adjacent_iterator ai(you.pos()); ai; ++ai)
    {
        if (!in_bounds(*ai) || cell_is_solid(*ai))
            continue;
        flash_tile(*ai, YELLOW, 20);
        monster *mon = monster_at(*ai);
        if (!mon || !mon->alive() || mon->wont_attack() || party::is_proxy_monster(*mon))
            continue;

        const int dmg = resist_adjust_damage(mon, BEAM_THUNDER, activation.damage(dmg_dice.roll()));
        if (dmg > 0)
        {
            mprf("The horn's blast batters %s%s",
                 mon->name(DESC_THE).c_str(),
                 attack_strength_punctuation(dmg).c_str());
            mon->hurt(&you, dmg, BEAM_THUNDER);
        }
        if (mon->alive() && x_chance_in_y(pow + 25, 100))
        {
            mon->add_ench(mon_enchant(ENCH_DAZED, &you,
                                      random_range(3, 6) * BASELINE_DELAY, 1));
        }
    }

    you.increase_duration(DUR_BALLAD_VANGUARD, dur, 35);
    if (!you.stasis())
    {
        you.increase_duration(DUR_SWIFTNESS, dur, 35);
        you.attribute[ATTR_SWIFTNESS] = you.duration[DUR_SWIFTNESS];
    }

    if (party::is_enabled())
    {
        party::apply_party_aura_buff(DUR_BALLAD_VANGUARD, dur, LOS_RADIUS, false);
        party::apply_party_aura_buff(DUR_SWIFTNESS, dur, LOS_RADIUS, false);
        mprf(MSGCH_FRIEND_ACTION,
             "Your companions take up the horn's call (Slay, EV, Swift)!");
    }

    return spret::success;
}

spret evoke_device(item_def& item, dist* target, const evocation& activation)
{
    if (!coop_content::enabled()
        && coop_content::exclusive_item(item.base_type, item.sub_type))
    {
        mpr("This device requires a multiplayer game.");
        return spret::abort;
    }

    const string blocked = cannot_evoke_item_reason(&item, true, true, nullptr,
                                                   activation.externally_funded);
    if (!blocked.empty())
    {
        mpr(blocked);
        return spret::abort;
    }
    spret result = spret::abort;
    const int subtype = item.sub_type;
    if (item.base_type == OBJ_WANDS)
        result = _evoke_wand(item, target, activation);
    else if (is_xp_evoker(item))
    {
        switch (subtype)
        {
        case MISC_PHIAL_OF_FLOODS:
            result = _phial_of_floods(target, activation) ? spret::success : spret::abort; break;
        case MISC_GRAVITAMBOURINE:
            result = _gravitambourine(target, activation) ? spret::success : spret::abort; break;
        case MISC_LIGHTNING_ROD:
            result = _lightning_rod(target, activation) ? spret::success : spret::abort; break;
        case MISC_BOX_OF_BEASTS:
            result = _box_of_beasts(activation) ? spret::success : spret::abort; break;
        case MISC_SACK_OF_SPIDERS:
            result = _sack_of_spiders(activation) ? spret::success : spret::abort; break;
        case MISC_HORN_OF_GERYON:
            result = _evoke_horn_of_geryon(activation) ? spret::success : spret::abort; break;
        case MISC_PHANTOM_MIRROR: result = _phantom_mirror(target, activation); break;
        case MISC_TIN_OF_TREMORSTONES: result = _tremorstone(activation); break;
        case MISC_CONDENSER_VANE: result = _condenser(activation); break;
        case MISC_AEGIS_STANDARD: result = _evoke_aegis_standard(evoker_plus(subtype), activation); break;
        case MISC_ASTRAL_BEACON: result = _evoke_astral_beacon(evoker_plus(subtype), activation); break;
        case MISC_TWIN_SPARK_CONDUIT: result = _evoke_twin_spark_conduit(evoker_plus(subtype), activation); break;
        case MISC_SKALD_HORN: result = _evoke_skald_horn(evoker_plus(subtype), activation); break;
        default: return spret::abort;
        }
        if (result == spret::success && !activation.externally_funded)
            expend_xp_evoker(subtype);
    }
    if (result == spret::abort || !activation.commit())
        return spret::abort;
    if (result == spret::fail && item.base_type == OBJ_WANDS && !activation.externally_funded)
        return result;
    const bool minor = item.base_type == OBJ_WANDS || subtype == MISC_BOX_OF_BEASTS
        || subtype == MISC_SACK_OF_SPIDERS || subtype == MISC_LIGHTNING_ROD
        || subtype == MISC_PHANTOM_MIRROR || subtype == MISC_TIN_OF_TREMORSTONES
        || subtype == MISC_CONDENSER_VANE;
    practise_evoking(minor ? 1 : 3);
    count_action(CACT_EVOKE, subtype, item.base_type);
    if (item.base_type == OBJ_WANDS && item.charges <= 0 && !pakellas::preserve_wand(item))
    {
        mpr("The now-empty wand crumbles to dust.");
        dec_inv_item_quantity(item.link, 1);
    }
    you.turn_is_over = true;
    return result;
}

bool evoke_item(item_def& item, dist *preselect)
{
    if (item.base_type == OBJ_WANDS || is_xp_evoker(item))
        return evoke_device(item, preselect) != spret::abort;
    if (!item_currently_evokable(&item))
        return false;

    bool did_work   = false;  // "Nothing happens" message
    bool unevokable = false;

    switch (item.base_type)
    {
    case OBJ_BAUBLES:
        switch (item.sub_type)
        {
            case BAUBLE_FLUX:
                if (!check_transform_into(transformation::flux, false))
                    return false;

                mprf("You crush the flux bauble in your %s and feel its energy "
                    "flooding your body.", you.hand_name(false).c_str());
                ASSERT(in_inventory(item));
                dec_inv_item_quantity(item.link, 1);
                transform(0, transformation::flux, true);
                you.props[FLUX_ENERGY_KEY] = 45;
                return true;

            case BAUBLE_CENTIPEDE:
                return _centipede_bauble(item);
        }

    case OBJ_MISCELLANY:
        ASSERT(in_inventory(item));
        did_work = true; // easier to do it this way for misc items

        switch (item.sub_type)
        {
#if TAG_MAJOR_VERSION == 34
        case MISC_BOTTLED_EFREET:
        case MISC_FAN_OF_GALES:
        case MISC_LAMP_OF_FIRE:
        case MISC_STONE_OF_TREMORS:
        case MISC_CRYSTAL_BALL_OF_ENERGY:
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
#endif

        case MISC_QUAD_DAMAGE:
            mpr("QUAD DAMAGE!");
            you.duration[DUR_QUAD_DAMAGE] = 30 * BASELINE_DELAY;
            ASSERT(in_inventory(item));
            dec_inv_item_quantity(item.link, 1);
            invalidate_agrid();
            break;

        case MISC_ZIGGURAT:
            // Don't set did_work to false, _make_zig handles the message.
            unevokable = !_make_zig(item);
            break;

        default:
            did_work = false;
            unevokable = true;
            break;
        }
        if (did_work && !unevokable)
            count_action(CACT_EVOKE, item.sub_type, OBJ_MISCELLANY);
        break;

    default:
        unevokable = true;
        break;
    }

    if (!did_work)
        canned_msg(MSG_NOTHING_HAPPENS);

    if (!unevokable)
        you.turn_is_over = true;
    else
        crawl_state.zero_turns_taken();

    return did_work;
}

/**
 * For the clua api, returns the description displayed if targeting a monster
 * with an evokable.
 *
 * @param mi     The targeted monster.
 * @param spell  The item being evoked.
 * @return       The displayed string.
 **/
string target_evoke_desc(const monster_info& mi, const item_def& item)
{
    spell_type spell;
    int power;
    int range;
    if (item.base_type == OBJ_WANDS)
    {
        spell = spell_in_wand(static_cast<wand_type>(item.sub_type));
        power = wand_power(spell);
        range = calc_spell_range(spell, power, false);
    }
    else if (item.base_type == OBJ_MISCELLANY
            && item.sub_type == MISC_PHIAL_OF_FLOODS)
    {
        spell = SPELL_PRIMAL_WAVE;
        range = PHIAL_RANGE;
        power = _phial_power();
    }
    else
        return "";

    unique_ptr<targeter> hitfunc = find_spell_targeter(spell, power, range);
    if (!hitfunc)
        return "";

    desc_filter addl_desc = targeter_addl_desc(spell, power,
                                get_spell_flags(spell), hitfunc.get());
    if (!addl_desc)
        return "";

    vector<string> d = addl_desc(mi);
    return comma_separated_line(d.begin(), d.end());
}

string evoke_damage_string(const item_def& item)
{
    if (item.base_type == OBJ_WANDS)
    {
        return spell_damage_string(
            spell_in_wand(static_cast<wand_type>(item.sub_type)), true);
    }
    else if (item.base_type == OBJ_MISCELLANY)
    {
        if (item.sub_type == MISC_PHIAL_OF_FLOODS)
        {
            return spell_damage_string(SPELL_PRIMAL_WAVE, true,
                _phial_power());
        }
        else if (item.sub_type == MISC_LIGHTNING_ROD)
        {
            return spell_damage_string(SPELL_THUNDERBOLT, true,
                _lightning_rod_power());
        }
        else if (item.sub_type == MISC_TIN_OF_TREMORSTONES)
        {
            return spell_damage_string(SPELL_TREMORSTONE, true,
                _tremorstone_power());
        }
        else if (item.sub_type == MISC_GRAVITAMBOURINE)
        {
            return spell_damage_string(SPELL_GRAVITAS, true,
                _gravitambourine_power());
        }
        else if (item.sub_type == MISC_TWIN_SPARK_CONDUIT)
        {
            const int pow = 20 + you.skill(SK_EVOCATIONS, 4) + evoker_plus(item.sub_type) * 7;
            return make_stringf("3d%d", 7 + pow / 6);
        }
        else if (item.sub_type == MISC_SKALD_HORN)
        {
            const int pow = 20 + you.skill(SK_EVOCATIONS, 4) + evoker_plus(item.sub_type) * 7;
            return make_stringf("2d%d", 6 + pow / 6);
        }
        else
            return "";
    }
    else
        return "";
}

string evoke_noise_string(const item_def& item)
{
    if (item.base_type == OBJ_WANDS)
    {
        return spell_noise_string(
            spell_in_wand(static_cast<wand_type>(item.sub_type)));
    }
    else if (item.base_type == OBJ_MISCELLANY)
    {
        if (item.sub_type == MISC_PHIAL_OF_FLOODS)
            return spell_noise_string(SPELL_PRIMAL_WAVE);
        else if (item.sub_type == MISC_LIGHTNING_ROD)
            return spell_noise_string(SPELL_THUNDERBOLT);
        else if (item.sub_type == MISC_TIN_OF_TREMORSTONES)
            return spell_noise_string(SPELL_TREMORSTONE);
        else if (item.sub_type == MISC_GRAVITAMBOURINE)
            return spell_noise_string(SPELL_GRAVITAS);
        else if (item.sub_type == MISC_TWIN_SPARK_CONDUIT
                 || item.sub_type == MISC_SKALD_HORN)
            return "loud";
        else if (item.sub_type == MISC_AEGIS_STANDARD
                 || item.sub_type == MISC_ASTRAL_BEACON)
            return "moderate";
        else
            return "";
    }
    else
        return "";
}

dice_def pyromania_damage(bool random, bool max)
{
    const int power = max ? 2700 : you.skill(SK_EVOCATIONS, 100);
    if (random)
        return zap_damage(ZAP_FIREBALL, 20 + div_rand_round(power, 25), false, true);
    else
        return zap_damage(ZAP_FIREBALL, 20 + power / 25, false, false);
}

int pyromania_trigger_chance(bool max)
{
    return 23 + (max ? 27 : you.skill(SK_EVOCATIONS, 1));
}

int mesmerism_orb_radius(bool max)
{
    const int skill = max ? 27 : you.skill(SK_EVOCATIONS);
    return min(2 + skill / 7, 4);
}

int stardust_orb_max(bool max)
{
    const int skill = max ? 27 : you.skill(SK_EVOCATIONS);
    return 3 + skill / 2;
}

int stardust_orb_power(int mp_spent, bool max_evo)
{
    const int skill = max_evo ? 81 : you.skill(SK_EVOCATIONS, 3);
    int pow = (skill + 10) * (100 + (mp_spent * 25)) / 100;
    return pow;
}

void stardust_orb_trigger(int mp_spent)
{
    if (!you.duration[DUR_STARDUST_COOLDOWN]
        && you.wearing_ego(OBJ_ARMOUR, SPARM_STARDUST)
        && !you.has_mutation(MUT_HP_CASTING))
    {
        schedule_stardust_fineff(&you, stardust_orb_power(mp_spent),
                                 stardust_orb_max(), SHOOTING_STAR_ORB);
    }
}
