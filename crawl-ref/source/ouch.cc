/**
 * @file
 * @brief Functions used when Bad Things happen to the player.
**/

#include "AppHdr.h"
#include "wyrm-essence.h"
#include "hermit-crab.h"
#include "automaton.h"
#include "kimjoy-artifacts.h"

#include "ouch.h"
#include "auras.h"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#ifdef UNIX
#include <fcntl.h>
#include <sys/types.h>
#include <unistd.h>
#endif

#include "artefact.h"
#include "act-iter.h"
#include "art-enum.h"
#include "beam.h"
#include "chardump.h"
#include "cloud.h"
#include "colour.h"
#include "database.h"
#include "delay.h"
#include "dgn-event.h"
#include "end.h"
#include "env.h"
#include "fight.h"
#include "files.h"
#include "fineff.h"
#include "spl-transloc.h"
#include "ghost.h"
#include "god-abil.h"
#include "god-agraphede.h"
#include "god-passive.h"
#include "hints.h"
#include "hiscores.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "jobs.h"
#include "libutil.h"
#include "melee-attack.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-death.h"
#include "mon-place.h"
#include "mon-speak.h"
#include "mon-tentacle.h"
#include "mon-util.h"
#include "mutation.h"
#include "nearby-danger.h"
#include "notes.h"
#include "options.h"
#include "output.h"
#include "party.h"
#include "place.h"
#include "player.h"
#include "player-stats.h"
#include "potion.h"
#include "prompt.h"
#include "random.h"
#include "religion.h"
#include "skills.h"
#include "shopping.h"
#include "shout.h"
#include "species.h"
#include "spl-clouds.h"
#include "spl-damage.h"
#include "spl-goditem.h"
#include "spl-monench.h"
#include "spl-selfench.h"
#include "state.h"
#include "stats-json.h"
#include "stringutil.h"
#include "teleport.h"
#include "terrain.h"
#include "transform.h"
#include "tutorial.h"
#include "view.h"
#include "xom.h"

void maybe_melt_player_enchantments(beam_type flavour, int damage)
{
    if (flavour == BEAM_FIRE || flavour == BEAM_LAVA
        || flavour == BEAM_STICKY_FLAME || flavour == BEAM_STEAM)
    {
        if (you.has_mutation(MUT_CONDENSATION_SHIELD))
        {
            if (!you.duration[DUR_ICEMAIL_DEPLETED])
            {
                if (you.has_mutation(MUT_ICEMAIL))
                    mprf(MSGCH_DURATION, "Your icy defences dissipate!");
                else
                    mprf(MSGCH_DURATION, "Your condensation shield dissipates!");
            }
            you.duration[DUR_ICEMAIL_DEPLETED] = ICEMAIL_TIME;
            you.redraw_armour_class = true;
        }

        if (you.duration[DUR_ICY_ARMOUR] > 0)
        {
            you.duration[DUR_ICY_ARMOUR] -= damage * BASELINE_DELAY;
            if (you.duration[DUR_ICY_ARMOUR] <= 0)
                remove_ice_armour();
            else
                you.props[MELT_ARMOUR_KEY] = true;
        }
    }
}

int check_your_resists(int hurted, beam_type flavour, string source,
                       bolt *beam, bool doEffects)
{
    int original = hurted;

    dprf("checking resistance: flavour=%d", flavour);

    string kaux = "";
    if (beam)
    {
        source = beam->get_source_name();
        kaux = beam->name;
    }

    if (doEffects)
        maybe_melt_player_enchantments(flavour, hurted);

    switch (flavour)
    {
    case BEAM_WATER:
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (!hurted && doEffects)
            mpr("You shrug off the wave.");
        break;

    case BEAM_STEAM:
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("The steam scalds you terribly!");
            xom_is_stimulated(200);
        }
        break;

    case BEAM_FIRE:
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("The fire burns you terribly!");
            xom_is_stimulated(200);
        }
        break;

    case BEAM_DAMNATION:
        break; // sucks to be you (:

    case BEAM_COLD:
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("The cold chills you terribly!");
            xom_is_stimulated(200);
        }
        break;

    case BEAM_STUN_BOLT:
    case BEAM_ELECTRICITY:
    case BEAM_THUNDER:
        hurted = resist_adjust_damage(&you, flavour, hurted);

        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        break;

    case BEAM_POISON:
        hurted = resist_adjust_damage(&you, flavour, hurted);

        if (doEffects)
        {
            // Ensure that we received a valid beam object before proceeding.
            // See also melee-attack.cc:_print_resist_messages() which cannot be
            // used with this beam type (as it does not provide a valid beam).
            ASSERT(beam);

            int pois = div_rand_round(beam->damage.num * beam->damage.size, 2);
            pois = 3 + random_range(pois * 2 / 3, pois * 4 / 3);

            // If Concentrate Venom is active, we apply the normal amount of
            // poison this beam would have applied on TOP of the curare effect.
            //
            // This is all done through the curare_actor method for better messaging.
            if (beam->origin_spell == SPELL_SPIT_POISON &&
                beam->agent(true)->is_monster() &&
                beam->agent(true)->as_monster()->has_ench(ENCH_CONCENTRATE_VENOM))
            {
                curare_actor(beam->agent(), &you, "concentrated venom",
                             beam->agent(true)->name(DESC_PLAIN), pois);
            }
            else
            {
                poison_player(pois, source, kaux);

                if (player_res_poison() > 0)
                    canned_msg(MSG_YOU_RESIST);
            }
        }

        break;

    case BEAM_POISON_ARROW:
        if (doEffects)
        {
            // Ensure that we received a valid beam object before proceeding.
            // See also melee-attack.cc:_print_resist_messages() which cannot be
            // used with this beam type (as it does not provide a valid beam).
            ASSERT(beam);
            int pois = div_rand_round(beam->damage.num * beam->damage.size, 2);
            pois = 3 + random_range(pois * 2 / 3, pois * 4 / 3);

            const int resist = player_res_poison();
            poison_player((resist ? pois / 2 : pois), source, kaux, true);
        }

        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_PARTIALLY_RESIST);
        break;

    case BEAM_NEG:
        hurted = resist_adjust_damage(&you, flavour, hurted);

        if (doEffects)
        {
            // drain_player handles the messaging here
            drain_player(original, true);
        }
        break;

    case BEAM_ICE:
        hurted = resist_adjust_damage(&you, flavour, hurted);

        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_PARTIALLY_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("The ice freezes you terribly!");
            xom_is_stimulated(200);
        }
        break;

    case BEAM_LAVA:
        hurted = resist_adjust_damage(&you, flavour, hurted);

        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_PARTIALLY_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("The lava burns you terribly!");
            xom_is_stimulated(200);
        }
        break;

    case BEAM_ACID:
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        break;

    case BEAM_MIASMA:
        if (you.res_miasma())
        {
            if (doEffects)
                canned_msg(MSG_YOU_RESIST);
            hurted = 0;
        }
        break;

    case BEAM_HOLY:
    case BEAM_FOUL_FLAME:
    {
        hurted = resist_adjust_damage(&you, flavour, hurted);
        if (hurted < original && doEffects)
            canned_msg(MSG_YOU_RESIST);
        else if (hurted > original && doEffects)
        {
            mpr("You writhe in agony!");
            xom_is_stimulated(200);
        }
        break;
    }

    case BEAM_DEVASTATION:
        if (doEffects)
            you.strip_willpower(beam->agent(), random_range(8, 14));
        break;

    case BEAM_UMBRAL_TORCHLIGHT:
        if (you_worship(GOD_YREDELEMNUL) || !you.has_soul())
            hurted = 0;
        break;

    case BEAM_WARPING:
        if (doEffects
            && x_chance_in_y(get_warp_space_chance(beam->ench_power), 100))
        {
            you.blink();
        }
        break;

    case BEAM_SEISMIC:
        if (you.airborne())
            hurted = hurted / 3;
        break;

    case BEAM_BOLAS:
        if (doEffects)
        {
            if (you.is_insubstantial() || you.is_amorphous())
                mpr("The bolas passes through you!");
            else if (you.unrand_equipped(UNRAND_SLICK_SLIPPERS))
                mpr("You slip free of the bolas.");
            else
            {
                you.set_duration(DUR_NO_MOMENTUM, random_range(4, 8), 0,
                "The bolas wraps around you and binds you in place!");
            }
        }
        break;

    default:
        break;
    }                           // end switch

    return hurted;
}

