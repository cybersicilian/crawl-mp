#include "AppHdr.h"
#include "oozle-memory.h"
#include "equipment-memory-items.h"
#include "item-def.h"
#include "item-prop.h"
#include "items.h"
#include "json.h"
#include "player.h"
#include "player-equip.h"
#include "stringutil.h"

namespace oozle
{
using namespace equipment_memory;
namespace
{
void text(JsonNode* node, const char* key, const string& value)
{ json_append_member(node, key, json_mkstring(value.c_str())); }
void number(JsonNode* node, const char* key, int value)
{ json_append_member(node, key, json_mknumber(value)); }
void flag(JsonNode* node, const char* key, bool value)
{ json_append_member(node, key, json_mkbool(value)); }
JsonNode* effect_json(const record& memory, equipment_memory::property source)
{
    const auto effect = applied(source, current_policy());
    auto* result = json_mkobject();
    number(result, "id", memory.id);
    number(result, "property", effect.trait == weapon_trait::none && effect.query.item_class == OBJ_UNASSIGNED
                               ? effect.type : -1);
    number(result, "value", effect.value);
    number(result, "source_value", source.value);
    text(result, "kind", effect.query.item_class != OBJ_UNASSIGNED ? "passive"
                         : effect.trait == weapon_trait::none ? "native" : "technique");
    text(result, "label", property_name(effect));
    text(result, "source_label", property_name(source));
    text(result, "family", family_name(memory.group));
    text(result, "scope", "body");
    text(result, "method", memory.assimilated ? "Assimilated" : "Digested");
    return result;
}
JsonNode* projected_json(bool attacks_only = false)
{
    auto* result = json_mkarray();
    for (const auto& effect : project(memories(), you.experience_level, current_policy()))
    {
        if (effect.effect.query.kind == native_kind::source) continue;
        if (attacks_only && effect.effect.trait == weapon_trait::none
            && effect.effect.type != ARTP_BASE_DAM && effect.effect.type != ARTP_BASE_ACC
            && effect.effect.type != ARTP_BRAND) continue;
        equipment_memory::property source = effect.effect;
        for (const auto& raw : effect.origin.effects)
            if (raw.type == source.type && raw.trait == source.trait
                && raw.query.item_class == source.query.item_class && raw.query.subtype == source.query.subtype
                && raw.query.kind == source.query.kind) { source = raw; break; }
        json_append_element(result, effect_json(effect.origin, source));
    }
    return result;
}
}
JsonNode* memory_json()
{
    if (!has_memory()) return json_mknull();
    const auto policy = current_policy();
    const auto memory = memories();
    const int capacity = slot_count(you.experience_level, policy);
    auto* result = json_mkobject();
    number(result, "version", 3);
    number(result, "capacity", capacity);
    int used = 0;
    for (const auto& entry : memory.stored) if (entry.first < capacity) ++used;
    number(result, "used", used);
    number(result, "numeric_percent", policy.retention_percent);
    number(result, "shapeshifting_tenths", you.skill(SK_SHAPESHIFTING, 10, true, false));
    number(result, "next_xl", capacity < static_cast<int>(policy.slot_levels.size()) ? policy.slot_levels[capacity] : 0);
    const auto choices = destinations(memory, you.experience_level, policy);
    number(result, "destination", choices.size() == 1 ? choices.front() : -1);
    auto* slots = json_mkarray();
    for (int slot = 0; slot < static_cast<int>(policy.slot_levels.size()); ++slot)
    {
        auto* row = json_mkobject();
        number(row, "slot", slot);
        number(row, "unlock_xl", policy.slot_levels[slot]);
        flag(row, "unlocked", slot < capacity);
        flag(row, "next", std::find(choices.begin(), choices.end(), slot) != choices.end());
        const auto found = memory.stored.find(slot);
        if (found != memory.stored.end())
        {
            const auto& entry = found->second;
            auto* stored = json_mkobject();
            number(stored, "id", entry.id);
            text(stored, "family", family_name(entry.group));
            text(stored, "scope", "body");
            text(stored, "method", entry.assimilated ? "Assimilated" : "Digested");
            text(stored, "source", source_name(slot));
            auto* effects = json_mkarray();
            for (const auto& effect : entry.effects) json_append_element(effects, effect_json(entry, effect));
            json_append_member(stored, "effects", effects);
            json_append_member(row, "memory", stored);
        }
        json_append_element(slots, row);
    }
    json_append_member(result, "slots", slots);
    json_append_member(result, "body_properties", projected_json());
    json_append_member(result, "unarmed_properties", you.has_mutation(MUT_ACIDIC_TOUCH)
        ? projected_json(true) : json_mkarray());
    auto* work = json_mkobject();
    number(work, "remaining", assimilation_remaining());
    number(work, "total", policy.assimilation_turns);
    text(work, "source", assimilation_source());
    json_append_member(result, "work", work);
    return result;
}
JsonNode* item_memory_json(const item_def& item)
{
    auto* result = json_mkobject();
    if (!has_memory()) return result;
    text(result, "assimilation_reason", eligibility(item));
    // Absorbed properties belong to the body, never to this physical item.
    json_append_member(result, "transient_properties", json_mkarray());
    return result;
}
}
