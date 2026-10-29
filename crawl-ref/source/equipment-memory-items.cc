#include "AppHdr.h"
#include "god-vellum.h"
#include "equipment-memory-items.h"
#include "artefact.h"
#include "item-prop.h"
#include "item-def.h"
#include "item-name.h"
#include "fight.h"

namespace equipment_memory
{
bool item_family(const item_def& item, family& result)
{
    switch (item.base_type)
    {
    case OBJ_WEAPONS: case OBJ_STAVES: result = family::weapon; return true;
    case OBJ_ARMOUR: result = is_shield(item) ? family::shield : family::armour; return true;
    case OBJ_JEWELLERY: result = jewellery_is_amulet(item) ? family::amulet : family::ring; return true;
    case OBJ_TALISMANS: result = family::talisman; return true;
    case OBJ_GIZMOS: result = family::gizmo; return true;
    default: return false;
    }
}
base_profile intrinsic_profile(const item_def& original)
{
    // A detached value has no owner's borrowed bindings. This also keeps base
    // damage, reach and unique-trait queries from harvesting another god's gift.
    const item_def item = original;
    family group = family::weapon;
    if (!item_family(item, group)) return { group, {} };
    base_profile result = { group, {} };
    const auto native = [&](object_class_type item_class, int subtype, bool ego = false) {
        result.properties.push_back({ ARTP_NUM_PROPERTIES, 1, weapon_trait::none,
                                      { item_class, subtype, ego ? native_kind::ego : native_kind::item } });
    };
    const auto add = [&](artefact_prop_type type, int value) {
        if (value <= 0) return;
        for (auto& existing : result.properties)
            if (existing.trait == weapon_trait::none && existing.type == type)
            {
                if (type == ARTP_BRAND) existing.value = value;
                else existing.value += value;
                return;
            }
        result.properties.push_back({ type, value });
    };
    // Read only native source properties. Never call the owner's projection.
    if (is_artefact(item))
        for (int prop = 0; prop < ART_PROPERTIES; ++prop)
            if (!is_unrandom_artefact(item) || (prop != ARTP_BASE_DAM && prop != ARTP_BASE_ACC))
                add(static_cast<artefact_prop_type>(prop), native_artefact_property(item, static_cast<artefact_prop_type>(prop)));
    artefact_properties_t intrinsic;
    intrinsic.init(0);
    populate_item_intrinsic_artps(item, intrinsic);
    for (int prop = 0; prop < ART_PROPERTIES; ++prop)
        add(static_cast<artefact_prop_type>(prop), intrinsic[prop]);
    if (is_weapon(item))
    {
        add(ARTP_SLAYING, item.plus);
        add(ARTP_BASE_DAM, ::property(item, PWPN_DAMAGE));
        add(ARTP_BASE_ACC, ::property(item, PWPN_HIT));
        if (weapon_cleaves(item)) result.properties.push_back({ ARTP_NUM_PROPERTIES, 1, weapon_trait::cleaving });
        if (weapon_reach(item) > 1)
            result.properties.push_back({ ARTP_NUM_PROPERTIES, weapon_reach(item), weapon_trait::reaching });
        if (is_melee_weapon(item) && weapon_hits_per_swing(item) > 1)
            result.properties.push_back({ ARTP_NUM_PROPERTIES, weapon_hits_per_swing(item), weapon_trait::multihit });
        add(ARTP_BRAND, is_artefact(item) ? native_artefact_property(item, ARTP_BRAND)
                                       : get_weapon_brand(item));
    }
    if (item.base_type == OBJ_ARMOUR)
    {
        add(is_shield(item) ? ARTP_SHIELDING : ARTP_AC, ::property(item, PARM_AC) + item.plus);
        switch (get_armour_ego_type(item))
        {
        case SPARM_POISON_RESISTANCE: add(ARTP_POISON, 1); break;
        case SPARM_CORROSION_RESISTANCE: add(ARTP_RCORR, 1); break;
        case SPARM_FIRE_RESISTANCE: add(ARTP_FIRE, 1); break;
        case SPARM_COLD_RESISTANCE: add(ARTP_COLD, 1); break;
        case SPARM_RESISTANCE: add(ARTP_FIRE, 1); add(ARTP_COLD, 1); break;
        case SPARM_STRENGTH: add(ARTP_STRENGTH, 3); break;
        case SPARM_DEXTERITY: add(ARTP_DEXTERITY, 3); break;
        case SPARM_INTELLIGENCE: add(ARTP_INTELLIGENCE, 3); break;
        case SPARM_WILLPOWER: add(ARTP_WILLPOWER, 1); break;
        case SPARM_SEE_INVISIBLE: add(ARTP_SEE_INVISIBLE, 1); break;
        case SPARM_PROTECTION: add(ARTP_AC, 3); break;
        case SPARM_NORMAL: break;
        default: native(OBJ_ARMOUR, get_armour_ego_type(item), true); break;
        }
    }
    if (item.base_type == OBJ_JEWELLERY)
    {
        bool mapped = false;
        for (int prop = 0; prop < ART_PROPERTIES; ++prop) mapped |= intrinsic[prop] != 0;
        // Reflection has a native reflection check as well as numeric SH.
        if ((!mapped && !jewellery_type_has_pluses(item.sub_type)) || item.sub_type == AMU_REFLECTION)
            native(OBJ_JEWELLERY, item.sub_type);
    }
    if (item.base_type == OBJ_GIZMOS && item.brand != SPGIZMO_NORMAL)
        native(OBJ_GIZMOS, item.brand, true);
    // Identity also retains native scripted/activated powers. Every supported
    // equipment type can be remembered even when its only effect is native.
    if (is_unrandom_artefact(item) && vellum::native_power_enabled(item))
        result.properties.push_back({ ARTP_NUM_PROPERTIES, 1, weapon_trait::none,
            { item.base_type, item.unrand_idx, native_kind::unique } });
    if (item.base_type == OBJ_STAVES || item.base_type == OBJ_TALISMANS)
        native(item.base_type, item.sub_type);
    else if (result.properties.empty())
        result.properties.push_back({ ARTP_NUM_PROPERTIES, 1, weapon_trait::none,
            { item.base_type, item.sub_type, native_kind::source } });
    return result;
}
const char* family_name(family group)
{
    switch (group)
    {
    case family::weapon: return "Weapons";
    case family::shield: return "Shields";
    case family::ring: return "Rings";
    case family::amulet: return "Amulets";
    case family::armour: return "Armour";
    case family::talisman: return "Talismans";
    case family::gizmo: return "Gizmos";
    }
    return "Equipment";
}
std::string property_name(property effect)
{
    if (effect.query.kind == native_kind::source) return "No additional property";
    if (effect.query.item_class != OBJ_UNASSIGNED)
    {
        item_def item;
        item.base_type = effect.query.item_class;
        item.quantity = 1;
        item.flags |= ISFLAG_IDENTIFIED;
        if (effect.query.kind == native_kind::unique)
            return get_unrand_entry(effect.query.subtype)->name;
        if (effect.query.kind == native_kind::ego)
        {
            item.sub_type = item.base_type == OBJ_ARMOUR ? ARM_ROBE : 0;
            item.brand = effect.query.subtype;
            return item.base_type == OBJ_ARMOUR ? armour_ego_name(item, false) : item.name(DESC_PLAIN);
        }
        item.sub_type = effect.query.subtype;
        return item.name(DESC_PLAIN);
    }
    if (effect.trait == weapon_trait::cleaving) return "Cleaving";
    if (effect.trait == weapon_trait::reaching) return "Reach " + std::to_string(effect.value);
    if (effect.trait == weapon_trait::multihit) return std::to_string(effect.value) + " strikes";
    switch (effect.type)
    {
    case ARTP_BASE_DAM: return "Damage +" + std::to_string(effect.value);
    case ARTP_BASE_ACC: return "Accuracy +" + std::to_string(effect.value);
    case ARTP_AC: return "AC +" + std::to_string(effect.value);
    case ARTP_EVASION: return "EV +" + std::to_string(effect.value);
    case ARTP_STRENGTH: return "Str +" + std::to_string(effect.value);
    case ARTP_INTELLIGENCE: return "Int +" + std::to_string(effect.value);
    case ARTP_DEXTERITY: return "Dex +" + std::to_string(effect.value);
    case ARTP_ELECTRICITY: return "rElec";
    case ARTP_POISON: return "rPois";
    case ARTP_RCORR: return "rCorr";
    case ARTP_FIRE: return "rF" + std::string(std::min(3, effect.value), '+');
    case ARTP_COLD: return "rC" + std::string(std::min(3, effect.value), '+');
    case ARTP_NEGATIVE_ENERGY: return "rN" + std::string(std::min(3, effect.value), '+');
    case ARTP_WILLPOWER: return "Will" + std::string(std::min(4, effect.value), '+');
    case ARTP_SEE_INVISIBLE: return "SInv";
    case ARTP_SLAYING: return "Slay +" + std::to_string(effect.value);
    case ARTP_SHIELDING: return "SH +" + std::to_string(effect.value);
    case ARTP_BRAND: return brand_type_name(static_cast<brand_type>(effect.value), false);

    default: return artp_name(effect.type) + (artp_value_type(effect.type) == ARTP_VAL_BOOL
                                            ? string() : " +" + std::to_string(effect.value));
    }
}
}
