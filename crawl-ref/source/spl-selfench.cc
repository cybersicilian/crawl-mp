/**
 * @file
 * @brief Self-enchantment spells.
**/

#include "AppHdr.h"
#include "coop-content.h"

#include "spl-selfench.h"

#include <cmath>

#include "act-iter.h"
#include "areas.h"
#include "auras.h"
#include "art-enum.h"
#include "coordit.h" // radius_iterator
#include "env.h"
#include "god-passive.h"
#include "hints.h"
#include "items.h" // stack_iterator
#include "libutil.h"
#include "message.h"
#include "output.h"
#include "party.h"
#include "player.h"
#include "prompt.h"
#include "religion.h"
#include "spl-other.h"
#include "spl-util.h"
#include "stringutil.h"
#include "terrain.h"
#include "transform.h"
#include "tilepick.h"
#include "view.h"

spret cast_deaths_door(int pow, bool fail)
{
    fail_check();
    mpr("You stand defiantly in death's doorway!");
    mprf(MSGCH_SOUND, "You seem to hear sand running through an hourglass...");

    you.set_duration(DUR_DEATHS_DOOR, 10 + random2avg(13, 3)
                                       + div_rand_round(random2(pow), 10));

    const int hp = max(div_rand_round(pow, 10), 1);
    you.attribute[ATTR_DEATHS_DOOR_HP] = hp;
    set_hp(hp);

    if (you.duration[DUR_DEATHS_DOOR] > 25 * BASELINE_DELAY)
        you.duration[DUR_DEATHS_DOOR] = (23 + random2(5)) * BASELINE_DELAY;
    return spret::success;
}

void remove_ice_armour()
{
    mprf(MSGCH_DURATION, "Your icy armour melts away.");
    you.redraw_armour_class = true;
    you.duration[DUR_ICY_ARMOUR] = 0;
}

spret ice_armour(int pow, bool fail)
{
    fail_check();

    if (you.duration[DUR_ICY_ARMOUR])
        mpr("Your icy armour thickens.");
    else
        mpr("A film of ice covers your body!");

    you.increase_duration(DUR_ICY_ARMOUR, random_range(40, 50), 50);
    you.props[ICY_ARMOUR_KEY] = pow;
    you.redraw_armour_class = true;

    return spret::success;
}

void fiery_armour()
{
    if (you.duration[DUR_FIERY_ARMOUR])
        mpr("Your cloak of flame flares fiercely!");
    else if (you.duration[DUR_ICY_ARMOUR] || player_icemail_armour_class())
    {
        mpr("A sizzling cloak of flame settles atop your icy armour.");
        // TODO: add corresponding inverse message for casting ozo's etc
        // while DUR_FIERY_ARMOUR is active (maybe..?)
    }
    else
        mpr("A protective cloak of flame settles atop you.");

    you.increase_duration(DUR_FIERY_ARMOUR, random_range(110, 140), 1500);
    you.redraw_armour_class = true;
}

spret cast_revivification(int /*pow*/, bool fail)
{
    fail_check();
    mpr("Your body is healed in an amazingly painful way.");

    // Full HP restoration with ZERO permanent max-HP loss.
    set_hp(you.hp_max);

    if (you.duration[DUR_DEATHS_DOOR])
    {
        mprf(MSGCH_DURATION, "Your life is in your own hands once again.");
        // XXX: better cause name?
        you.paralyse(&you, random_range(2, 5), "breaking free from death's doorway");
        you.duration[DUR_DEATHS_DOOR] = 0;
    }

    // Co-op: heal all living allies in sight to full HP and revive downed teammates
    // with 20% HP and no frail penalty.
    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && you.see_cell_no_trans(p.pos()))
            {
                party::heal_or_buff_party_member(i, p.hp_max, NUM_DURATIONS, 0);
                mprf(MSGCH_FRIEND_ACTION, "%s is invigorated by your revivification!",
                     p.your_name.c_str());
            }
        }
        party::revive_downed_players(false, 20);
    }

    // Instead of permanent max-HP rot, inflict temporary weakness and contamination.
    you.weaken(&you, 20 + random2(15));
    contaminate_player(random_range(700, 1100), true);

    return spret::success;
}

