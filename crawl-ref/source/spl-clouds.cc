/**
 * @file
 * @brief Cloud creating spells.
**/

#include "AppHdr.h"

#include "spl-clouds.h"

#include <algorithm>

#include "cloud.h"
#include "automaton.h"
#include "coord.h"
#include "coordit.h"
#include "corpse.h"
#include "directn.h"
#include "english.h"
#include "env.h"
#include "fprop.h"
#include "fight.h"
#include "fineff.h" // explosion_fineff, etc
#include "items.h"
#include "level-state-type.h"
#include "libutil.h"
#include "message.h"
#include "mon-behv.h" // ME_WHACK
#include "ouch.h"
#include "party.h"
#include "random-pick.h"
#include "shout.h"
#include "spl-util.h"
#include "stringutil.h"
#include "target.h"
#include "terrain.h"
#include "viewchar.h"

void maintain_steam_barrier()
{
    maybe_melt_player_enchantments(BEAM_FIRE, 100);
    you.redraw_armour_class = true;
    noisy(6, you.pos());
    if (cloud_at(you.pos()) && cloud_at(you.pos())->type == CLOUD_STEAM)
        delete_cloud(you.pos());
    for (adjacent_iterator ai(you.pos()); ai; ++ai)
        if (!cell_is_solid(*ai) && !cloud_at(*ai))
            place_cloud(CLOUD_STEAM, *ai, 1 + random2(6), &you);
}

spret cast_steam_barrier(int power, bool fail)
{
    fail_check();
    you.duration[DUR_STEAM_BARRIER] = 60 + power + random2(max(1, power));
    mpr("You begin emitting steam!");
    maintain_steam_barrier();
    return spret::success;
}

spret cast_putrefaction(monster* target, int pow, bool fail)
{
    fail_check();

    // Place one miasma cloud immediately beneath the target.
    place_cloud(CLOUD_MIASMA, target->pos(), random_range(5, 9), &you);

    // Then start a spread of fiant miasma that will become proper miasma a
    // turn later.
    map_cloud_spreader_marker *marker =
    new map_cloud_spreader_marker(target->pos(), CLOUD_FAINT_MIASMA, 7,
                                        random_range(18, 28), 5, 2, &you);

    // Start the cloud at radius 1, regardless of the speed of the killing blow
    marker->speed_increment -= you.time_taken - 7;
    env.markers.add(marker);

    mprf("Rot billows forth from %s wounds!", target->name(DESC_ITS).c_str());

    drain_player(75 - div_rand_round(pow * 4, 10), true, true);

    return spret::success;
}

spret kindle_blastmotes(int pow, bool fail)
{
    if (cloud_at(you.pos()))
    {
        mpr("There's already a cloud here!");
        return spret::abort;
    }

    fail_check();

    // Really should be per-cloud, but skeptical people are changing power
    // between successive blastmote casts that often.
    you.props[BLASTMOTE_POWER_KEY] = pow;
    // Longish duration to support setting up silly traps.
    you.props[BLASTMOTE_IMMUNE_KEY] = true;
    place_cloud(CLOUD_BLASTMOTES, you.pos(), random_range(20, 30), &you,
                -1, -1, true, automaton::casting_automatically());
    mpr("A cloud of volatile blastmotes flares up around you! Run!");

    return spret::success;
}

void explode_blastmotes_at(coord_def p)
{
    const cloud_struct* cloud = cloud_at(p);
    const bool automatic = cloud && cloud->type == CLOUD_BLASTMOTES
                           && cloud->protects_nonhostiles();
    const mid_t source = automatic ? cloud->source : you.mid;
    player* owner = automatic ? party::player_by_mid(source) : &you;
    // Preserve the legacy active-player behavior for ordinary blastmotes;
    // automatic clouds retain their original party owner in the cloud source.
    delete_cloud(p);

    // An orphaned automatic cloud must not borrow another hero's power.
    if (automatic && (!owner || !owner->props.exists(BLASTMOTE_POWER_KEY)))
        return;

    bolt beam(*owner, ZAP_BLASTMOTE, owner->props[BLASTMOTE_POWER_KEY]);
    beam.target        = p;
    beam.source        = p;
    const string boom  = "The cloud of blastmotes explodes!";
    const string sanct = "By Zin's power, the fiery explosion is contained.";
    schedule_explosion_fineff(beam, boom, sanct,
                              automatic ? EXPLOSION_FINEFF_AUTOMATON_CONCUSSION
                                        : EXPLOSION_FINEFF_CONCUSSION,
                              nullptr, "");
}

spret cast_freezing_cloud(int pow, const coord_def& target, bool fail)
{
    targeter_cloud hitfunc(&you, CLOUD_COLD, LOS_RADIUS);
    hitfunc.set_aim(target);

    if (stop_attack_prompt(hitfunc, "conjure a freezing cloud",
                            [](const actor *act) { return (act->is_player() || act->res_cold() < 3) && !act->cloud_immune();},
                            nullptr, nullptr, false, true))
    {
        return spret::abort;
    }

    fail_check();

    big_cloud(CLOUD_COLD, &you, target, pow, 8 + random2(3), -1);
    noisy(spell_effect_noise(SPELL_FREEZING_CLOUD), target);
    return spret::success;
}

