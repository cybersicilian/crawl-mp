#pragma once
#include <string>
#include "equipment-memory.h"
enum class spret;
struct item_def;
struct JsonNode;
class player;
namespace oozle
{
constexpr int digestion_aut = 3000;
extern const char* const corrosion_key;
bool has_memory();
bool has_memory(const player& owner);
equipment_memory::state memories();
equipment_memory::state memories(const player& owner);
std::string source_name(int slot);
equipment_memory::limits current_policy();
equipment_memory::limits current_policy(const player& owner);
int body_property(artefact_prop_type type);
int body_property(const player& owner, artefact_prop_type type);
int unarmed_property(artefact_prop_type type);
bool inherited_cleaving(const item_def* item);
int inherited_reach(const item_def* item = nullptr);
int weapon_corrosion_penalty(const item_def& item);
int weapon_damage_percent(const item_def& item);
void note_weapon_use(const item_def* item);
int passive_bonus(const player& owner, artefact_prop_type type);
int passive_bonus(artefact_prop_type type);
int native_bonus(const player& owner, object_class_type item_class, int subtype, bool ego = false);
std::string eligibility(const item_def& item);
spret assimilate(int inventory_slot = -1);
void digest_equipment(int elapsed_aut);
int assimilation_remaining();
std::string assimilation_source();
JsonNode* memory_json();
JsonNode* item_memory_json(const item_def& item);
std::string item_memory_description(const item_def& item);
}