spret cast_swiftness(int power, bool fail)
{
    fail_check();

    you.set_duration(DUR_SWIFTNESS, 12 + random2(power)/2, 30,
                     "You feel quick.");
    you.attribute[ATTR_SWIFTNESS] = you.duration[DUR_SWIFTNESS];

    return spret::success;
}

spret cast_regeneration(int pow, bool fail)
{
    fail_check();

    const int dur = 20 + random2avg(pow / 2, 2);
    you.increase_duration(DUR_REGENERATION, dur, 100,
                          "Your skin crawls as your wounds begin to close rapidly.");

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && grid_distance(you.pos(), p.pos()) <= 4
                && you.see_cell_no_trans(p.pos()))
            {
                party::heal_or_buff_party_member(i, 0, DUR_REGENERATION, dur);
                mprf(MSGCH_FRIEND_ACTION, "%s begins regenerating rapidly.",
                     p.your_name.c_str());
            }
        }
    }

    return spret::success;
}

spret cast_deflect_missiles(int pow, bool fail)
{
    fail_check();

    const int dur = 15 + random2(pow) / 2;
    you.increase_duration(DUR_DEFLECT_MISSILES, dur, 100,
                          "You feel very safe from missiles.");

    return spret::success;
}

spret cast_shroud_of_golubria(int pow, bool fail)
{
    fail_check();

    const int dur = 20 + random2(pow);
    if (you.duration[DUR_SHROUD_OF_GOLUBRIA])
        mpr("You renew your shroud.");
    else
        mpr("Space distorts slightly along a thin shroud covering your body.");

    you.increase_duration(DUR_SHROUD_OF_GOLUBRIA, dur, 50);

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && grid_distance(you.pos(), p.pos()) <= 1)
            {
                party::heal_or_buff_party_member(i, 0, DUR_SHROUD_OF_GOLUBRIA, dur);
                mprf(MSGCH_FRIEND_ACTION,
                     "A thin shroud of distorted space covers %s.",
                     p.your_name.c_str());
            }
        }
    }

    return spret::success;
}

spret cast_song_of_slaying(int pow, bool fail)
{
    fail_check();

    if (you.duration[DUR_SONG_OF_SLAYING])
        mpr("You start a new song!");
    else
        mpr("You start singing a song of slaying.");

    const int dur = 20 + random2avg(pow, 2);
    you.set_duration(DUR_SONG_OF_SLAYING, dur, 100);
    you.props[SONG_OF_SLAYING_KEY] = 0;

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && you.see_cell_no_trans(p.pos()))
            {
                party::heal_or_buff_party_member(i, 0, DUR_SONG_OF_SLAYING, dur);
                p.props[SONG_OF_SLAYING_KEY] = 0;
            }
        }
    }

    return spret::success;
}

spret cast_phase_shift(int pow, bool fail)
{
    fail_check();

    const int dur = 16 + random2avg(pow / 2, 2);
    you.increase_duration(DUR_PHASE_SHIFT, dur, 80,
                          "You feel the strange sensation of being on two planes at once.");
    you.redraw_evasion = true;

    if (party::is_enabled())
    {
        const int ally_slot = party::nearest_living_ally_slot(you.pos(), 3);
        if (ally_slot >= 0)
        {
            const int ally_dur = max(6, dur / 2);
            party::heal_or_buff_party_member(ally_slot, 0, DUR_PHASE_SHIFT, ally_dur);
            party::get_player(ally_slot).redraw_evasion = true;
            mprf(MSGCH_FRIEND_ACTION, "%s shimmers into a partial phase shift!",
                 party::get_player(ally_slot).your_name.c_str());
        }
    }

    return spret::success;
}

