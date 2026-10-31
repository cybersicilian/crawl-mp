#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <set>
#include <vector>
#include "artefact-prop-type.h"
#include "item-prop-enum.h"
#include "object-class-type.h"

// Pure FIFO memory bundles. Adapters own item extraction, consumption and saving.
namespace equipment_memory
{
enum class family { weapon, shield, ring, amulet, armour, talisman, gizmo };
enum class weapon_trait { none, cleaving, reaching, multihit };
// Native passive queries retain effects with no artefact-property equivalent.
enum class native_kind { item, ego, unique, source };
struct native_query
{
    object_class_type item_class = OBJ_UNASSIGNED;
    int subtype = 0;
    native_kind kind = native_kind::item;
};
struct property
{
    artefact_prop_type type;
    int value;
    weapon_trait trait = weapon_trait::none;
    native_query query;
};
struct base_profile { family group; std::vector<property> properties; };
struct limits
{
    std::vector<int> slot_levels = { 1, 3, 7, 13, 19, 25 };
    int assimilation_turns = 5;
    int retention_percent = 100;
    std::map<artefact_prop_type, int> maxima;
    std::set<artefact_prop_type> scaled_properties;
    std::set<brand_type> brands;
    std::set<weapon_trait> traits = { weapon_trait::cleaving, weapon_trait::reaching, weapon_trait::multihit };
    limits();
};
struct record
{
    std::uint64_t id;
    std::uint64_t source;
    family group;
    std::vector<property> effects;
    std::int64_t acquired;
    bool assimilated;
};
struct state { std::map<int, record> stored; std::uint64_t next_id = 1; };
struct projected_property { record origin; property effect; };
struct work
{
    bool active = false;
    std::uint64_t source = 0;
    family group = family::weapon;
    std::vector<property> intrinsic;
    int remaining_turns = 0;
};
enum class progress { inactive, waiting, working, ready, cancelled };

// Skill in tenths. Only projection scales; original bundle values are preserved.
limits shapeshifting_limits(int skill_tenths);
int slot_count(int level, const limits& policy);
// Empty unlocked slots, or the oldest unlocked memory when the pool is full.
// Adapters choose among these without making inspection consume gameplay RNG.
std::vector<int> destinations(const state& memory, int level, const limits& policy);
int destination(const state& memory, int level, const limits& policy);
std::vector<property> candidates(const base_profile& source, const limits& policy);
property applied(property source, const limits& policy);
// Owner-wide projection resolves duplicates across every source family.
std::vector<projected_property> project(const state& memory, int level,
                                      const limits& policy);
std::vector<projected_property> project(const state& memory, family group, int level,
                                      const limits& policy);
// All extracted properties enter one slot together. No property-selection RNG.
bool absorb(state& memory, const base_profile& source, std::uint64_t source_id,
            std::int64_t now, int level, const limits& policy);
bool begin(const state& memory, work& task, const base_profile& source,
           std::uint64_t source_id, int level, const limits& policy);
progress advance(work& task, bool source_valid, bool owner_can_act,
                 bool interrupted = false);
void cancel(work& task);
// Exactly one consumption callback and one FIFO replacement per bundle.
bool complete(state& memory, work& task, std::int64_t now, int level,
              const limits& policy, const std::function<bool(std::uint64_t)>& consume,
              int selected_slot = -1);
}