/*
 * A cloud_func that places an individual cloud as part of a cloud area. This
 * function is called by apply_area_cloud();
 *
 * @param where       The location of the cloud.
 * @param pow         The spellpower of the spell placing the clouds, which
 *                    determines how long the cloud will last.
 * @param spread_rate How quickly the cloud spreads.
 * @param ctype       The type of cloud to place.
 * @param agent       Any agent that may have caused the cloud. If this is the
 *                    player, god conducts are applied.
 * @param excl_rad    How large of an exclusion radius to make around the
 *                    cloud.
 * @returns           The number of clouds made, which is always 1.
 *
*/
static int _make_a_normal_cloud(coord_def where, int pow, int spread_rate,
                                cloud_type ctype, const actor *agent,
                                int excl_rad)
{
    place_cloud(ctype, where,
                (3 + random2(pow / 4) + random2(pow / 4) + random2(pow / 4)),
                agent, spread_rate, excl_rad);

    return 1;
}

/*
 * Make a large area of clouds centered on a given place. This never creates
 * player exclusions.
 *
 * @param ctype       The type of cloud to place.
 * @param agent       Any agent that may have caused the cloud. If this is the
 *                    player, god conducts are applied.
 * @param where       The location of the cloud.
 * @param pow         The spellpower of the spell placing the clouds, which
 *                    determines how long the cloud will last.
 * @param size        How large a radius of clouds to place from the `where'
 *                    argument.
 * @param spread_rate How quickly the cloud spreads.
*/
void big_cloud(cloud_type cl_type, const actor *agent,
               const coord_def& where, int pow, int size, int spread_rate)
{
    // The starting point _may_ be a place no cloud can be placed on.
    apply_area_cloud(_make_a_normal_cloud, where, pow, size,
                     cl_type, agent, spread_rate, -1);
}

void holy_flames(monster* caster, actor* defender)
{
    const coord_def pos = defender->pos();
    int cloud_count = 0;
    const int dur = 8 + random2avg(caster->get_hit_dice() * 3, 2);

    for (adjacent_iterator ai(pos); ai; ++ai)
    {
        if (monster_at(*ai))
            continue;

        if (place_cloud(CLOUD_HOLY, *ai, dur, caster))
            cloud_count++;
    }

    if (cloud_count)
    {
        if (defender->is_player())
            mpr("Blessed fire suddenly surrounds you!");
        else
            simple_monster_message(*defender->as_monster(),
                                   " is surrounded by blessed fire!");
    }
}

spret scroll_of_poison(bool scroll_unknown)
{
    int created = 0;
    bool unknown_unseen = false;
    for (radius_iterator ri(you.pos(), LOS_NO_TRANS); ri; ++ri)
    {
        if (const actor* act = actor_at(*ri))
        {
            unknown_unseen = unknown_unseen || !you.aware_of(*act);
            continue;
        }

        if (place_cloud(CLOUD_POISON, *ri, 10 + random2(11), &you))
            ++created;
    }

    if (created > 0)
    {
        mpr("The air fills with toxic fumes!");
        return spret::success;
    }
    if (!scroll_unknown && !unknown_unseen)
    {
        mpr("There's no open space to fill with poison.");
        return spret::abort;
    }
    canned_msg(MSG_NOTHING_HAPPENS);
    return spret::fail;
}

static void _get_evaporate_result(vector<beam_type>& beams, int potion)
{
    switch (potion)
    {
    case POT_STRONG_POISON:
    case POT_CANCELLATION:
        beams.push_back(BEAM_POTION_POISON);
        beams.push_back(BEAM_MEPHITIC);
        break;

    case POT_POISON:
        beams.push_back(BEAM_POTION_POISON);
        beams.push_back(BEAM_POTION_POISON);
        break;

    case POT_SLOWING:
    case POT_MOONSHINE:
    case POT_ATTRACTION:
    case POT_EMPATHY:
        beams.push_back(BEAM_MEPHITIC);
        beams.push_back(BEAM_MEPHITIC);
        break;

    case POT_DECAY:
    case POT_SOUL_AMBROSIA:
        beams.push_back(BEAM_POTION_MIASMA);
        beams.push_back(BEAM_POTION_MIASMA);
        break;

    case POT_INVISIBILITY:
        beams.push_back(BEAM_POTION_BLACK_SMOKE);
        beams.push_back(BEAM_POTION_BLACK_SMOKE);
        break;

    case POT_HASTE:
    case POT_BRILLIANCE:
        beams.push_back(BEAM_POTION_FIRE);
        beams.push_back(BEAM_POTION_STEAM);
        break;

    case POT_BERSERK_RAGE:
        beams.push_back(BEAM_POTION_FIRE);
        beams.push_back(BEAM_POTION_FIRE);
        break;

    case POT_MIGHT:
    case POT_ENLIGHTENMENT:
        beams.push_back(BEAM_POTION_COLD);
        beams.push_back(BEAM_POTION_STEAM);
        break;

    case POT_MUTATION:
        beams.push_back(BEAM_POTION_MUTAGENIC);
        break;

    case POT_EXPERIENCE:
        beams.push_back(BEAM_POTION_FIRE);
        beams.push_back(BEAM_POTION_COLD);
        beams.push_back(BEAM_POTION_POISON);
        beams.push_back(BEAM_MEPHITIC);
        beams.push_back(BEAM_POTION_MIASMA);
        break;

    case POT_RESISTANCE:
        beams.push_back(BEAM_POTION_FIRE);
        beams.push_back(BEAM_POTION_COLD);
        beams.push_back(BEAM_POTION_POISON);
        break;

    case POT_CURING:
    case POT_HEAL_WOUNDS:
    case POT_AMBROSIA:
    case POT_CONCORD:
    case POT_TRANSFUSION:
        beams.push_back(BEAM_POTION_STEAM);
        beams.push_back(BEAM_POTION_BLUE_SMOKE);
        break;

    case POT_MAGIC:
        beams.push_back(BEAM_POTION_PURPLE_SMOKE);
        beams.push_back(BEAM_POTION_PURPLE_SMOKE);
        break;

    case POT_LIGNIFY:
        beams.push_back(BEAM_POTION_RAIN);
        beams.push_back(BEAM_POTION_RAIN);
        break;

    case POT_WATER:
    case POT_MIST:
    default:
        beams.push_back(BEAM_POTION_STEAM);
        beams.push_back(BEAM_POTION_STEAM);
        break;
    }
}