spret cast_aegis_link(int pow, bool fail)
{
    if (!coop_content::has_spell_companion())
    {
        mpr("This spell needs a living companion in sight in a multiplayer game.");
        return spret::abort;
    }
    fail_check();

    const int dur = 18 + random2avg(pow / 2, 2);
    you.increase_duration(DUR_AEGIS_LINK, dur, 90,
                          "A linked ward folds around you and your companion.");
    you.redraw_armour_class = true;

    if (party::is_enabled())
    {
        const int ally_slot = party::nearest_living_ally_slot(you.pos(), LOS_RADIUS, party::active_slot());
        if (ally_slot >= 0)
        {
            party::heal_or_buff_party_member(ally_slot, 0, DUR_AEGIS_LINK, dur);
            party::get_player(ally_slot).redraw_armour_class = true;
            mprf(MSGCH_FRIEND_ACTION,
                 "Your ward links your defences and vitality with %s!",
                 party::get_player(ally_slot).your_name.c_str());
        }
    }

    return spret::success;
}

spret cast_ballad_of_the_vanguard(int pow, bool fail)
{
    if (!coop_content::has_spell_companion())
    {
        mpr("This spell needs a living companion in sight in a multiplayer game.");
        return spret::abort;
    }
    fail_check();

    if (you.duration[DUR_BALLAD_VANGUARD])
        mpr("You renew your companions' battle song.");
    else
        mpr("You sing to steady your companions' hands and steps.");

    const int dur = 18 + random2avg(pow / 2, 2);
    you.set_duration(DUR_BALLAD_VANGUARD, dur, 90);
    you.redraw_evasion = true;

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot() || !party::slot_is_alive(i)
                || party::is_player_downed(i) || !party::slot_is_on_current_floor(i))
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && you.see_cell_no_trans(p.pos()))
            {
                party::heal_or_buff_party_member(i, 0, DUR_BALLAD_VANGUARD, dur);
                p.redraw_evasion = true;
                mprf(MSGCH_FRIEND_ACTION,
                     "%s takes up your battle song!",
                     p.your_name.c_str());
            }
        }
    }

    return spret::success;
}

spret cast_sanctuary_chorus(int pow, bool fail)
{
    if (!coop_content::has_spell_companion())
    {
        mpr("This spell needs a living companion in sight in a multiplayer game.");
        return spret::abort;
    }
    fail_check();

    const int dur = 16 + random2avg(pow / 2, 2);
    you.increase_duration(DUR_SANCTUARY_CHORUS, dur, 90,
                          "A cleansing mist gathers around you.");
    you.duration[DUR_POISONING] = 0;
    you.duration[DUR_CORROSION] = 0;
    you.duration[DUR_SLOW] = 0;
    you.redraw_armour_class = true;

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot() || !party::slot_is_alive(i)
                || party::is_player_downed(i) || !party::slot_is_on_current_floor(i))
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && you.see_cell_no_trans(p.pos()))
            {
                p.duration[DUR_POISONING] = 0;
                p.duration[DUR_CORROSION] = 0;
                p.duration[DUR_SLOW] = 0;
                party::heal_or_buff_party_member(i, 0,
                                                 DUR_SANCTUARY_CHORUS, dur);
                p.redraw_armour_class = true;
                mprf(MSGCH_FRIEND_ACTION,
                     "The cleansing mist surrounds %s!",
                     p.your_name.c_str());
            }
        }
    }

    return spret::success;
}