/**
 * Handle side-effects for exposure to element other than damage.
 * Historically this handled item destruction, and melting meltable enchantments. Now it takes care of 3 things:
 *   - triggering qazlal's elemental adaptations
 *   - slowing cold-blooded players (draconians, hydra form)
 *   - putting out fires
 * This function should be called exactly once any time a player is exposed to the
 * following elements/beam types: cold, fire, elec, water, steam, lava, BEAM_FRAG. For the sake of Qazlal's
 * elemental adaptation, it should also be called (exactly once) with BEAM_MISSILE when
 * receiving physical damage. Hybrid damage (brands) should call it twice with appropriate
 * flavours.
 *
 * @param flavour The beam type.
 * @param strength The strength of the attack. Used in different ways for different side-effects.
 *     For qazlal_elemental_adapt: (i) it is used for the probability of triggering, and (ii) the resulting length of the effect.
 * @param slow_cold_blooded If True, the beam_type is BEAM_COLD, and the player
 *                          is cold-blooded and not cold-resistant, slow the
 *                          player 50% of the time.
 */
void expose_player_to_element(beam_type flavour, int strength, bool slow_cold_blooded)
{
    dprf("expose_player_to_element, strength %i, flavor %i, slow_cold_blooded is %i", strength, flavour, slow_cold_blooded);
    qazlal_element_adapt(flavour, strength);

    if (flavour == BEAM_WATER && you.species == SP_SPARKBORN
        && you.magic_points > 0)
    {
        mprf(MSGCH_WARN, "The water discharges your magic!");
        drain_mp(you.magic_points, true);
    }

    if (flavour == BEAM_COLD && slow_cold_blooded
        && (you.get_mutation_level(MUT_COLD_BLOODED)
            || you.form == transformation::serpent
            || you.form == transformation::hypnogecko)
        && you.res_cold() <= 0 && coinflip())
    {
        you.slow_down(0, strength);
    }

    if ((flavour == BEAM_FIRE || flavour == BEAM_LAVA
         || flavour == BEAM_STICKY_FLAME || flavour == BEAM_STEAM)
        && you.has_bane(BANE_HEATSTROKE))
    {
        int chance = 80;
        const int rF = you.res_fire();
        if (rF < 0)
            chance = chance * 3 / 2;
        else
            chance = chance / (rF + 1);

        if (x_chance_in_y(chance, 100))
        {
            mprf(MSGCH_WARN, "The heat overwhelms you.");
            you.slow_down(0, random_range(4, 8));
        }
    }

    if ((flavour == BEAM_COLD || flavour == BEAM_ICE)
        && you.has_bane(BANE_SNOW_BLINDNESS))
    {
        int chance = 80;
        const int rC = you.res_cold();
        if (rC < 0)
            chance = chance * 3 / 2;
        else
            chance = chance / (rC + 1);

        if (x_chance_in_y(chance, 100))
        {
            mprf(MSGCH_WARN, "The cold chills your senses.");
            const int dur = random_range(5, 10);
            blind_player(dur, LIGHTBLUE);
            you.increase_duration(DUR_WEAK, dur, 50);
        }
    }

    if ((flavour == BEAM_ELECTRICITY || flavour == BEAM_THUNDER
         || flavour == BEAM_STUN_BOLT)
        && you.has_bane(BANE_ELECTROSPASM))
    {
        int chance = 60;
        const int rElec = you.res_elec();
        if (rElec < 0)
            chance = chance * 3 / 2;
        else
            chance = chance / (rElec + 1);

        if (x_chance_in_y(chance, 100))
        {
            mprf(MSGCH_WARN, "The electricity makes your body seize.");
            you.increase_duration(DUR_NO_MOMENTUM, random_range(3, 7), 10);
        }
    }

    if (flavour == BEAM_WATER && you.duration[DUR_STICKY_FLAME])
    {
        mprf(MSGCH_WARN, "The flames go out!");
        end_sticky_flame_player();
    }

    if (you.form == transformation::aqua
        && get_beam_resist_type(flavour) == BEAM_COLD && coinflip())
    {
        if (!you.duration[DUR_FROZEN])
            mpr("Your body starts to freeze solid!");
        you.increase_duration(DUR_FROZEN, random_range(5, 10), 50);
    }
}

void lose_level()
{
    // Because you.experience is unsigned long, if it's going to be
    // negative, must die straightaway.
    if (you.experience_level == 1)
    {
        player_die(KILLED_BY_DRAINING);
        // Return in case death was cancelled via wizard mode
        return;
    }

    you.experience_level--;
    if (you.species == SP_HIGH_ELF)
        reset_training();

    mprf(MSGCH_WARN,
         "You are now level %d!", you.experience_level);

    calc_hp();
    calc_mp();

    take_note(Note(NOTE_XP_LEVEL_CHANGE, you.experience_level, 0,
        make_stringf("HP: %d/%d MP: %d/%d",
                you.hp, you.hp_max, you.magic_points, you.max_magic_points)));

    you.redraw_title = true;
    you.redraw_experience = true;
#ifdef USE_TILE_LOCAL
    // In case of intrinsic ability changes.
    tiles.layout_statcol();
    redraw_screen();
    update_screen();
#endif

    xom_is_stimulated(200);

    // Kill the player if maxhp <= 0. We can't just move the ouch() call past
    // dec_max_hp() since it would decrease hp twice, so here's another one.
    if (you.hp_max <= 0)
        player_die(KILLED_BY_DRAINING);
}

/**
 * Drain the player.
 *
 * @param power             The amount by which to drain the player.
 * @param announce_full     Whether to print messages even when fully resisting
 *                          the drain.
 * @param ignore_protection Whether to ignore the player's rN.
 * @param quiet             Whether to hide all messages that would be printed
 *                          by this.
 * @return                  Whether draining occurred.
 */
bool drain_player(int power, bool announce_full, bool ignore_protection, bool quiet)
{
    if (crawl_state.disables[DIS_AFFLICTIONS])
        return false;

    const int protection = ignore_protection ? 0 : player_prot_life();

    if (protection == 3)
    {
        if (announce_full && !quiet)
            canned_msg(MSG_YOU_RESIST);

        return false;
    }

    if (protection > 0)
    {
        if (!quiet)
            canned_msg(MSG_YOU_PARTIALLY_RESIST);
        power /= (protection * 2);
    }

    if (power > 0)
    {
        const int mhp = 1 + div_rand_round(power * get_real_hp(false, false),
                750);
        you.hp_max_adj_temp -= mhp;
        you.hp_max_adj_temp = max(-(get_real_hp(false, false) - 1),
                you.hp_max_adj_temp);

        dprf("Drained by %d max hp (%d total)", mhp, you.hp_max_adj_temp);
        calc_hp();

        string intensifier = "";
        int perc = 100 * -you.hp_max_adj_temp / get_real_hp(false, false);
        if (perc >= 50)
            intensifier = "extremely ";
        else if (perc >= 30)
            intensifier = "very heavily ";
        else if (perc >= 20)
            intensifier = "heavily ";

        if (!quiet)
            mprf("You feel %sdrained.", intensifier.c_str());
        xom_is_stimulated(15);
        return true;
    }

    return false;
}

