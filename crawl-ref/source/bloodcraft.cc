#include "AppHdr.h"
#include "bloodcraft.h"

#include "art-enum.h"
#include "message.h"
#include "player.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"
#include "unwind.h"

namespace bloodcraft
{
static spell_type amplified_spell = SPELL_NO_SPELL;

bool is_rite(spell_type spell)
{
    return spell == SPELL_KINDLED_VEINS || spell == SPELL_WINTERS_DUE
        || spell == SPELL_BORROWED_THUNDER;
}

bool is_curse(spell_type spell)
{
    return spell == SPELL_SCARLET_FETTERS || spell == SPELL_STOLEN_SIGHT;
}

bool amplified(spell_type spell)
{
    return is_curse(spell) && spell == amplified_spell;
}

int extra_mp(spell_type spell) { return amplified(spell) ? 2 : 0; }
int amplified_mana(spell_type spell)
{
    unwind_var<spell_type> mode(amplified_spell, spell);
    return spell_mana(spell);
}
int reservation(int hp) { return max(2, (12 * hp + 99) / 100); }
int amplification_cost(int hp) { return max(2, (6 * hp + 99) / 100); }
static int player_blood_cost(int cost)
{
    return you.species == SP_IRIT ? (3 * cost + 3) / 4 : cost;
}
int player_reservation(int hp) { return player_blood_cost(reservation(hp)); }
int player_amplification_cost(int hp) { return player_blood_cost(amplification_cost(hp)); }
int rite_die(int power) { return 3 + max(0, min(200, power)) / 20; }
int curse_range(int power) { return min(7, 4 + max(0, power) / 50); }
int binding_duration(int power, bool amplify)
{
    return 10 + max(0, min(200, power)) / 10 + (amplify ? 20 : 0);
}
int sight_duration(int power, bool amplify)
{
    return 30 + max(0, min(200, power)) / 5 + (amplify ? 20 : 0);
}
int sight_penalty(int power) { return 15 + max(0, min(200, power)) / 20; }

spell_type active_rite()
{
    if (!you.props.exists(rite_key))
        return SPELL_NO_SPELL;
    const auto spell = static_cast<spell_type>(you.props[rite_key].get_int());
    return is_rite(spell) ? spell : SPELL_NO_SPELL;
}

int unreserved_hp() { return get_real_hp(true, true, false); }

int reserved_hp(int hp)
{
    return active_rite() == SPELL_NO_SPELL ? 0 : min(hp - 1, player_reservation(hp));
}

std::string casting_reason(spell_type spell)
{
    if (!is_rite(spell) && !amplified(spell))
        return "";
    if (you.duration[DUR_DEATHS_DOOR])
        return "you cannot commit life while functionally dead.";
    if (spell == active_rite())
        return "that rite is already active.";

    const int hp = amplified(spell) ? player_amplification_cost(unreserved_hp())
        : active_rite() == SPELL_NO_SPELL ? player_reservation(unreserved_hp()) : 0;
    const int mana = spell_mana(spell);
    const int casting_hp = (you.has_mutation(MUT_HP_CASTING) ? mana : 0)
        + (you.unrand_equipped(UNRAND_MAJIN) ? mana : 0)
        + spell_additional_hp(spell, mana);
    if (you.hp <= hp + casting_hp)
        return "you do not have enough health to pay the complete blood cost.";
    return "";
}

std::string cost_description(spell_type spell, bool amplify)
{
    const bool hp_casting = you.has_mutation(MUT_HP_CASTING);
    const char* resource = hp_casting ? "HP" : "MP";
    const int normal_mana = spell_mana(spell) - extra_mp(spell);
    if (is_rite(spell))
        return make_stringf("%d %s%s; %d HP reserved on activation; "
            "switching keeps the reservation; dismissal never heals",
            normal_mana, resource,
            spell_additional_hp(spell, normal_mana)
                ? make_stringf(" + %d HP", spell_additional_hp(spell, normal_mana)).c_str() : "",
            player_reservation(unreserved_hp()));
    if (is_curse(spell))
    {
        const int mana = amplified_mana(spell);
        const int blood = player_amplification_cost(unreserved_hp());
        const int extra_hp = spell_additional_hp(spell, mana);
        const string price = hp_casting
            ? make_stringf("%d HP (%d casting + %d amplification)", mana + extra_hp + blood, mana + extra_hp, blood)
            : make_stringf("%d MP + %d HP (%d casting + %d amplification)", mana, extra_hp + blood, extra_hp, blood);
        const int normal_extra = spell_additional_hp(spell, normal_mana);
        return amplify ? price : make_stringf("%d %s%s; amplification: %s",
            normal_mana, resource, normal_extra
                ? make_stringf(" + %d HP", normal_extra).c_str() : "", price.c_str());
    }
    return "";
}

std::string effect_description(spell_type spell, bool amplify)
{
    const int power = calc_spell_power(spell);
    if (is_rite(spell))
        return make_stringf("Current power: 1d%d bonus damage per 10 aut of "
            "weapon attack time, shared across all targets hit.", rite_die(power));
    if (spell == SPELL_SCARLET_FETTERS)
        return make_stringf("Current power: range %d; %.1f turns bound%s. "
            "Attacking and casting remain possible. Rebinding has a 3-turn recovery.",
            curse_range(power), binding_duration(power, amplify) / 10.0,
            amplify ? " and dimensionally anchored" : " on a failed Willpower check");
    if (spell == SPELL_STOLEN_SIGHT)
        return make_stringf("Current power: range %d; %d%% accuracy reduction "
            "for %.1f turns%s.", curse_range(power), sight_penalty(power),
            sight_duration(power, amplify) / 10.0,
            amplify ? "; also attempts full blindness" : "; no Willpower check");
    return "";
}

spret cast_rite(spell_type spell, bool fail)
{
    if (you.duration[DUR_DEATHS_DOOR] || active_rite() == spell)
        return spret::abort;
    const int cost = active_rite() == SPELL_NO_SPELL
        ? player_reservation(unreserved_hp()) : 0;
    if (cost && !enough_hp(cost, false))
        return spret::abort;
    fail_check();
    if (cost)
        pay_hp(cost);
    you.props[rite_key] = static_cast<int>(spell);
    // Reservation changes never proportionally rescale current HP.
    calc_hp(false);
    you.redraw_hit_points = true;
    you.redraw_status_lights = true;
    mprf("You invoke %s, committing %d HP to your weapon strikes.",
         spell_title(spell), reserved_hp(unreserved_hp()));
    return spret::success;
}

void dismiss_rite(bool quiet)
{
    if (active_rite() == SPELL_NO_SPELL)
        return;
    you.props.erase(rite_key);
    calc_hp(false);
    you.redraw_hit_points = true;
    you.redraw_status_lights = true;
    if (!quiet)
        mpr("You release your rite. Your health capacity returns, without healing.");
}

spret cast_amplified(spell_type spell, dist* target)
{
    if (!is_curse(spell) || !you.has_spell(spell))
        return spret::abort;
    unwind_var<spell_type> mode(amplified_spell, spell);
    return cast_a_spell(false, spell, target);
}

void forget_spell(spell_type spell)
{
    if (active_rite() == spell)
        dismiss_rite(true);
    if (is_curse(spell))
        clear_curses();
}
}