// Returns a comma-separated list of cloud types potentially created
// by this potion type. Doesn't include random cloud types.
string get_evaporate_result_list(int potion)
{
    vector<beam_type> beams;
    _get_evaporate_result(beams, potion);

    std::sort(beams.begin(), beams.end());

    vector<string> clouds_list;
    beam_type old_beam = BEAM_NONE;
    for (beam_type beam : beams)
    {
        if (beam == old_beam)
            continue;
        old_beam = beam;
        clouds_list.push_back(cloud_type_name(beam2cloud(beam)));
    }
    return comma_separated_line(clouds_list.begin(), clouds_list.end(),
                                " or ", ", ");
}

// Assumes beem.range has already been set -cao
spret cast_evaporate(int pow, bolt& beem, int pot_idx, bool fail)
{
    ASSERT(you.inv[pot_idx].base_type == OBJ_POTIONS);
    item_def& potion = you.inv[pot_idx];

    beem.name         = "potion";
    beem.colour       = potion.get_colour();
    beem.glyph        = dchar_glyph(DCHAR_FIRED_MISSILE);
    beem.source_id    = you.mid;
    beem.thrower      = KILL_YOU_MISSILE;
    beem.attitude     = ATT_FRIENDLY;
    beem.pierce       = false;
    beem.aux_source.clear();

    beem.hit          = AUTOMATIC_HIT;
    beem.damage       = dice_def(1, 0);
    beem.ench_power   = pow;
    beem.is_explosion = true;
    beem.origin_spell = SPELL_EVAPORATE;

    bolt tracer_beam = beem;
    player_beam_tracer tracer;

    if (!you.confused())
    {
        // Assume worst-case scenario when throwing an unidentified potion or a
        // potion with random effects.
        tracer_beam.flavour = BEAM_POTION_RANDOM;
        if (potion.is_identified())
        {
            switch (potion.sub_type)
            {
            case POT_RESISTANCE:
            case POT_EXPERIENCE:
            case POT_MUTATION:
                break;
            case POT_STRONG_POISON:
            case POT_CANCELLATION:
                tracer_beam.flavour = (player_res_poison() > 0)
                                      ? BEAM_MEPHITIC : BEAM_POTION_POISON;
                break;
            default:
            {
                vector<beam_type> beams;
                _get_evaporate_result(beams, potion.sub_type);
                tracer_beam.flavour = beams[0];
                break;
            }
            }
        }

        tracer_beam.source           = you.pos();
        tracer_beam.overshoot_prompt = false;
        tracer_beam.passed_target    = false;
        tracer_beam.fire(tracer);

        if (cancel_beam_prompt(tracer_beam, tracer))
        {
            you.turn_is_over = false;
            return spret::abort;
        }
    }

    fail_check();

    // Get actual beam effect.
    vector<beam_type> beams;
    _get_evaporate_result(beams, potion.sub_type);
    if (potion.sub_type == POT_MUTATION)
        beams.push_back(BEAM_POTION_RANDOM);
    beem.flavour = beams[random2(beams.size())];

    beem.fire();

    if (you.see_cell(beem.target))
    {
        switch (potion.sub_type)
        {
        case POT_DECAY:
        case POT_POISON:
        case POT_INVISIBILITY:
        case POT_MAGIC:
        case POT_BERSERK_RAGE:
        case POT_LIGNIFY:
            identify_item(potion);
            break;
        case POT_MUTATION:
            if (beem.flavour == BEAM_POTION_MUTAGENIC)
                identify_item(potion);
            break;
        default:
            break;
        }
    }

    dec_inv_item_quantity(pot_idx, 1);

    return spret::success;
}