spret cast_aura_spell(spell_type spell, int pow, bool fail)
{
    fail_check();

    const bool had_aura = you.duration[DUR_PALADIN_ZEAL] > 0
                          && you.props.exists("active_aura_spell");
    const int prev_spell = had_aura ? you.props["active_aura_spell"].get_int()
                                    : static_cast<int>(SPELL_NO_SPELL);

    you.props["active_aura_spell"] = static_cast<int>(spell);
    you.props["active_aura_pow"] = auras::clamp_power(pow);

    you.set_duration(DUR_PALADIN_ZEAL, auras::duration_turns(pow), 32);

    if (had_aura && prev_spell == static_cast<int>(spell))
        mprf(MSGCH_DURATION, "You renew your %s.", spell_title(spell));
    else if (had_aura)
        mprf(MSGCH_DURATION, "You shift your active aura stance to %s!", spell_title(spell));
    else
        mprf(MSGCH_DURATION, "You project %s!", spell_title(spell));

    you.redraw_armour_class = true;
    you.redraw_evasion = true;
    you.redraw_status_lights = true;

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (party::slot_is_alive(i) && party::slot_is_on_current_floor(i))
            {
                p.redraw_armour_class = true;
                p.redraw_evasion = true;
                p.redraw_status_lights = true;
            }
        }
    }

    return spret::success;
}

int cast_selective_amnesia(const string &pre_msg)
{
    if (you.spell_no == 0)
    {
        canned_msg(MSG_NO_SPELLS);
        return 0;
    }

    int keyin = 0;
    spell_type spell;
    int slot;

    // Pick a spell to forget.
    keyin = list_spells(false, false, false, false, "forget");
    redraw_screen();
    update_screen();

    if (isaalpha(keyin))
    {
        spell = get_spell_by_letter(keyin);
        slot = get_spell_slot_by_letter(keyin);

        const bool in_library = you.spell_library[spell];
        if (spell != SPELL_NO_SPELL)
        {
            const string prompt = make_stringf(
                    "Forget %s, freeing %d spell level%s for a total of %d?%s",
                    spell_title(spell), spell_levels_required(spell),
                    spell_levels_required(spell) != 1 ? "s" : "",
                    player_spell_levels(false) + spell_levels_required(spell),
                    in_library ? "" : " This spell is not in your library!");

            if (yesno(prompt.c_str(), in_library, 'n', false))
            {
                if (!pre_msg.empty())
                    mpr(pre_msg);
                del_spell_from_memory_by_slot(slot);
                return 1;
            }
        }
    }

    return -1;
}

spret cast_fugue_of_the_fallen(int pow, bool fail)
{
    fail_check();

    if (you.duration[DUR_FUGUE])
        mpr("You release your grip on the fallen and begin the cycle anew!");
    else
        mpr("You call out to the remnants of the fallen!");

    const int dur = 25 + random2avg(pow, 2);
    you.set_duration(DUR_FUGUE, dur);

    you.props[FUGUE_KEY] = 0;

    if (party::is_enabled())
    {
        for (int i = 0; i < party::player_count(); ++i)
        {
            if (i == party::active_slot())
                continue;
            player &p = party::get_player(i);
            if (p.hp > 0 && you.see_cell_no_trans(p.pos()))
            {
                party::heal_or_buff_party_member(i, 0, DUR_FUGUE, dur);
                p.props[FUGUE_KEY] = 0;
            }
        }
    }

    return spret::success;
}

void do_fugue_wail(const coord_def pos)
{
    // Do burst of negative energy damage around the spot that was hit by an
    // attack with max fugue stacks. Hit anything which isn't friendly and
    // immune to negative energy.
    vector <monster*> affected;
    for (adjacent_iterator ai(pos); ai; ++ai)
    {
        monster* mon = monster_at(*ai);
        if (mon && !mon->is_firewood() && !mon->wont_attack()
            && mon->res_negative_energy() < 3)
        {
            affected.push_back(mon);
        }
    }

    int pow = calc_spell_power(SPELL_FUGUE_OF_THE_FALLEN);

    if (!affected.empty())
        mpr("The fallen lash out in pain!");
    for (monster *m : affected)
    {
        if (m->alive())
        {
            m->hurt(&you, roll_dice(2, 3 + div_rand_round(pow, 25)),
                    BEAM_NEG, KILLED_BY_BEAM);
        }
    }
}

int silence_min_range(int pow)
{
    return shrinking_aoe_range(min(100, (20 + pow/5)) * BASELINE_DELAY);
}

