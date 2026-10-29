#include "AppHdr.h"
#include "oozle-memory.h"
#include "equipment-profile.h"

#include "describe.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "json.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "species.h"
#include "transform.h"
#ifdef USE_TILE
#include "tiledoll.h"
#include "tiles.h"
#include "tilepick.h"
#include "rltiles/tiledef-main.h"
#include "rltiles/tiledef-icons.h"
#include "rltiles/tiledef-player.h"
#endif

namespace
{
void text(JsonNode* node, const char* key, const string& value)
{
    json_append_member(node, key, json_mkstring(value.c_str()));
}
void number(JsonNode* node, const char* key, int value)
{
    json_append_member(node, key, json_mknumber(value));
}
void flag(JsonNode* node, const char* key, bool value)
{
    json_append_member(node, key, json_mkbool(value));
}
const char* slot_key(equipment_slot slot)
{
    switch (slot)
    {
    case SLOT_WEAPON: return "weapon";
    case SLOT_OFFHAND: return "offhand";
    case SLOT_BODY_ARMOUR: return "body";
    case SLOT_HELMET: return "head";
    case SLOT_GLOVES: return "hands";
    case SLOT_BOOTS: return "feet";
    case SLOT_BARDING: return "barding";
    case SLOT_CLOAK: return "cloak";
    case SLOT_RING: return "ring";
    case SLOT_AMULET: return "amulet";
    case SLOT_GIZMO: return "gizmo";
    case SLOT_WEAPON_OR_OFFHAND: return "weapon_offhand";
    case SLOT_HAUNTED_AUX: return "haunted_armour";
    case SLOT_TWOHANDER_ONLY: return "twohander";
    default: return "unknown";
    }
}
string slot_label(equipment_slot slot)
{
    if (slot == SLOT_WEAPON_OR_OFFHAND)
        return you.species == SP_TWO_HEADED_OGRE ? "Offhand weapon / orb"
                                                 : "Offhand weapon / shield";
    if (slot == SLOT_HAUNTED_AUX) return "Haunted armour";
    if (slot == SLOT_TWOHANDER_ONLY) return "Two-handed weapon support";
    return equip_slot_name(slot);
}
#ifdef USE_TILE
JsonNode* layer_json(const tile_info& info, int ymax)
{
    JsonNode* layer = json_mkobject();
    number(layer, "sx", info.sx); number(layer, "sy", info.sy);
    number(layer, "w", info.ex - info.sx); number(layer, "h", info.ey - info.sy);
    number(layer, "ox", info.offset_x); number(layer, "oy", info.offset_y);
    number(layer, "ymax", ymax);
    return layer;
}
JsonNode* item_art(const item_def& item)
{
    JsonNode* art = json_mkobject();
    text(art, "texture", "main");
    JsonNode* layers = json_mkarray();
    vector<tile_def> packed;
    get_tiles_for_item(item, packed, false);
    for (const auto& part : packed)
    {
        const bool icons = get_tile_texture(part.tile) == TEX_ICONS;
        const tile_info& info = icons ? tile_icons_info(part.tile)
                                      : tile_main_info(part.tile);
        JsonNode* layer = layer_json(info, part.ymax);
        if (icons)
            text(layer, "texture", "icons");
        json_append_element(layers, layer);
    }
    json_append_member(art, "layers", layers);
    return art;
}
JsonNode* portrait_art()
{
    JsonNode* art = json_mkobject();
    text(art, "texture", "player");
    dolls_data doll;
    fill_player_equipment_doll(doll);
    vector<tile_def> packed;
    pack_tilep_set(packed, doll);
    JsonNode* layers = json_mkarray();
    for (const auto& part : packed)
        json_append_element(layers, layer_json(tile_player_info(part.tile), part.ymax));
    json_append_member(art, "layers", layers);
    return art;
}
#endif
JsonNode* item_profile(const item_def& item, int index)
{
    JsonNode* result = json_mkobject();
    number(result, "inv_slot", index);
    const bool equipment = item_type_is_equipment(item.base_type);
    flag(result, "equipment", equipment);
#ifdef USE_TILE
    json_append_member(result, "art", item_art(item));
#endif
    if (oozle::has_memory()) json_append_member(result, "memory", oozle::item_memory_json(item));
    if (!equipment) return result;
    string reason;
    const bool fits = can_equip_item(item, true, &reason);
    flag(result, "fits", fits);
    text(result, "reason", fits ? "" : reason);
    if (is_weapon(item)) number(result, "hands", you.hands_reqd(item) == HANDS_TWO ? 2 : 1);
    // Primary target slots, distinct from other slots consumed by a two-hander
    // or multi-slot armour. Alternate slots come from the canonical slot graph.
    JsonNode* targets = json_mkarray();
    for (const auto slot : get_alternate_slots(get_item_slot(item)))
        json_append_element(targets, json_mkstring(slot_key(slot)));
    json_append_member(result, "slot_types", targets);
    JsonNode* required = json_mkarray();
    for (const auto slot : get_all_item_slots(item))
    {
        JsonNode* alternatives = json_mkarray();
        for (const auto alt : get_alternate_slots(slot))
            json_append_element(alternatives, json_mkstring(slot_key(alt)));
        json_append_element(required, alternatives);
    }
    json_append_member(result, "required_slots", required);
    return result;
}
void append_slot(JsonNode* slots, equipment_slot type, int index, int capacity,
                 const string& unavailable, const vector<player_equip_entry>& entries)
{
    JsonNode* slot = json_mkobject();
    text(slot, "type", slot_key(type));
    text(slot, "key", string(slot_key(type)) + ":" + to_string(index));
    text(slot, "label", slot_label(type) + (capacity > 1 ? " " + to_string(index + 1) : ""));
    number(slot, "capacity", capacity);
    flag(slot, "support_only", type == SLOT_TWOHANDER_ONLY);
    JsonNode* alternatives = json_mkarray();
    for (const auto alt : get_alternate_slots(type))
        if (alt != type && you.equipment.num_slots[alt] > 0)
            json_append_element(alternatives, json_mkstring(slot_key(alt)));
    json_append_member(slot, "alternatives", alternatives);
    const bool transformed = capacity > 0 && slot_is_melded(type);
    string state = capacity == 0 ? "unavailable" : transformed ? "blocked" : "empty";
    string reason = capacity == 0 ? unavailable
                    : transformed ? "This slot is unavailable in your current form." : "";
    if (index < (int)entries.size() && capacity > 0)
    {
        const auto& entry = entries[index];
        if (entry.item >= 0 && entry.item < ENDOFPACK && you.inv[entry.item].defined())
        {
            const item_def& item = you.inv[entry.item];
            state = entry.melded ? "melded" : entry.is_overflow ? "occupied" : "equipped";
            reason = entry.melded ? "Melded into your current form; its equipment effects are inactive."
                     : entry.is_overflow ? "This slot is also occupied by " + item.name(DESC_A, true) + "." : "";
            number(slot, "inv_slot", entry.item);
            text(slot, "name", item.name(DESC_A, true, false, true));
            flag(slot, "shared", entry.is_overflow);
        }
    }
    text(slot, "state", state); text(slot, "reason", reason);
    if (type == SLOT_WEAPON && state == "empty") text(slot, "name", you.unarmed_attack_name());
    json_append_element(slots, slot);
}
}

