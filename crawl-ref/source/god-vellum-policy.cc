#include "AppHdr.h"
#include "eldritch.h"
#include "god-vellum.h"

#include "artefact.h"
#include "art-enum.h"
#include "item-prop.h"
#include "item-name.h"
#include "items.h"
#include "invent.h"
#include "makeitem.h"
#include "player.h"
#include "religion.h"
#include "stringutil.h"

namespace vellum
{
bool active(const player& owner)
{
    return (owner.religion == GOD_VELLUM && !owner.penance[GOD_VELLUM])
        || (eldritch::has(owner, GOD_VELLUM) && !owner.duration[DUR_ELDER_UNRAVEL]);
}

int rank(const player& owner)
{
    if (eldritch::has(owner, GOD_VELLUM))
        return 6; // Echo eligibility is separately limited by one thread and its weight.
    const int peak = max(static_cast<int>(owner.piety_max[GOD_VELLUM]),
        owner.religion == GOD_VELLUM ? static_cast<int>(owner.raw_piety) : 0);
    int result = 0;
    for (int star = 0; star < 6; ++star)
        result += peak >= piety_breakpoint(star);
    return result;
}

int capacity(const player& owner)
{
    return eldritch::has(owner, GOD_VELLUM) ? 1 + eldritch::rank(owner)
        : min(maximum_capacity, 1 + rank(owner));
}

int minimum_rank(artefact_prop_type prop)
{
    switch (prop)
    {
    case ARTP_REGENERATION: case ARTP_ARCHMAGI:
    case ARTP_ENHANCE_CONJ: case ARTP_ENHANCE_HEXES: case ARTP_ENHANCE_SUMM:
    case ARTP_ENHANCE_NECRO: case ARTP_ENHANCE_TLOC: case ARTP_ENHANCE_FIRE:
    case ARTP_ENHANCE_ICE: case ARTP_ENHANCE_AIR: case ARTP_ENHANCE_EARTH:
    case ARTP_ENHANCE_ALCHEMY: case ARTP_ENHANCE_FORGECRAFT:
        return 3;
    default: return 1;
    }
}

int price(enchantment_transfer::effect magic)
{
    if (magic.kind == enchantment_transfer::effect_kind::unique_power)
        return magic.value > UNRAND_START && magic.value < UNRAND_LAST ? 6 : 0;
    if (magic.kind == enchantment_transfer::effect_kind::enchantment)
        return magic.type == ARTP_NUM_PROPERTIES && magic.value >= -32767
            && magic.value <= 32767 ? std::abs(magic.value) : 0;
    if (magic.kind != enchantment_transfer::effect_kind::property)
        return 0;
    if (!magic.value || magic.value < -32767 || magic.value > 32767
        || magic.type < 0 || magic.type >= ARTP_NUM_PROPERTIES || magic.type == ARTP_NO_UPGRADE
        || !artp_value_is_valid(magic.type, magic.value))
        return 0;
    const int value = std::abs(magic.value);
    // Removing a numeric drawback is worth the corresponding positive gain.
    // Neither the archive nor a recipient turns a drawback into free capacity.
    switch (magic.type)
    {
    case ARTP_STRENGTH: case ARTP_INTELLIGENCE: case ARTP_DEXTERITY:
        return (value + 1) / 2;
    case ARTP_FIRE: case ARTP_COLD: case ARTP_NEGATIVE_ENERGY:
    case ARTP_STEALTH: case ARTP_SLAYING: case ARTP_AC: case ARTP_SHIELDING:
        return value;
    case ARTP_WILLPOWER: case ARTP_EVASION: return 2 * value;
    case ARTP_POISON: case ARTP_ELECTRICITY: case ARTP_RCORR:
    case ARTP_RMUT: case ARTP_RAMPAGING: case ARTP_ACROBAT: return 2;
    case ARTP_MAGICAL_POWER: return (value + 3) / 4;
    case ARTP_HP: return (value + 4) / 5;
    case ARTP_PREVENT_SPELLCASTING: case ARTP_HARM: return 3;
    case ARTP_PREVENT_TELEPORTATION: case ARTP_CONTAM: case ARTP_DRAIN:
    case ARTP_SLOW: case ARTP_CORRODE: case ARTP_FRAGILE: case ARTP_BANE: return 2;
    case ARTP_ARCHMAGI: return 4;
    case ARTP_BRAND:
        if (magic.brand_class == OBJ_ARMOUR)
            return 3;
        return magic.value == SPWPN_SPEED || magic.value == SPWPN_DISTORTION ? 4 : 3;
    case ARTP_BASE_DAM: case ARTP_BASE_ACC: case ARTP_BASE_DELAY:
    case ARTP_BASE_ENCUMBRANCE: return 6;
    case ARTP_REGENERATION: case ARTP_MANA_REGENERATION:
    case ARTP_WIZARDRY: case ARTP_INVISIBLE: case ARTP_BLINK:
    case ARTP_CLARITY: case ARTP_RMSL: case ARTP_SILENCE:
    case ARTP_ENHANCE_CONJ: case ARTP_ENHANCE_HEXES: case ARTP_ENHANCE_SUMM:
    case ARTP_ENHANCE_NECRO: case ARTP_ENHANCE_TLOC: case ARTP_ENHANCE_FIRE:
    case ARTP_ENHANCE_ICE: case ARTP_ENHANCE_AIR: case ARTP_ENHANCE_EARTH:
    case ARTP_ENHANCE_ALCHEMY: case ARTP_ENHANCE_FORGECRAFT:
        return 3 * value;
    default: return value;
    }
}

std::string label(enchantment_transfer::effect magic)
{
    if (magic.kind == enchantment_transfer::effect_kind::unique_power)
        return "Unique power: " + std::string(get_unrand_entry(magic.value)->name);
    if (magic.kind == enchantment_transfer::effect_kind::enchantment)
        return make_stringf("Enchantment %+d", magic.value);
    if (magic.type < 0 || magic.type >= ARTP_NUM_PROPERTIES)
        return "Unknown enchantment";
    if (magic.type == ARTP_BRAND)
    {
        if (magic.brand_class == OBJ_ARMOUR)
        {
            item_def item;
            item.base_type = OBJ_ARMOUR;
            item.sub_type = ARM_ROBE;
            item.brand = magic.value;
            item.quantity = 1;
            return "Armour ego: " + std::string(armour_ego_name(item, false));
        }
        return brand_type_name(static_cast<brand_type>(magic.value), false);
    }
    return artp_name(magic.type) + (artp_value_type(magic.type) == ARTP_VAL_BOOL
        ? std::string() : make_stringf("%+d", magic.value));
}

int item_id(const item_def& item)
{
    return item.props.exists(ITEM_UNIQUE_ID) ? item.props[ITEM_UNIQUE_ID].get_int() : 0;
}

item_def* carried(int id)
{
    item_def* found = nullptr;
    if (id > 0)
        for (auto& item : you.inv)
            if (item.defined() && item_id(item) == id)
            {
                if (found)
                    return nullptr;
                found = &item;
            }
    return found;
}

int native_value(const item_def& item, artefact_prop_type prop)
{
    artefact_properties_t intrinsic;
    intrinsic.init(0);
    populate_item_intrinsic_artps(item, intrinsic);
    int result = intrinsic[prop];
    if (is_artefact(item))
        result += native_artefact_property(item, prop);
    if (item.base_type == OBJ_ARMOUR)
    {
        const auto ego = static_cast<special_armour_type>(is_artefact(item)
            ? native_artefact_property(item, ARTP_BRAND) : item.brand);
        if (ego_to_artprop(ego) == prop)
        {
            const bool stat = prop == ARTP_STRENGTH || prop == ARTP_INTELLIGENCE
                || prop == ARTP_DEXTERITY || prop == ARTP_AC;
            result += stat ? 3 : 1;
        }
        if (ego == SPARM_RESISTANCE && (prop == ARTP_FIRE || prop == ARTP_COLD))
            ++result;
    }
    return result;
}

namespace
{
bool item_class_allowed(const item_def& item)
{
    return item_type_is_equipment(item.base_type) || item.base_type == OBJ_TALISMANS;
}

std::string common_reason(const item_def& item)
{
    if (!item.defined() || !in_inventory(item) || !item_class_allowed(item))
        return "Choose carried equipment or a talisman.";
    if (item_id(item) <= 0 || carried(item_id(item)) != &item)
        return "This item needs a unique physical identity.";
    if (!item.is_identified())
        return "Identify the item first.";
    if (item.cursed() || item.summoned() || item_is_stationary(item))
        return "Cursed, summoned or fixed equipment cannot be altered.";
    if (is_unrandom_artefact(item) && rank(you) < 5)
        return "Named artifacts unlock at five earned stars.";
    return "";
}
}

int native_effect_value(const item_def& item, enchantment_transfer::effect magic)
{
    if (magic.kind == enchantment_transfer::effect_kind::enchantment)
        return native_item_enchantment(item);
    return magic.kind == enchantment_transfer::effect_kind::unique_power
        ? static_cast<int>(has_unrand_effect(item, magic.value)) : native_value(item, magic.type);
}

std::string masterwork_reason(const item_def& item)
{
    const auto common = common_reason(item);
    return !common.empty() ? common : is_artefact(item) ? "" : "Choose an artifact.";
}

std::string removal_reason(const enchantment_transfer::thread* thread)
{
    if (!thread || thread->target <= 0)
        return "";
    const auto* item = carried(thread->target);
    if (!item)
        return "";
    if (item->cursed())
        return "Cursed bindings cannot be altered.";
    const auto prop = thread->magic.type;
    if (thread->magic.kind == enchantment_transfer::effect_kind::property
        && item_is_equipped(*item) && (prop == ARTP_CONTAM || prop == ARTP_DRAIN
            || prop == ARTP_FRAGILE || prop == ARTP_BANE))
        return "Remove the old recipient first; its removal consequences still apply.";
    return "";
}

bool bindings_compatible(const item_def& item, const enchantment_transfer::ledger& state)
{
    artefact_properties_t props;
    props.init(0);
    if (is_artefact(item))
        artefact_properties(item, props);
    for (const auto& thread : state.threads)
        if (thread.target == item_id(item)
            && thread.magic.kind == enchantment_transfer::effect_kind::property)
            props[thread.magic.type] += enchantment_transfer::contribution(
                thread.magic, native_value(item, thread.magic.type));
    return artefact_properties_compatible(item, props);
}

std::string source_reason(const item_def& item, enchantment_transfer::effect magic)
{
    const auto common = common_reason(item);
    if (!common.empty())
        return common;
    if (eldritch::has(GOD_VELLUM)
        && (!is_random_artefact(item) || magic.kind != enchantment_transfer::effect_kind::property
            || magic.value <= 0 || enchantment_transfer::drawback(magic)
            || price(magic) > 1 + eldritch::rank()))
        return "Borrowed Thread needs a whole positive randart property within your rite weight limit.";
    if (!is_artefact(item) || !price(magic))
        return "Choose a nonzero artifact enchantment.";
    if (magic.kind == enchantment_transfer::effect_kind::enchantment)
    {
        if (rank(you) < 1 || (item.base_type != OBJ_WEAPONS && item.base_type != OBJ_ARMOUR))
            return "Weapon and armour enchantments unlock at one star.";
        return !item.props.exists("vellum_plus_depleted") && native_item_enchantment(item) == magic.value
            ? "" : "This enchantment level changed or was already extracted.";
    }
    if (magic.kind == enchantment_transfer::effect_kind::unique_power)
        return is_unrandom_artefact(item, magic.value) && native_power_enabled(item)
            ? "" : "This native unique power is no longer on the donor.";
    if (rank(you) < minimum_rank(magic.type))
        return "You have not earned this property's devotion milestone.";
    if (magic.type == ARTP_BRAND && magic.brand_class != item.base_type)
        return "This brand belongs to a different equipment family.";
    if (item_is_equipped(item) && (magic.type == ARTP_CONTAM || magic.type == ARTP_DRAIN
        || magic.type == ARTP_FRAGILE || magic.type == ARTP_BANE))
        return "Remove this item first; its native removal consequences still apply.";
    if (item.props.exists("vellum_depleted"))
        for (const auto& prop : item.props["vellum_depleted"].get_vector())
            if (prop.get_int() == magic.type)
                return "This source enchantment was already extracted.";
    if (native_artefact_property(item, magic.type) != magic.value)
        return "The source enchantment changed or was already extracted.";
    return "";
}

std::string recipient_reason(const item_def& item, enchantment_transfer::effect magic,
                             bool vessel)
{
    const auto common = common_reason(item);
    if (!common.empty())
        return common;
    if (eldritch::has(GOD_VELLUM) && !is_random_artefact(item))
        return "Borrowed Thread requires a compatible random artefact recipient.";
    if (!price(magic))
        return "This property is not transferable.";
    if (!is_artefact(item) && !vessel && load(you).vessel != item_id(item))
        return "Choose an artifact or designate this as your one apprentice vessel.";
    if (magic.kind == enchantment_transfer::effect_kind::enchantment)
        return is_artefact(item) && (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_ARMOUR)
            ? "" : "Enchantment levels require an artifact weapon or armour recipient.";
    if (magic.kind == enchantment_transfer::effect_kind::unique_power)
    {
        const auto* source = get_unrand_entry(magic.value);
        if (rank(you) < 5)
            return "Unique powers unlock at five earned stars.";
        if (item.base_type != source->base_type)
            return "This unique power requires the same equipment family.";
        item_def model;
        model.base_type = source->base_type;
        model.sub_type = source->sub_type;
        model.quantity = 1;
        if ((item.base_type == OBJ_WEAPONS && is_range_weapon(item) != is_range_weapon(model))
            || (item.base_type == OBJ_ARMOUR && get_armour_slot(item) != get_armour_slot(model))
            || (item.base_type == OBJ_JEWELLERY && jewellery_is_amulet(item) != jewellery_is_amulet(model)))
            return "This power needs a compatible attack type or equipment slot.";
        if (magic.value == UNRAND_WUCAD_MU
            && (item.sub_type != ARM_ORB || get_armour_ego_type(item) != SPARM_ENERGY))
            return "Mindtap needs an energy orb to trigger its native channelling effect.";
        return "";
    }
    if (!is_artefact(item) && magic.type != ARTP_STRENGTH && magic.type != ARTP_INTELLIGENCE
        && magic.type != ARTP_DEXTERITY && magic.type != ARTP_SEE_INVISIBLE)
        return "The apprentice vessel supports stats and sight; use an artifact for this enchantment.";
    if (item_is_equipped(item) && (magic.type == ARTP_CONTAM || magic.type == ARTP_DRAIN
        || magic.type == ARTP_FRAGILE || magic.type == ARTP_BANE))
        return "Remove this item before binding an enchantment with equip or removal consequences.";
    if (magic.type == ARTP_BRAND)
    {
        if (item.base_type != magic.brand_class)
            return "Brands and egos require a recipient from the same equipment family.";
        if (item.base_type == OBJ_WEAPONS && !is_weapon_brand_ok(item.sub_type, magic.value, true))
            return "This weapon type cannot use that brand.";
        if (item.base_type == OBJ_ARMOUR && !is_armour_brand_ok(item.sub_type, magic.value, true))
            return "This armour type cannot use that ego.";
    }
    if ((magic.type == ARTP_BASE_DAM || magic.type == ARTP_BASE_ACC || magic.type == ARTP_BASE_DELAY)
        && item.base_type != OBJ_WEAPONS)
        return "Weapon base modifiers require a weapon recipient.";
    if (magic.type == ARTP_BASE_ENCUMBRANCE && item.base_type != OBJ_ARMOUR)
        return "Encumbrance modifiers require an armour recipient.";
    if (!artefact_property_compatible(item, magic.type, magic.value, false))
        return "This property conflicts with the item's native placement rules or effects.";
    return "";
}
}