static void _xom_checks_damage(kill_method_type death_type,
                               int dam, mid_t death_source)
{
    if (you_worship(GOD_XOM))
    {
        if (death_type == KILLED_BY_TARGETING
            || death_type == KILLED_BY_BOUNCE
            || death_type == KILLED_BY_REFLECTION
            || death_type == KILLED_BY_SELF_AIMED
               && player_in_a_dangerous_place())
        {
            // Xom thinks the player accidentally hurting him/herself is funny.
            // Deliberate damage is only amusing if it's dangerous.
            int amusement = 200 * dam / (dam + you.hp);
            if (death_type == KILLED_BY_SELF_AIMED)
                amusement /= 5;
            xom_is_stimulated(amusement);
            return;
        }
        else if (death_type == KILLED_BY_FALLING_DOWN_STAIRS
                 || death_type == KILLED_BY_FALLING_THROUGH_GATE)
        {
            // Xom thinks falling down the stairs is hilarious.
            xom_is_stimulated(200);
            return;
        }
        else if (death_type == KILLED_BY_DISINT)
        {
            // flying chunks...
            xom_is_stimulated(100);
            return;
        }
        else if (death_type != KILLED_BY_MONSTER
                    && death_type != KILLED_BY_BEAM
                    && death_type != KILLED_BY_DISINT
                 || !monster_by_mid(death_source))
        {
            return;
        }

        int amusementvalue = 1;
        const monster* mons = monster_by_mid(death_source);

        if (!mons->alive())
            return;

        if (mons->wont_attack())
        {
            // Xom thinks collateral damage is funny.
            xom_is_stimulated(200 * dam / (dam + you.hp));
            return;
        }

        int leveldif = mons->get_experience_level() - you.experience_level;
        if (leveldif == 0)
            leveldif = 1;

        // Note that Xom is amused when you are significantly hurt by a
        // creature of higher level than yourself, as well as by a
        // creature of lower level than yourself.
        amusementvalue += leveldif * leveldif * dam;

        if (!mons->visible_to(&you))
            amusementvalue += 8;

        if (mons->speed < 100/player_movement_speed())
            amusementvalue += 7;

        if (player_in_a_dangerous_place())
            amusementvalue += 2;

        amusementvalue /= (you.hp > 0) ? you.hp : 1;

        xom_is_stimulated(amusementvalue);
    }
}

static void _maybe_ru_retribution(int dam, mid_t death_source)
{
    if (will_ru_retaliate())
    {
        // Cap damage to what was enough to kill you. Can matter if
        // you have an extra kitty.
        if (you.hp < 0)
            dam += you.hp;

        monster* mons = monster_by_mid(death_source);
        if (dam <= 0 || !mons || death_source == MID_YOU_FAULTLESS)
            return;

        schedule_ru_retribution_fineff(mons, &you, dam);
    }
}

static void _maybe_inflict_anguish(int dam, mid_t death_source)
{
    const monster* mons = monster_by_mid(death_source);
    if (!mons
        || !mons->alive()
        || !mons->has_ench(ENCH_ANGUISH))
    {
        return;
    }
    schedule_anguish_fineff(mons, dam);
}

static void _maybe_spawn_rats(int dam, kill_method_type death_type)
{
    if (dam <= 0
        || death_type == KILLED_BY_POISON
        || !you.unrand_equipped(UNRAND_RATSKIN_CLOAK))
    {
        return;
    }

    // chance rises linearly with damage taken, up to 75% at half hp.
    const int capped_dam = min(dam, you.hp_max / 2);
    if (!x_chance_in_y(capped_dam * 3, you.hp_max * 2))
        return;

    auto rats = { MONS_HELL_RAT, MONS_RIVER_RAT };
    // Choose random in rats where the rat isn't hated by the player's god.
    int seen = 0;
    monster_type mon = MONS_NO_MONSTER;
    for (auto rat : rats)
        if (!god_hates_monster(rat) && one_chance_in(++seen))
            mon = rat;

    // If there's no valid creatures to pull from (e.g., follower of Oka), bail out.
    if (!seen)
        return;

    mgen_data mg(mon, BEH_FRIENDLY, you.pos(), MHITYOU);
    mg.set_summoned(&you, SPELL_NO_SPELL, summ_dur(3), false);
    mg.flags |= MG_FORCE_BEH; // don't mention how much it hates you before it appears
    if (monster *m = create_monster(mg))
    {
        mprf("%s scurries out from under your cloak.", m->name(DESC_A).c_str());
        // We should return early in the case of no_love or no_allies,
        // so this is more a sanity check.
        check_lovelessness(*m);
    }
}

static void _maybe_summon_demonic_guardian(int dam, kill_method_type death_type)
{
    if (death_type == KILLED_BY_POISON)
        return;
    // low chance to summon on any hit that dealt damage
    // always tries to summon if the hit did 50% max hp or if we're about to die
    if (you.has_mutation(MUT_DEMONIC_GUARDIAN)
        && (x_chance_in_y(dam, you.hp_max)
            || dam > you.hp_max / 2
            || you.hp * 5 < you.hp_max))
    {
        check_demonic_guardian();
    }
}

// The time-warped blood mutation grants haste to
// your allies when you're brought below 66% health.
void _maybe_blood_hastes_allies()
{
    if (you.hp > you.hp_max * 2 / 3
        || !you.has_mutation(MUT_TIME_WARPED_BLOOD)
        || you.duration[DUR_TIME_WARPED_BLOOD_COOLDOWN])
    {
        return;
    }

    vector<monster*> targetable;
    int target_count = you.get_mutation_level(MUT_TIME_WARPED_BLOOD) * 2;
    int affected = 0;
    int time = random_range(20, 30);

    you.duration[DUR_TIME_WARPED_BLOOD_COOLDOWN] = 1;

    for (monster_near_iterator mi(you.pos(), LOS_NO_TRANS); mi; ++mi)
    {
        // Try to look for valid allies that aren't already hasted,
        // and which would properly function when given haste.
        if (mi->alive() && mi->attitude() == ATT_FRIENDLY
            && !mi->berserk_or_frenzied() && you.can_see(**mi)
            && !mi->has_ench(ENCH_HASTE)
            && !mi->is_peripheral())
        {
            targetable.emplace_back(*mi);
        }
    }

    if (targetable.empty())
    {
       mpr("Your atemporal blood churns to no real effect.");
       return;
    }

    // Affect the highest HD allies you have.
    shuffle_array(targetable);
    sort(targetable.begin(), targetable.end(),
         [](const monster* a, const monster* b)
         {return a->get_hit_dice() > b->get_hit_dice();});

    for (monster *application: targetable)
    {
        if (affected < target_count)
        {
             flash_tile(application->pos(), BLUE, 0);
             animation_delay(15, true);
             application->add_ench(mon_enchant(ENCH_HASTE, &you, time * BASELINE_DELAY));
             affected++;
        }
    }

    if (affected > 0)
        mpr("The spilling of your atemporal blood hastes your allies!");
}

static void _maybe_spawn_monsters(int dam, kill_method_type death_type,
                                  mid_t death_source)
{
    monster* damager = monster_by_mid(death_source, true);
    // We need to exclude acid damage and similar things or this function
    // will crash later.
    if (!damager)
        return;

    monster_type mon;
    int how_many = 0;

    if (have_passive(passive_t::spawn_slimes_on_hit))
    {
        mon = royal_jelly_ejectable_monster();
        if (dam >= you.hp_max * 3 / 4)
            how_many = random2(4) + 2;
        else if (dam >= you.hp_max / 2)
            how_many = random2(2) + 2;
        else if (dam >= you.hp_max / 4)
            how_many = 1;
    }
    else if (you_worship(GOD_XOM)
             && dam >= you.hp_max / 4
             && x_chance_in_y(dam, 3 * you.hp_max))
    {
        mon = MONS_BUTTERFLY;
        how_many = 2 + random2(5);
    }

    if (how_many > 0)
    {
        int count_created = 0;
        for (int i = 0; i < how_many; ++i)
        {
            const int mindex = damager->alive() ? damager->mindex() : MHITNOT;
            mgen_data mg(mon, BEH_FRIENDLY, you.pos(), mindex, MG_NONE, you.religion);
            mg.set_summoned(&you, 0, summ_dur(2));

            if (create_monster(mg))
                count_created++;
        }

        if (count_created > 0)
        {
            if (mon == MONS_BUTTERFLY)
            {
                mprf(MSGCH_GOD, "A shower of butterflies erupts from you!");
                take_note(Note(NOTE_XOM_EFFECT, you.raw_piety, -1, "butterfly on damage"), true);
            }
            else
            {
                mprf("You shudder from the %s and a %s!",
                     death_type == KILLED_BY_MONSTER ? "blow" : "blast",
                     count_created > 1 ? "flood of jellies pours out from you"
                                       : "jelly pops out");
            }
        }
    }
}

