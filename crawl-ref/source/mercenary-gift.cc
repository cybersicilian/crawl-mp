#include "AppHdr.h"

#include "mercenary-gift.h"

#include <optional>

#include "act-iter.h"
#include "artefact.h"
#include "coord.h"
#include "directn.h"
#include "env.h"
#include "god-item.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "mercenary-transit.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "terrain.h"

namespace mercenary
{
namespace
{
bool is_witch(monster_type type)
{
    return type == MONS_MERC_WITCH || type == MONS_MERC_SORCERESS
           || type == MONS_MERC_ELEMENTALIST;
}

bool is_skald(monster_type type)
{
    return type == MONS_MERC_SKALD || type == MONS_MERC_INFUSER
           || type == MONS_MERC_TIDEHUNTER;
}

bool is_brigand(monster_type type)
{
    return type == MONS_MERC_BRIGAND || type == MONS_MERC_ASSASSIN
           || type == MONS_MERC_CLEANER;
}

bool is_shaman(monster_type type)
{
    return type == MONS_MERC_SHAMAN || type == MONS_MERC_SHAMAN_II
           || type == MONS_MERC_SHAMAN_III;
}

int armour_limit(monster_type type)
{
    if (is_witch(type))
        return 0;
    if (is_skald(type) || is_brigand(type) || type == MONS_MERC_SHAMAN)
        return 4;
    if (type == MONS_MERC_SHAMAN_II)
        return 11;
    if (type == MONS_MERC_SHAMAN_III || type == MONS_MERC_FIGHTER)
        return 15;
    if (type == MONS_MERC_KNIGHT)
        return 18;
    return 100;
}

bool shield_allowed(monster_type type, const item_def& shield)
{
    if (is_witch(type) || is_brigand(type))
        return false;
    if (is_skald(type) || type == MONS_MERC_SHAMAN)
        return shield.sub_type == ARM_BUCKLER;
    if (type == MONS_MERC_FIGHTER || type == MONS_MERC_KNIGHT
        || type == MONS_MERC_SHAMAN_II)
        return shield.sub_type != ARM_TOWER_SHIELD;
    return true;
}

// A staff supplies the spell school, while the hire's rank controls power.
// Keep this as a value until the equipment transfer commits.
std::optional<monster_spells> staff_spells(monster_type type,
                                          const item_def& staff)
{
    if (!is_witch(type) || staff.base_type != OBJ_STAVES)
        return std::nullopt;
    const int tier = type == MONS_MERC_WITCH ? 0
                   : type == MONS_MERC_SORCERESS ? 1 : 2;
    spell_type chosen = SPELL_NO_SPELL;
    switch (staff.sub_type)
    {
    case STAFF_FIRE:
        chosen = tier == 0 ? SPELL_THROW_FLAME
               : tier == 1 ? SPELL_BOLT_OF_FIRE : SPELL_FIREBALL;
        break;
    case STAFF_COLD:
        chosen = tier == 0 ? SPELL_THROW_FROST
               : tier == 1 ? SPELL_BOLT_OF_COLD : SPELL_FREEZING_CLOUD;
        break;
    case STAFF_AIR:
        chosen = tier == 0 ? SPELL_SHOCK
               : tier == 1 ? SPELL_LIGHTNING_BOLT : SPELL_CHAIN_LIGHTNING;
        break;
    case STAFF_EARTH:
        chosen = tier == 0 ? SPELL_SANDBLAST
               : tier == 1 ? SPELL_STONE_ARROW : SPELL_IRON_SHOT;
        break;
    case STAFF_ALCHEMY:
        chosen = tier == 0 ? SPELL_STING
               : tier == 1 ? SPELL_VENOM_BOLT : SPELL_POISON_ARROW;
        break;
    case STAFF_NECROMANCY:
        chosen = tier == 0 ? SPELL_PAIN
               : tier == 1 ? SPELL_AGONY : SPELL_DISPEL_UNDEAD_RANGE;
        break;
    case STAFF_CONJURATION:
        chosen = tier == 0 ? SPELL_MAGIC_DART
               : tier == 1 ? SPELL_FORCE_LANCE : SPELL_IRON_SHOT;
        break;
    default:
        return std::nullopt;
    }
    return monster_spells{{chosen, 50, MON_SPELL_WIZARD}};
}

mon_inv_type gift_slot(const monster& hire, const item_def& item)
{
    if (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
    {
        const item_def* current = hire.mslot_item(MSLOT_WEAPON);
        if (current && is_range_weapon(item) != is_range_weapon(*current))
            return MSLOT_ALT_WEAPON;
        return MSLOT_WEAPON;
    }
    if (item.base_type == OBJ_MISSILES)
        return MSLOT_MISSILE;
    if (item.base_type == OBJ_ARMOUR)
    {
        if (is_shield(item))
            return MSLOT_SHIELD;
        return get_armour_slot(item) == SLOT_BODY_ARMOUR ? MSLOT_ARMOUR
                                                        : MSLOT_AUX_ARMOUR;
    }
    return NUM_MONSTER_SLOTS;
}
}

bool refresh_witch_spells(monster& hire, const item_def& staff)
{
    const auto spells = staff_spells(hire.type, staff);
    if (!spells)
        return false;
    hire.spells = *spells;
    hire.props[CUSTOM_SPELLS_KEY] = true;
    return true;
}

bool can_receive_item(const monster& hire, const item_def& item)
{
    if (!hire.alive() || !hire.friendly() || !mercenary_owned_by(hire, you)
        || !item.defined() || item_is_equipped(item) || item.cursed())
        return false;
    const mon_inv_type slot = gift_slot(hire, item);
    if (slot == NUM_MONSTER_SLOTS)
        return false;
    if (const item_def* old = hire.mslot_item(slot))
        if (old->cursed() || old->summoned()
            || feat_eliminates_items(env.grid(hire.pos())))
            return false;
    if (slot == MSLOT_MISSILE && (!hire.can_use_missile(item)
                                  || hire.mslot_item(slot)))
        return false;
    if (item.base_type == OBJ_ARMOUR
        && !check_armour_size(item, hire.body_size(PSIZE_TORSO)))
        return false;
    if (item.base_type == OBJ_ARMOUR
        && get_armour_slot(item) == SLOT_BODY_ARMOUR
        && -property(item, PARM_EVASION) / 10 > armour_limit(hire.type))
        return false;
    if ((is_witch(hire.type) || is_skald(hire.type) || is_shaman(hire.type))
        && ((is_artefact(item)
             && artefact_property(item, ARTP_PREVENT_SPELLCASTING))
            || (item.base_type == OBJ_WEAPONS
                && get_weapon_brand(item) == SPWPN_ANTIMAGIC)))
        return false;
    if (is_brigand(hire.type) && is_artefact(item)
        && (artefact_property(item, ARTP_STEALTH) < 0
            || artefact_property(item, ARTP_ANGRY)
            || artefact_property(item, ARTP_NOISE)
#if TAG_MAJOR_VERSION == 34
            || artefact_property(item, ARTP_CAUSE_TELEPORTATION)
#endif
            ))
        return false;
    if (is_witch(hire.type))
    {
        if (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
        {
            if (!staff_spells(hire.type, item))
                return false;
        }
    }
    if ((item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
        && (!hire.could_wield(item)
            || (is_skald(hire.type) && !is_range_weapon(item)
                && item_attack_skill(item) != SK_POLEARMS)
            || (is_brigand(hire.type) && !is_range_weapon(item)
                && item_attack_skill(item) != SK_SHORT_BLADES)))
        return false;
    if (item.base_type == OBJ_WEAPONS && is_range_weapon(item))
    {
        if (!is_shaman(hire.type))
            return false;
        if (hire.type == MONS_MERC_SHAMAN && item.sub_type != WPN_SLING)
            return false;
        if (hire.type == MONS_MERC_SHAMAN_II
            && item.sub_type != WPN_SLING && item.sub_type != WPN_SHORTBOW
            && item.sub_type != WPN_HAND_CANNON)
            return false;
    }
    if (is_shield(item))
    {
        if (!shield_allowed(hire.type, item))
            return false;
        for (const mon_inv_type s : {MSLOT_WEAPON, MSLOT_ALT_WEAPON})
            if (const item_def* weapon = hire.mslot_item(s))
                if (hire.hands_reqd(*weapon) == HANDS_TWO)
                    return false;
    }
    if ((slot == MSLOT_WEAPON || slot == MSLOT_ALT_WEAPON)
        && hire.hands_reqd(item) == HANDS_TWO && hire.mslot_item(MSLOT_SHIELD))
        return false;
    if ((hire.type == MONS_MERC_DEATH_KNIGHT && is_holy_item(item))
        || (hire.type == MONS_MERC_PALADIN && is_evil_item(item)))
        return false;
    return true;
}

bool give_item(monster& hire, int inventory_slot)
{
    if (inventory_slot < 0 || inventory_slot >= ENDOFPACK)
        return false;
    item_def& item = you.inv[inventory_slot];
    if (!can_receive_item(hire, item))
    {
        mpr("That item cannot be given to this mercenary.");
        return false;
    }
    const mon_inv_type slot = gift_slot(hire, item);
    // Preflight above rejects every case where take_item could drop a shield,
    // destroy replaced equipment, or lose the original on cancellation.
    item_def* transferred = hire.take_item(inventory_slot, slot);
    if (!transferred)
    {
        mpr("There is no room to transfer that item.");
        return false;
    }
    if (is_witch(hire.type) && transferred->base_type == OBJ_STAVES)
        refresh_witch_spells(hire, *transferred);
    mprf("You give %s to %s.", transferred->name(DESC_A).c_str(),
         hire.name(DESC_THE).c_str());
    return true;
}

bool can_give_item()
{
    for (monster_near_iterator it(you.pos(), LOS_NO_TRANS); it; ++it)
        if (it->alive() && it->friendly() && it->visible_to(&you)
            && mercenary_owned_by(**it, you))
            return true;
    return false;
}

bool prompt_gift()
{
    dist target;
    direction_chooser_args args;
    args.restricts = DIR_TARGET;
    args.mode = TARG_FRIEND;
    args.range = LOS_RADIUS;
    args.top_prompt = "Give equipment to which mercenary?";
    args.self = confirm_prompt_type::cancel;
    direction(target, args);
    if (!target.isValid)
        return false;
    monster* hire = monster_at(target.target);
    if (!hire || !hire->visible_to(&you) || !mercenary_owned_by(*hire, you))
    {
        mpr("That is not one of your mercenaries.");
        return false;
    }
    const int slot = prompt_invent_item("Give which item?", menu_type::invlist,
                                        OSEL_ANY, OPER_ANY);
    return !prompt_failed(slot) && give_item(*hire, slot);
}
}