int silence_max_range(int pow)
{
    return shrinking_aoe_range(min(100, (20 + pow/5 + pow/2)) * BASELINE_DELAY);
}

spret cast_silence(int pow, bool fail)
{
    fail_check();
    mpr("A profound silence engulfs you.");

    you.increase_duration(DUR_SILENCE, 20 + div_rand_round(pow,5)
                            + random2avg(div_rand_round(pow,2), 2), 100);
    invalidate_agrid();

    learned_something_new(HINT_YOU_SILENCE);
    return spret::success;
}

int liquefaction_max_range(int pow)
{
    return shrinking_aoe_range((9 + pow) * BASELINE_DELAY);
}

spret cast_liquefaction(int pow, bool fail)
{
    fail_check();
    int power = 15 + random2avg(pow, 2);
    int l_radius = isqrt(max(0, min(3 * (power - 5) / 4, 25)));

    // Collect appearance spaces, then flash multiple colours over them.
    vector<coord_def> flash;
    for (radius_iterator ri(you.pos(), l_radius, C_SQUARE, LOS_NO_TRANS, true); ri; ++ri)
    {
        if (*ri == you.pos() || feat_has_solid_floor(env.grid(*ri)) &&
                                !feat_is_shallow_water((env.grid(*ri))))
        {
            flash.push_back(*ri);
        }
    }

    for (int i = 0; i < 3; i++)
    {
        tileidx_t tile = i == 1 ? TILE_BOLT_LIQUEFY_GREEN : TILE_BOLT_LIQUEFY_BROWN;
        colour_t col = i == 1 ? YELLOW : BROWN;
        for (coord_def animate : flash)
            flash_tile(animate, col, 0, tile);
        animation_delay(i < 2 ? 75 : 140, true);
    }

    mpr("The ground around you becomes liquefied!");

    you.increase_duration(DUR_LIQUEFYING, power, 100);
    invalidate_agrid();
    return spret::success;
}

// Is there at least one valid hostile thing in sight?
bool jinxbite_targets_available()
{
    for (monster_near_iterator mi(&you, LOS_NO_TRANS, true); mi; ++mi)
    {
        if (mons_is_threatening(**mi) && !mi->wont_attack()
            && mi->willpower() != WILL_INVULN)
        {
            return true;
        }
    }

    return false;
}

spret cast_jinxbite(int pow, bool fail)
{
    if (!jinxbite_targets_available())
    {
        mpr("There is nobody nearby that the sprites are interested in.");
        return spret::abort;
    }

    fail_check();

    mprf("You beckon %s vexing sprites to accompany your attacks.",
         you.duration[DUR_JINXBITE] ? "more" : "some");

    const int base_dur = random_range(9, 15);
    const int will_dur = random_range(base_dur, 15) +
                         div_rand_round(spell_power_cap(SPELL_JINXBITE), 4);

    you.increase_duration(DUR_JINXBITE, base_dur + div_rand_round(pow, 4), 28);
    you.increase_duration(DUR_LOWERED_WL, will_dur, 28,
                          "You feel your willpower being sapped.");

    return spret::success;
}

spret cast_confusing_touch(int power, bool fail)
{
    fail_check();
    msg::stream << you.hands_act("begin", "to glow ")
                << (you.duration[DUR_CONFUSING_TOUCH] ? "brighter" : "red")
                << "." << endl;

    you.set_duration(DUR_CONFUSING_TOUCH,
                     max(10 + div_rand_round(random2(1 + power), 5),
                         you.duration[DUR_CONFUSING_TOUCH]),
                     20, nullptr);
    you.props[CONFUSING_TOUCH_KEY] = power;

    return spret::success;
}

spret cast_detonation_catalyst(bool fail)
{
    fail_check();

    mpr("You ready an explosive catalyst.");

    // base duration is very low to minimize precasting
    you.set_duration(DUR_DETONATION_CATALYST, random_range(3,5));

    return spret::success;
}