static void _powered_by_pain(int dam)
{
    const int level = you.get_mutation_level(MUT_POWERED_BY_PAIN);

    if (level > 0
        && (random2(dam) > 4 + div_rand_round(you.experience_level, 4)
            || dam >= you.hp_max / 2))
    {
        switch (random2(4))
        {
        case 0:
        case 1:
        {
            if (you.magic_points < you.max_magic_points)
            {
                mpr("You focus on the pain.");
                int mp = roll_dice(3, 2 + 3 * level);
                canned_msg(MSG_GAIN_MAGIC);
                inc_mp(mp);
                break;
            }
            break;
        }
        case 2:
            mpr("You focus on the pain.");
            potionlike_effect(POT_MIGHT, level * 20);
            break;
        case 3:
            mpr("You focus on the pain.");
            you.be_agile(level * 20);
            break;
        }
    }
}

static void _maybe_fog(int dam)
{
    const int upper_threshold = max(1, you.hp_max / 2);
    const int minpiety = piety_breakpoint(2);
    const int lower_threshold = upper_threshold
        - upper_threshold * (you.piety() - minpiety) / (MAX_PIETY - minpiety);
    if (dam > 0 && (you.form == transformation::shadow
        || (have_passive(passive_t::hit_smoke) && dam >= lower_threshold
            && x_chance_in_y(dam - lower_threshold, upper_threshold - lower_threshold))))
    {
        mpr("You emit a cloud of dark smoke.");
        big_cloud(CLOUD_BLACK_SMOKE, &you, you.pos(), 50, 4 + random2(5));
    }
    else if (you_worship(GOD_XOM) && x_chance_in_y(dam, 30 * upper_threshold))
    {
        mprf(MSGCH_GOD, "You emit a cloud of colourful smoke!");
        big_cloud(CLOUD_XOM_TRAIL, &you, you.pos(), 50, 4 + random2(5), -1);
        take_note(Note(NOTE_XOM_EFFECT, you.raw_piety, -1, "smoke on damage"), true);
    }
}

static void _maybe_splash_water(int dam)
{
    if (you.form != transformation::aqua)
        return;

    const int percent = dam * 100 / you.hp_max;

    if (percent < 10 && !one_chance_in(percent))
        return;

    // Assume the player can fill 25 tiles will all their hp (with some randomisation).
    int water = div_rand_round(percent, 2);

    if (water == 0)
        return;

    vector<coord_def> spots;
    for (distance_iterator di(you.pos(), true, false, 3); di; ++di)
    {
        if (you.see_cell_no_trans(*di)
            && feat_has_dry_floor(env.grid(*di))
            && !feat_is_critical(env.grid(*di)))
        {
            spots.push_back(*di);
        }
    }

    // spots is neatly ordered from player->outwards. random_spots is completely
    // randomized. We mostly pick from spots, with a smaller chance to pick from
    // random spots, so that the splash tends to build outward from the player,
    // but slightly unevenly.
    vector<coord_def> random_spots = spots;
    shuffle_array(random_spots);

    water = min(water, (int)spots.size());

    if (water == 0)
        return;

    mpr("You splash onto the ground.");
    for (int i = 0; i < water; ++i)
    {
        const coord_def pos = one_chance_in(3) ? random_spots[i] : spots[i];
        temp_change_terrain(pos, DNGN_SHALLOW_WATER, random_range(80, 110),
                            TERRAIN_CHANGE_AQUA_FORM, MID_PLAYER);
    }
}

static void _maybe_hive_swarm()
{
    if (you.form != transformation::hive
        || you.allies_forbidden()
        || you.hp * 2 > you.hp_max
        || you.duration[DUR_HIVE_COOLDOWN])
    {
        return;
    }

    mgen_data mg(MONS_KILLER_BEE, BEH_FRIENDLY, you.pos(), MHITYOU, MG_FORCE_BEH | MG_AUTOFOE);
    mg.set_summoned(&you, MON_SUMM_HIVE, random_range(12, 18) * BASELINE_DELAY, false).set_range(1, 3);
    mg.hd = 5;

    const int num = div_rand_round(get_form()->get_effect_size(), 10);
    bool made_mon = false;
    for (int i = 0; i < num; ++i)
    {
        if (monster *swarmer = create_monster(mg))
        {
            made_mon = true;
            swarmer->add_ench(ENCH_BERSERK);
            swarmer->add_ench(ENCH_CONCENTRATE_VENOM);
        }
    }

    if (made_mon)
    {
        mpr("Angry insects swarm out of your body to defend their hive!");
        you.duration[DUR_HIVE_COOLDOWN] = 1;
    }
}

static void _maybe_medusa_lithotoxin()
{
    if (you.form != transformation::medusa
        || you.hp * 10 > you.hp_max * 6
        || you.duration[DUR_MEDUSA_COOLDOWN])
    {
        return;
    }

    vector<monster*> targs;
    for (radius_iterator ri(you.pos(), 3, C_SQUARE, LOS_NO_TRANS, true); ri; ++ri)
        if (monster* mon = monster_at(*ri))
            if (!mon->wont_attack() && mon->has_ench(ENCH_POISON))
                targs.push_back(mon);

    if (targs.empty())
        return;

    draw_ring_animation(you.pos(), 3, LIGHTGREY, 0U, true, 25);
    mprf("Your pain echoes through the poison around you!");
    for (monster* targ : targs)
    {
        if (x_chance_in_y(get_form()->get_effect_chance(), 100))
            targ->petrify(&you);
        else
            simple_monster_message(*targ, " resists.");
    }

    you.duration[DUR_MEDUSA_COOLDOWN] = 1;
}

static void _maybe_eeljolt()
{
    if (you.form != transformation::eel_hands
        || you.hp * 10 > you.hp_max * 4
        || you.duration[DUR_EELJOLT_COOLDOWN])
    {
        return;
    }

    schedule_eeljolt_fineff();
    you.duration[DUR_EELJOLT_COOLDOWN] = 1;
}

static void _maybe_hynogecko_retreat()
{
    if (you.form != transformation::hypnogecko
        || you.hp * 10 > you.hp_max * 4
        || you.props.exists(HYPNOGECKO_LOST_TAIL_KEY))
    {
        return;
    }

    schedule_hypnogecko_tail_fineff();
}

static void _handle_poor_constitution(int dam)
{
    const int level = you.get_mutation_level(MUT_POOR_CONSTITUTION);

    if (level == 0)
        return;

    if (dam > you.hp_max / 15 && one_chance_in(level == 1 ? 9 : 6))
    {
        you.weaken(nullptr, 20);

        if (level == 2 && one_chance_in(2))
            you.slow_down(nullptr, random_range(8, 15));
    }
}

static void _maybe_trigger_spiteful_blood()
{
    if (you.duration[DUR_SPITEFUL_BLOOD_COOLDOWN]
        || !you.has_mutation(MUT_SPITEFUL_BLOOD)
        || you.hp * 10 > you.hp_max * 6)
    {
        return;
    }

    // Go on cooldown regarless of whether we choose to trigger or not, so that
    // the player gets a reprieve until the next battle.
    you.duration[DUR_SPITEFUL_BLOOD_COOLDOWN] = 1;

    if (!x_chance_in_y(2, 5))
        return;

    mgen_data mg(MONS_ERYTHROSPITE, BEH_HOSTILE, you.pos(), MHITYOU, MG_NONE);
    mg.set_summoned(&you, MON_SUMM_SPITEFUL_BLOOD, random_range(18, 26) * BASELINE_DELAY, false).set_range(1, 3);
    mg.hd = pow(you.experience_level, 1.1);
    mg.hp = 5 + pow(you.experience_level, 1.35) * 5 / 4;

    const int num = you.get_mutation_level(MUT_SPITEFUL_BLOOD);
    bool made_mon = false;
    for (int i = 0; i < num; ++i)
        if (create_monster(mg))
            made_mon = true;

    if (made_mon)
        mpr("Your spilled blood starts moving with violent intent!");
}

