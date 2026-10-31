#include "AppHdr.h"

#include "elemental-weapon.h"

#include "actor.h"
#include "artefact.h"
#include "item-name.h"
#include "item-prop.h"
#include "message.h"
#include "player.h"
#include "random.h"
#include "skills.h"
#include "spl-util.h"
#include "stringutil.h"

namespace elemental_weapon
{
namespace
{
const char* const SLOT = "elemental_weapon_slot";
const char* const BRAND = "elemental_weapon_brand";
const char* const BONUS = "elemental_weapon_bonus";

bool matches(const player& owner, const item_def* item)
{
    if (!item || !owner.duration[DUR_ELEMENTAL_WEAPON]
        || !owner.props.exists(SLOT))
        return false;
    const int slot = owner.props[SLOT].get_int();
    return slot >= 0 && slot < ENDOFPACK && item == &owner.inv[slot];
}
}

spret cast(int power, bool fail)
{
    item_def* weapon = you.weapon();
    if (!weapon || weapon->base_type != OBJ_WEAPONS || is_artefact(*weapon)
        || get_weapon_brand(*weapon) != SPWPN_NORMAL)
    {
        mpr("You must wield an ordinary, unbranded weapon.");
        return spret::abort;
    }
    fail_check();
    if (!matches(you, weapon))
    {
        end();
        you.props[SLOT] = static_cast<int>(weapon->link);
        you.props[BRAND] = static_cast<int>(SPWPN_NORMAL);
        you.props[BONUS] = 0;
        mpr("You attune your weapon to the elements.");
    }
    else
        mpr("You extend your weapon's elemental attunement.");
    you.increase_duration(DUR_ELEMENTAL_WEAPON,
                          8 + roll_dice(2, max(1, power)), 100);
    you.wield_change = true;
    return spret::success;
}

void on_spell_cast(spell_type spell)
{
    item_def* weapon = you.weapon();
    if (!matches(you, weapon) || spell == SPELL_ELEMENTAL_WEAPON)
        return;
    if (is_artefact(*weapon) || get_weapon_brand(*weapon) != SPWPN_NORMAL)
    {
        end();
        return;
    }
    const auto disciplines = get_spell_disciplines(spell);
    vector<pair<brand_type, skill_type>> choices;
    if (disciplines & spschool::fire)
        choices.emplace_back(SPWPN_FLAMING, SK_FIRE_MAGIC);
    if (disciplines & spschool::ice)
        choices.emplace_back(SPWPN_FREEZING, SK_ICE_MAGIC);
    if (disciplines & spschool::air)
        choices.emplace_back(SPWPN_ELECTROCUTION, SK_AIR_MAGIC);
    if (disciplines & spschool::earth)
        choices.emplace_back(SPWPN_HEAVY, SK_EARTH_MAGIC);
    if (choices.empty())
        return;
    const auto chosen = choices[random2(choices.size())];
    you.props[BRAND] = static_cast<int>(chosen.first);
    you.props[BONUS] = you.skills[chosen.second] / 3;
    you.wield_change = true;
    mprf("%s resonates with your spell's elemental power.",
         weapon->name(DESC_YOUR).c_str());
}

void on_unequip(const item_def& item)
{
    if (matches(you, &item))
    {
        end();
        mpr("Your weapon's elemental attunement ends.");
    }
}

void end()
{
    you.duration[DUR_ELEMENTAL_WEAPON] = 0;
    you.props.erase(SLOT);
    you.props.erase(BRAND);
    you.props.erase(BONUS);
    you.wield_change = true;
}

brand_type brand(const actor& owner, const item_def* item)
{
    if (!owner.is_player())
        return SPWPN_NORMAL;
    const player& p = *owner.as_player();
    if (!matches(p, item) || is_artefact(*item)
        || get_weapon_brand(*item) != SPWPN_NORMAL || !p.props.exists(BRAND))
        return SPWPN_NORMAL;
    return static_cast<brand_type>(p.props[BRAND].get_int());
}

int damage_bonus(const actor& owner, const item_def* item)
{
    if (!owner.is_player())
        return 0;
    const player& p = *owner.as_player();
    return matches(p, item) && !is_artefact(*item)
           && get_weapon_brand(*item) == SPWPN_NORMAL && p.props.exists(BONUS)
           ? p.props[BONUS].get_int() : 0;
}

std::string description(const player& owner, const item_def& item)
{
    if (!matches(owner, &item))
        return "";
    const brand_type current = brand(owner, &item);
    if (current == SPWPN_NORMAL)
        return "This weapon is attuned to elemental spells.";
    return make_stringf("Elemental attunement: %s, +%d weapon damage.",
                        brand_type_name(current, false),
                        damage_bonus(owner, &item));
}
}
