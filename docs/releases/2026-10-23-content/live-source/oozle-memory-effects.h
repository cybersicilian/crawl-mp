#pragma once
#include <functional>
#include <vector>
#include "item-def.h"
#include "item-prop-enum.h"
#include "killer-type.h"
class actor;
class player;
class monster;
class melee_attack;
struct bolt;
namespace oozle
{
// Detached sources have no inventory slot. Native effects may mutate their state.
std::vector<const item_def*> effect_sources(const player& owner);
std::vector<item_def*> effect_sources();
std::vector<item_def> source_snapshot();
bool is_effect_source(const item_def* item);
int effect_source_id(const item_def* item);
item_def* effect_source_by_id(int id);
item_def* spectral_source();
const item_def* type_source(object_class_type type, int subtype);
void source_lifecycle(const std::vector<item_def>& before);
bool absorbed_unrand(const player& owner, int index);
bool has_equipment_effect(const actor& owner, const item_def* item, int unrand);
item_def* unrand_source(int index, bool include_melded = false);
brand_type effective_brand(const actor& owner, const item_def* item);
int inherited_strikes(const item_def* item);
int inherited_block_limit(const player& owner);
void world_effects();
void death_effects(monster* target, killer_type killer);
void melee_effects(actor* attacker, actor* defender, int damage, melee_attack* attack,
                   bool killed = false);
void block_effects(actor* wearer, actor* attacker);
void launch_effects(bolt& beam);
}