int corrosion_chance(int sources)
{
    return 3 * sources;
}

/**
 * Maybe corrode the player after taking damage if they're wearing *Corrode.
 **/
static void _maybe_corrode()
{
    int corrosion_sources = you.scan_artefacts(ARTP_CORRODE);
    if (x_chance_in_y(corrosion_chance(corrosion_sources), 100))
        you.corrode(nullptr, "Your corrosive artefact");
}

/**
 * Maybe slow the player after taking damage if they're wearing *Slow.
 **/
static void _maybe_slow()
{
    int slow_sources = you.scan_artefacts(ARTP_SLOW);
    if (x_chance_in_y(slow_sources, 100))
        slow_player(10 + random2(5));
}

/**
 * Maybe silence the player after taking damage if they're wearing *Silence.
 **/
static void _maybe_silence()
{
    int silence_sources = you.scan_artefacts(ARTP_SILENCE);
    if (x_chance_in_y(silence_sources, 100))
        silence_player(4 + random2(7));
}

static void _maybe_get_vitrified(mid_t source)
{
    monster* mon = monster_by_mid(source);
    if (mon && mon->wearing_ego(OBJ_ARMOUR, SPARM_GLASS)
        && x_chance_in_y(40 + mon->get_hit_dice() * 5, 500))
    {
        you.vitrify(mon, 4 + random2(5 + mon->get_hit_dice()));
    }
}

static void _maybe_scream(mid_t source)
{
    // Don't repeatedly scream in place on the same turn.
    if (you.shouted_pos == you.pos())
        return;

    if (x_chance_in_y(you.get_mutation_level(MUT_SCREAM), 20))
    {
        yell(actor_by_mid(source, true));
        you.shouted_pos = you.pos();
    }
}

static void _handle_indomitable(int dam)
{
    if (!you.duration[DUR_STAMPEDE] || !you.has_mutation(MUT_NORTH_WIND))
        return;

    you.duration[DUR_INDOMITABLE] += dam * 70;
}

static void _place_player_corpse(bool explode)
{
    if (!in_bounds(you.pos()))
        return;

    monster dummy;
    dummy.type = player_mons(false);
    define_monster(dummy); // assumes player_mons is not a zombie
    dummy.position = you.pos();
    dummy.props[ALWAYS_CORPSE_KEY] = true;
    dummy.mname = you.your_name;
    dummy.set_hit_dice(you.experience_level);
    if (explode)
        dummy.flags &= MF_EXPLODE_KILL;

    if (you.form != transformation::none)
        mpr("Your shape twists and changes as you die.");

    place_corpse_or_gold(dummy, false);
}

#if defined(WIZARD) || defined(DEBUG)
static void _wizard_restore_life()
{
    if (you.hp_max <= 0)
        undrain_hp(9999);
    while (you.hp_max <= 0)
        you.hp_max_adj_perm++, calc_hp();
    if (you.hp <= 0)
        set_hp(you.hp_max);
}
#endif

int outgoing_harm_amount(int levels)
{
    // +30% damage if opp has one level of harm, +45% with two
    return 15 * (levels + 1);
}

int incoming_harm_amount(int levels)
{
    // +20% damage if you have one level of harm, +30% with two
    return 10 * (levels + 1);
}

static int _apply_extra_harm(int dam, mid_t source)
{
    monster* damager = monster_by_mid(source);
    if (damager && damager->extra_harm())
        dam = dam * (100 + outgoing_harm_amount(damager->extra_harm())) / 100;
    if (you.extra_harm())
        dam = dam * (100 + incoming_harm_amount(you.extra_harm())) / 100;
    return dam;
}

void reset_damage_counters()
{
    you.turn_damage = 0;
    you.damage_source = NON_MONSTER;
    you.source_damage = 0;
}

#if TAG_MAJOR_VERSION == 34
bool can_shave_damage()
{
    return you.species == SP_DEEP_DWARF || you.species == SP_MAYFLYTAUR;
}

int do_shave_damage(int dam)
{
    if (!can_shave_damage())
        return dam;

    // Deep Dwarves get to shave any hp loss.
    int shave = 1 + random2(2 + random2(1 + you.experience_level / 3));
    dprf("HP shaved: %d.", shave);
    dam -= shave;

    return dam;
}
#endif

/// Let Sigmund crow in triumph.
static void _triumphant_mons_speech(actor *killer)
{
    if (!killer || !killer->alive())
        return;

    monster* mon = killer->as_monster();
    if (mon && !mon->wont_attack())
        mons_speaks(mon);  // They killed you and they meant to.
}

static void _god_death_messages(kill_method_type death_type,
                                const actor *killer)
{
    const bool left_corpse = death_type != KILLED_BY_DISINT
                             && death_type != KILLED_BY_LAVA;

    const mon_holy_type holi = you.holiness();
    const bool was_undead = bool(holi & MH_UNDEAD);
    const bool was_nonliving = bool(holi & MH_NONLIVING);

    string key = god_name(you.religion) + " death";

    string key_extended = key;
    if (left_corpse)
        key_extended += " corpse";
    if (was_undead)
        key_extended += " undead";
    if (was_nonliving)
        key_extended += " nonliving";

    // For gods with death messages in the database, first try key_extended.
    // If that doesn't produce anything, try key.
    //
    // This means that the default god death message is "@God_name@ death".
    string result = getSpeakString(key_extended);
    if (result.empty())
        result = getSpeakString(key);
    if (!result.empty())
        god_speaks(you.religion, result.c_str());

    xom_death_message(death_type);

    if (left_corpse)
    {
        if (will_have_passive(passive_t::goldify_corpses))
            mprf(MSGCH_GOD, "Your body crumbles into a pile of gold.");

        if (you.religion == GOD_NEMELEX_XOBEH)
            nemelex_death_message();
    }

    if (killer)
    {
        // If you ever worshipped Beogh, and you get killed by a Beogh
        // worshipper, Beogh will appreciate it.
        if (you.worshipped[GOD_BEOGH] && killer->is_monster()
            && killer->deity() == GOD_BEOGH)
        {
            string msg;
            if (you.religion == GOD_BEOGH)
            {
                msg = " appreciates " + killer->name(DESC_ITS)
                        + " killing of a heretic priest.";
            }
            else
            {
                msg = " appreciates " + killer->name(DESC_ITS)
                        + " killing of an apostate.";
            }
            simple_god_message(msg.c_str(), false, GOD_BEOGH);
        }

        // Doesn't depend on Okawaru worship - you can still lose the duel
        // after abandoning.
        if (killer->props.exists(OKAWARU_DUEL_TARGET_KEY))
        {
            const string msg = " crowns " + killer->name(DESC_THE, true)
                                + " victorious!";
            simple_god_message(msg.c_str(), false, GOD_OKAWARU);
        }
    }
}

static bool _is_real_death(kill_method_type ktype)
{
    return ktype != KILLED_BY_QUITTING
            && ktype != KILLED_BY_WINNING
            && ktype != KILLED_BY_LEAVING;
}

static void _print_endgame_messages(scorefile_entry &se)
{
    const kill_method_type death_type = (kill_method_type) se.get_death_type();

    if (!_is_real_death(death_type))
        return;

    canned_msg(MSG_YOU_DIE);

    actor* killer = se.killer();
    _triumphant_mons_speech(killer);
    _god_death_messages(death_type, killer);

    flush_prev_message();
    viewwindow(); // don't do for leaving/winning characters
    update_screen();

    if (crawl_state.game_is_hints())
        hints_death_screen();
}

/** Hurt the player. Isn't it fun?
 *
 *  @param dam How much damage?
 *  @param death_type how did you get hurt?
 *  @param source who could do such a thing?
 *  @param aux what did they do it with?
 *  @param death_source_name the attacker's name if it is already dead.
 *  @param skip_multipliers Whether to ignore harm/vitrify/etc.
 *  @param skip_awaken Whether this damage will skip waking a sleeping player.
 */