JsonNode* equipment_profile_json()
{
    rng::subgenerator inspection(0x65717569706d656eULL, 0x7470726f66696c65ULL);
    JsonNode* result = json_mkobject();
    number(result, "version", 1);
    if (oozle::has_memory()) json_append_member(result, "assimilation", oozle::memory_json());
    text(result, "species", species::name(you.species));
    text(result, "size", get_size_adj(you.body_size(PSIZE_TORSO), false));
    text(result, "form", get_form()->get_long_name());
    text(result, "hands", you.hand_name(true));
    text(result, "feet", you.foot_name(true));
    text(result, "unarmed_attack", you.unarmed_attack_name("Unarmed"));
#ifdef USE_TILE
    json_append_member(result, "portrait", portrait_art());
#endif
    JsonNode* slots = json_mkarray();
    for (int value = SLOT_WEAPON; value < NUM_EQUIP_SLOTS; ++value)
    {
        const auto type = static_cast<equipment_slot>(value);
        string reason;
        const int count = get_player_equip_slot_count(type, &reason);
        const auto entries = you.equipment.get_slot_entries(type);
        for (int index = 0; index < max(1, count); ++index)
            append_slot(slots, type, index, count, reason, entries);
    }
    json_append_member(result, "slots", slots);
    JsonNode* items = json_mkarray();
    for (int index = 0; index < ENDOFPACK; ++index)
        if (you.inv[index].defined())
            json_append_element(items, item_profile(you.inv[index], index));
    json_append_member(result, "items", items);
    JsonNode* restrictions = json_mkarray();
    // A head slot may accept hats but reject hard helmets. Ask the native fit
    // function using a plain helmet; never duplicate mutation/species rules.
    if (you.equipment.has_compatible_slot(SLOT_HELMET, true))
    {
        item_def helmet; helmet.base_type = OBJ_ARMOUR; helmet.sub_type = ARM_HELMET;
        string reason;
        if (!can_equip_item(helmet, true, &reason))
        {
            JsonNode* entry = json_mkobject();
            text(entry, "label", "Hard helmets"); text(entry, "reason", reason);
            json_append_element(restrictions, entry);
        }
    }
    json_append_member(result, "restrictions", restrictions);
    return result;
}