void ouch(int dam, kill_method_type death_type, mid_t source, const char *aux,
          const char *death_source_name, bool skip_multipliers,
          bool skip_awaken)
{
    ASSERT(!crawl_state.game_is_arena());
    if (you.duration[DUR_TIME_STEP])
        return;

    if (you.pending_revival)
        return;

    if (party::is_enabled() && party::is_player_downed(party::active_slot()))
        return;

    int drain_amount = 0;

    // Marionettes will never hurt the player with their spells (even if they
    // have somehow killed themselves in the process)
    if (monster* mon_source = monster_by_mid(source, false, /*allow_dead=*/true))
    {
        if (mon_source->attitude() == ATT_MARIONETTE)
            dam = 0;
    }

    // Multiply damage if Harm or Vitrify is in play. (Poison is multiplied earlier.)
    if (death_type != KILLED_BY_POISON && !skip_multipliers)
    {
        dam = _apply_extra_harm(dam, source);

        if (you.duration[DUR_VITRIFIED])
            dam = dam * 150 / 100;
    }

#if TAG_MAJOR_VERSION == 34
    if (can_shave_damage() && death_type != KILLED_BY_POISON)
        dam = max(0, do_shave_damage(dam));
#endif

    if (you.form == transformation::shadow)
    {
        drain_amount = dam - dam / 2;
        dam /= 2;
    }
    if (you.form == transformation::slaughter)
        dam = dam * 10 / 15;
    if (you.may_pruneify() && you.helpless())
        dam /= 2;
    if (you.petrified())
        dam /= 2;
    else if (you.petrifying())
        dam = dam * 10 / 15;

    // Conversion precedes party redirection, spirit shield and death
    // protection: this attack heals its infusion's owner instead of harming
    // them, and must not spend another player's defensive resources.
    if (monster* attacker = monster_by_mid(source))
        if (dam > 0 && wyrm_essence::converts_damage(*attacker))
        {
            mpr("Viriditas turns the attack into healing!");
            inc_hp(dam);
            return;
        }

    agraphede_divert_damage(dam, death_type);

    if (dam > 0 && _is_real_death(death_type)
        && death_type != KILLED_BY_POISON && death_type != KILLED_BY_ZOT)
    {
        dam = auras::intercept_damage(dam);
    }

    if (party::is_enabled()
        && dam > 1
        && _is_real_death(death_type)
        && death_type != KILLED_BY_POISON
        && death_type != KILLED_BY_ZOT)
    {
        // 1. Aegis Standard damage redirection (35%)
        if ((you.duration[DUR_PHALANX_BARRIER] > 0 || you.duration[DUR_HEROISM] > 0)
            && you.props.exists(AEGIS_ANCHOR_SLOT_KEY))
        {
            const int anchor_slot = you.props[AEGIS_ANCHOR_SLOT_KEY].get_int();
            const int my_slot = party::active_slot();
            if (anchor_slot >= 0
                && anchor_slot < party::player_count()
                && anchor_slot != my_slot
                && !party::is_player_downed(anchor_slot))
            {
                player &anchor = party::get_player(anchor_slot);
                if (anchor.depth == you.depth
                    && anchor.where_are_you == you.where_are_you
                    && anchor.hp > anchor.hp_max / 4
                    && you.see_cell_no_trans(anchor.pos()))
                {
                    const int max_absorb = max(0, anchor.hp - anchor.hp_max / 4);
                    const int redirected = min(dam * 35 / 100, max_absorb);
                    if (redirected > 0)
                    {
                        dam -= redirected;
                        anchor.hp -= redirected;
                        anchor.redraw_hit_points = true;
                        party::sync_player_to_proxy(anchor_slot);
                        mprf(MSGCH_FRIEND_ACTION,
                             "%s's aegis standard absorbs %d of the damage!",
                             anchor.your_name.c_str(), redirected);
                    }
                }
            }
        }

        // 2. Amulet of the Vanguard bloodbond redirection (30%, reduced by vanguard's AC)
        static bool s_vanguard_redirecting = false;
        if (!s_vanguard_redirecting
            && dam > 1
            && !you.wearing_jewellery(AMU_VANGUARD))
        {
            const int victim_slot = party::active_slot();
            int best_vanguard_slot = -1;
            int best_vanguard_hp_pct = 30;

            for (int s = 0; s < party::player_count(); ++s)
            {
                if (s == victim_slot || party::is_player_downed(s))
                    continue;
                const player &ally = party::get_player(s);
                if (ally.hp <= 1
                    || ally.hp_max <= 0
                    || ally.where_are_you != you.where_are_you
                    || ally.depth != you.depth
                    || !ally.wearing_jewellery(AMU_VANGUARD)
                    || !you.see_cell_no_trans(ally.pos()))
                {
                    continue;
                }
                const int hp_pct = (ally.hp * 100) / ally.hp_max;
                if (hp_pct > best_vanguard_hp_pct)
                {
                    best_vanguard_hp_pct = hp_pct;
                    best_vanguard_slot = s;
                }
            }

            if (best_vanguard_slot >= 0)
            {
                const int redirected = max(1, (dam * 30) / 100);
                dam -= redirected;

                int vanguard_taken = 0;
                string vanguard_name;
                {
                    unwind_bool redirect_guard(s_vanguard_redirecting, true);
                    party::scoped_player_context ctx(best_vanguard_slot);
                    vanguard_name = you.your_name;
                    vanguard_taken = max(1, you.apply_ac(redirected));
                    vanguard_taken = min(vanguard_taken, max(0, you.hp - 1));
                    if (vanguard_taken > 0)
                        dec_hp(vanguard_taken, false);
                }

                if (vanguard_taken > 0)
                {
                    mprf(MSGCH_FRIEND_ACTION,
                         "%s's amulet of the vanguard absorbs part of the blow (%d dmg)!",
                         vanguard_name.c_str(), vanguard_taken);
                }
            }
        }

        // 2b. Aegis Link spell damage redirection (35% to healthier linked partner)
        if (dam > 1 && you.duration[DUR_AEGIS_LINK] > 0 && you.hp_max > 0)
        {
            const int victim_slot = party::active_slot();
            const int my_hp_pct = (you.hp * 100) / you.hp_max;
            int best_link_slot = -1;
            int best_link_hp_pct = max(35, my_hp_pct);

            for (int s = 0; s < party::player_count(); ++s)
            {
                if (s == victim_slot || party::is_player_downed(s))
                    continue;
                const player &ally = party::get_player(s);
                if (ally.hp <= ally.hp_max / 3
                    || ally.hp_max <= 0
                    || ally.where_are_you != you.where_are_you
                    || ally.depth != you.depth
                    || ally.duration[DUR_AEGIS_LINK] <= 0
                    || !you.see_cell_no_trans(ally.pos()))
                {
                    continue;
                }
                const int hp_pct = (ally.hp * 100) / ally.hp_max;
                if (hp_pct > best_link_hp_pct)
                {
                    best_link_hp_pct = hp_pct;
                    best_link_slot = s;
                }
            }

            if (best_link_slot >= 0)
            {
                player &partner = party::get_player(best_link_slot);
                const int max_absorb = max(0, partner.hp - partner.hp_max / 3);
                const int redirected = min(dam * 35 / 100, max_absorb);
                if (redirected > 0)
                {
                    dam -= redirected;
                    partner.hp -= redirected;
                    partner.redraw_hit_points = true;
                    party::sync_player_to_proxy(best_link_slot);
                    mprf(MSGCH_FRIEND_ACTION,
                         "Your aegis link with %s deflects %d of the damage!",
                         partner.your_name.c_str(), redirected);
                }
            }
        }

        // 3. Potion of Empathy damage splitting (40% across empathic teammates)
        if (dam > 1 && you.duration[DUR_EMPATHY] > 0)
            dam = party::split_empathy_damage(dam);
    }

    ait_hp_loss hpl(dam, death_type);
    interrupt_activity(activity_interrupt::hp_loss, &hpl);

    // Don't wake the player with fatal or poison damage.
    if (dam > 0 && dam < you.hp && death_type != KILLED_BY_POISON && !skip_awaken)
        you.wake_up();

    // certain effects (e.g. drowned souls) use KILLED_BY_WATER for flavour
    // reasons (morgue messages?), with regrettable consequences if we don't
    // double-check.
    const bool env_death = source == MID_NOBODY
                           && (death_type == KILLED_BY_LAVA
                               || death_type == KILLED_BY_WATER);

    if (!env_death && _is_real_death(death_type) && death_type != KILLED_BY_ZOT
        && you.hp_max > 0)
    {
        // death's door protects against everything but falling into
        // water/lava, Zot, excessive rot, leaving the dungeon, or quitting.
        // Likewise, dreamshard protects you until the start of your next turn.
        if (you.duration[DUR_DEATHS_DOOR] || you.props.exists(DREAMSHARD_KEY))
            return;
        // the dreamshard necklace protects from any fatal blow or death source
        // that death's door would protect from.
        else if (you.unrand_equipped(UNRAND_DREAMSHARD_NECKLACE)
                 && dam >= you.hp)
        {
            dreamshard_shatter();
            return;
        }
    }

    if (you.spirit_shield() && death_type != KILLED_BY_POISON
        && !(aux && strstr(aux, FLAY_DAMAGE_KEY)))
    {
        // round off fairly (important for taking 1 damage at a time)
        int mp = div_rand_round(dam * you.magic_points,
                                max(you.hp + you.magic_points, 1));
        // but don't kill the player with round-off errors
        mp = max(mp, dam + 1 - you.hp);
        mp = min(mp, you.magic_points);

        dam -= mp;
        drain_mp(mp, true);

        // Wake players who took fatal damage exactly equal to current HP,
        // but had it reduced below fatal threshold by spirit shield.
        if (dam < you.hp)
            you.wake_up();

        if (dam <= 0 && you.hp > 0)
            return;
    }

    if (dam >= you.hp && you.hp_max > 0 && god_protects_from_harm())
    {
        simple_god_message(" protects you from harm!");
        // Ensure divine intervention wakes sleeping players. Necessary
        // because we otherwise don't wake players who take fatal damage.
        you.wake_up();
        return;
    }

    you.turn_damage += dam;
    if (you.damage_source != source)
    {
        you.damage_source = source;
        you.source_damage = 0;
    }
    you.source_damage += dam;

    dec_hp(dam, true);

    if (dam > 0)
        automaton::interrupt_bee_engraving();

    // Even if we have low HP messages off, we'll still give a
    // big hit warning (in this case, a hit for half our HPs) -- bwr
    if (dam > 0 && you.hp_max <= dam * 2)
        mprf(MSGCH_DANGER, "Ouch! That really hurt!");

    if (you.hp > 0 && dam > 0)
    {
        automaton::mark_combat(you);
        if (death_type != KILLED_BY_POISON || poison_is_lethal())
            flush_hp();

        hints_healing_check();

        _xom_checks_damage(death_type, dam, source);

        // Sometimes note when significantly injured.
        if (is_noteworthy_hp(you.hp, you.hp_max))
        {
            string damage_desc = scorefile_entry(dam, source, death_type, aux, true)
                                    .death_description(scorefile_entry::DDV_TERSE);

            take_note(Note(NOTE_HP_CHANGE, you.hp, you.hp_max, damage_desc.c_str()));
        }

        _handle_indomitable(dam);
        _handle_poor_constitution(dam);
        _maybe_ru_retribution(dam, source);
        _maybe_inflict_anguish(dam, source);
        _maybe_spawn_monsters(dam, death_type, source);
        _maybe_spawn_rats(dam, death_type);
        _maybe_summon_demonic_guardian(dam, death_type);
        _maybe_fog(dam);
        _maybe_blood_hastes_allies();
        _powered_by_pain(dam);
        makhleb_celebrant_bloodrite();
        _maybe_splash_water(dam);
        _maybe_hive_swarm();
        _maybe_medusa_lithotoxin();
        _maybe_eeljolt();
        _maybe_hynogecko_retreat();
        _maybe_trigger_spiteful_blood();
        _maybe_scream(source);
        if (sanguine_armour_valid())
            activate_sanguine_armour();
        refresh_meek_bonus();
        if (death_type != KILLED_BY_POISON)
        {
            unseen_dragon_after_damage(dam);
            distortion_gauntlets_after_damage(dam);
            _maybe_corrode();
            _maybe_slow();
            _maybe_silence();
            if (you.species == SP_SPARKBORN && you.hp > 0 && dam > 1
                && !you.duration[DUR_BLINKBOLT_COOLDOWN]
                && (dam > you.hp_max / 10 || one_chance_in(10)))
            {
                const int slot = party::active_slot();
                const mid_t owner = you.mid;
                // Reserve the response until the deferred action fires.
                you.duration[DUR_BLINKBOLT_COOLDOWN] = 1;
                schedule_function_fineff([slot, owner]()
                {
                    if (party::is_enabled()
                        && (!party::slot_is_alive(slot)
                            || !party::slot_is_on_current_floor(slot)
                            || party::mid_for_slot(slot) != owner))
                        return;
                    party::scoped_player_context context(slot, true);
                    if (you.species != SP_SPARKBORN || you.mid != owner || you.hp <= 0)
                        return;
                    you.duration[DUR_BLINKBOLT_COOLDOWN] = 0;
                    sparkborn_blinkbolt();
                });
            }
        }
        if (drain_amount > 0)
            drain_player(drain_amount, true, true);

        _maybe_get_vitrified(source);
        if (death_type != KILLED_BY_POISON)
            automaton::trigger_escape();
    }

    if (you.hp <= 0)
        player_die(death_type, source, dam, aux, death_source_name);
}

static string _chronicle_json_escape(const string &s)
{
    string out;
    out.reserve(s.size() + 8);
    for (unsigned char c : s)
    {
        if (c == '"')
            out += "\\\"";
        else if (c == '\\')
            out += "\\\\";
        else if (c == '\n')
            out += "\\n";
        else if (c == '\r')
            out += "\\r";
        else if (c == '\t')
            out += "\\t";
        else if (c >= 0x20)
            out += static_cast<char>(c);
    }
    return out;
}

static void save_ghost(bool force = true)
{
    if (crawl_state.game_is_tutorial() || crawl_state.game_is_arena())
        return;

    vector<ghost_demon> gs = ghost_demon::find_ghosts(true);
    if (gs.empty())
    {
        ghost_demon player_ghost;
        player_ghost.init_player_ghost();
        gs.push_back(player_ghost);
    }
    save_ghosts(gs, force, true);
}

static void _append_chronicle_ghost(const scorefile_entry &se,
                                    const char *down_type,
                                    bool bones_saved)
{
    string path = Options.save_dir.empty()
                  ? string("./rcs/coop_chronicle.jsonl")
                  : Options.save_dir + "coop_chronicle.jsonl";
    FILE *fp = fopen(path.c_str(), "a");
    if (!fp && path != "./rcs/coop_chronicle.jsonl")
        fp = fopen("./rcs/coop_chronicle.jsonl", "a");
    if (!fp)
        return;

    const string hero_name = _chronicle_json_escape(you.your_name);
    const int slot = party::active_slot();
    const string sp_name = _chronicle_json_escape(species::name(you.species));
    const string job_name = _chronicle_json_escape(get_job_name(you.char_class));
    const int xl = you.experience_level;
    const string god_str = _chronicle_json_escape(
        you_worship(GOD_NO_GOD) ? string("No God") : god_name(you.religion));
    const string place_str = _chronicle_json_escape(level_id::current().describe());
    const string killer_str = _chronicle_json_escape(
        se.death_description(scorefile_entry::DDV_TERSE));
    const int hp_max = you.hp_max;
    const int ac = you.armour_class();
    const int ev = you.evasion();
    const int sh = player_shield_class();
    const string wpn_str = _chronicle_json_escape(
        you.weapon() ? you.weapon()->name(DESC_PLAIN, false, true)
                     : string("unarmed"));
    const string dtype_str = _chronicle_json_escape(
        down_type ? string(down_type) : string("permadeath_ghost"));

    fprintf(fp,
            "{\"type\":\"ghost\",\"hero_name\":\"%s\",\"slot\":%d,"
            "\"species\":\"%s\",\"job\":\"%s\",\"xl\":%d,\"god\":\"%s\","
            "\"place\":\"%s\",\"killer\":\"%s\",\"hp_max\":%d,\"ac\":%d,"
            "\"ev\":%d,\"sh\":%d,\"weapon\":\"%s\",\"down_type\":\"%s\","
            "\"bones_saved\":%s}\n",
            hero_name.c_str(), slot, sp_name.c_str(), job_name.c_str(),
            xl, god_str.c_str(), place_str.c_str(), killer_str.c_str(),
            hp_max, ac, ev, sh, wpn_str.c_str(), dtype_str.c_str(),
            bones_saved ? "true" : "false");
    fclose(fp);
}

void player_die(kill_method_type death_type, mid_t source, int dam,
                const char *aux, const char *death_source_name)
{
    // Is the player being killed by a direct act of Xom?
    if (crawl_state.is_god_acting()
        && crawl_state.which_god_acting() == GOD_XOM
        && crawl_state.other_gods_acting().empty())
    {
        you.escaped_death_cause = death_type;
        you.escaped_death_aux   = aux == nullptr ? "" : aux;

        // Xom should only kill his worshippers if they're under penance
        // or Xom is bored.
        if (you_worship(GOD_XOM) && !you.penance[GOD_XOM]
            && you.gift_timeout > 0)
        {
            return;
        }

        // Also don't kill wizards testing Xom acts.
        if ((crawl_state.repeat_cmd == CMD_WIZARD
                || crawl_state.prev_cmd == CMD_WIZARD)
            && !you_worship(GOD_XOM))
        {
            return;
        }

        // Okay, you *didn't* escape death.
        you.reset_escaped_death();

        // Ensure some minimal information about Xom's involvement.
        if (aux == nullptr || !*aux)
        {
            if (death_type != KILLED_BY_XOM)
                aux = "Xom";
        }
        else if (strstr(aux, "Xom") == nullptr)
            death_type = KILLED_BY_XOM;
    }
    // Xom may still try to save your life.
    else if (xom_saves_your_life(death_type))
        return;

#if defined(WIZARD) || defined(DEBUG)
    if (_is_real_death(death_type) && crawl_state.disables[DIS_DEATH])
    {
        _wizard_restore_life();
        return;
    }
#endif

    crawl_state.cancel_cmd_all();

    // Construct scorefile entry.
    scorefile_entry se(dam, source, death_type, aux, false,
                       death_source_name);

#ifdef WIZARD
    if (_is_real_death(death_type))
    {
        if (crawl_state.test || you.wizard || you.suppress_wizard || (you.explore && !you.lives))
        {
            const string death_desc
                = se.death_description(scorefile_entry::DDV_VERBOSE);

            dprf("Damage: %d; Hit points: %d", dam, you.hp);

            if (crawl_state.test || !yesno("Die?", false, 'n'))
            {
                mpr("Thought so.");
                take_note(Note(NOTE_DEATH, you.hp, you.hp_max,
                                death_desc.c_str()), true);
                _wizard_restore_life();
                take_note(Note(NOTE_DEATH, you.hp, you.hp_max,
                                "You cheat death using unusual wizardly powers."), true);
                return;
            }
        }
    }
#endif  // WIZARD

    if (crawl_state.game_is_tutorial())
    {
        crawl_state.need_save = false;
        if (_is_real_death(death_type))
            tutorial_death_message();

        // only quitting can lead to this?
        screen_end_game("", game_exit::quit);
    }

    // Okay, so you're dead.
    take_note(Note(NOTE_DEATH, you.hp, you.hp_max,
                    se.death_description(scorefile_entry::DDV_NORMAL).c_str()),
              true);
    const bool shared_fate = party::shared_fate_enabled() && _is_real_death(death_type);
    if (shared_fate)
        mprf(MSGCH_DANGER, "Shared Fate: %s has died. The expedition is lost!",
             you.your_name.c_str());

    if (!shared_fate && you.lives && _is_real_death(death_type))
    {
        mark_milestone("death", lowercase_first(se.long_kill_message()).c_str());

        you.deaths++;
        you.lives--;
        you.pending_revival = true;

        take_note(Note(NOTE_LOSE_LIFE, you.lives));

        stop_delay(true);

        // You wouldn't want to lose this accomplishment to a crash, would you?
        // Especially if you manage to trigger one via lua somehow...
        if (!crawl_state.disables[DIS_SAVE_CHECKPOINTS])
            save_game(false);

        canned_msg(MSG_YOU_DIE);
        xom_death_message((kill_method_type) se.get_death_type());
        more();

        if (death_type != KILLED_BY_ZOT)
            _place_player_corpse(death_type == KILLED_BY_DISINT);
        return;
    }

    if (!shared_fate && _is_real_death(death_type) && hermit_crab::break_shell(you))
    {
        mark_milestone("death", lowercase_first(se.long_kill_message()).c_str());
        you.deaths++;
        you.pending_revival = true;
        stop_delay(true);
        if (!crawl_state.disables[DIS_SAVE_CHECKPOINTS])
            save_game(false);
        mpr("Your shell breaks!");
        xom_death_message(death_type);
        return;
    }

    if (!shared_fate && party::is_enabled() && _is_real_death(death_type)
        && (party::prepare_survivor_for_death(party::active_slot())
            || party::try_last_stand_revive(party::active_slot())))
    {
        you.deaths++;
        stop_delay(true);
        if (death_type != KILLED_BY_ZOT)
            _place_player_corpse(death_type == KILLED_BY_DISINT);
        you.stop_directly_constricting_all(false);
        you.stop_being_constricted(true);
        you.clear_beholders();
        you.clear_fearmongers();
        if (!crawl_state.game_is_tutorial() && !crawl_state.game_is_arena())
            save_ghost(true);
        _append_chronicle_ghost(se, "downed_ghost", true);
        party::set_player_downed(party::active_slot(), true);
        stats_note_hero_downed(se);
        party::relocate_downed_ghost_to_survivor(party::active_slot());
        if (party::multiplayer_enabled())
            mprf(MSGCH_DANGER,
                 "%s has fallen! A surviving player can read a scroll of soul recall to resurrect them.",
                 you.your_name.c_str());
        else
            mprf(MSGCH_DANGER,
                 "%s has fallen! %s's ghost travels to haunt the surviving party until revived!",
                 you.your_name.c_str(), you.your_name.c_str());
        return;
    }

    // Prevent bogus notes.
    activate_notes(false);
    _print_endgame_messages(se);
    if (_is_real_death(death_type))
    {
        if (!crawl_state.game_is_tutorial() && !crawl_state.game_is_arena())
        {
            save_ghost(true);
            you.props["chronicle_bones_saved_turn"] = you.num_turns;
        }
        _append_chronicle_ghost(se, "permadeath_ghost", true);
    }
    end_game(se);
}

string morgue_name(string char_name, time_t when_crawl_got_even)
{
    string name = "morgue-" + char_name;

    string time = make_file_time(when_crawl_got_even);
    if (!time.empty())
        name += "-" + time;

    return name;
}

int actor_to_death_source(const actor* agent)
{
    return agent ? agent->mindex() : NON_MONSTER;
}

int timescale_damage(const actor *act, int damage)
{
    if (damage < 0)
        damage = 0;
    // Can we have a uniform player/monster speed system yet?
    if (act->is_player())
        return div_rand_round(damage * you.time_taken, BASELINE_DELAY);
    else
    {
        const monster *mons = act->as_monster();
        const int speed = mons->speed > 0? mons->speed : BASELINE_DELAY;
        return div_rand_round(damage * BASELINE_DELAY, speed);
    }
}
