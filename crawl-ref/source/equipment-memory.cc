#include "equipment-memory.h"
#include <algorithm>
#include <limits>
#include <tuple>

namespace equipment_memory
{
namespace
{
using effect_key = std::tuple<artefact_prop_type, weapon_trait, object_class_type, int, native_kind>;
effect_key key_for(const property& effect)
{
    return { effect.type, effect.trait, effect.query.item_class, effect.query.subtype, effect.query.kind };
}
bool known_source(const state& memory, std::uint64_t source)
{
    for (const auto& entry : memory.stored) if (entry.second.source == source) return true;
    return false;
}
bool valid(const state& memory, const base_profile& source, std::uint64_t source_id,
           std::int64_t now, int level, const limits& policy)
{
    return source_id && now >= 0 && !known_source(memory, source_id)
        && memory.next_id > 0 && memory.next_id < std::numeric_limits<std::uint64_t>::max()
        && destination(memory, level, policy) >= 0 && !candidates(source, policy).empty();
}
bool insert(state& memory, const base_profile& source, std::uint64_t source_id,
            std::int64_t now, int level, const limits& policy, bool assimilated)
{
    if (!valid(memory, source, source_id, now, level, policy)) return false;
    const int slot = destination(memory, level, policy);
    memory.stored[slot] = { memory.next_id++, source_id, source.group,
                            candidates(source, policy), now, assimilated };
    return true;
}
}
limits::limits()
    : scaled_properties({ ARTP_AC, ARTP_EVASION, ARTP_STRENGTH, ARTP_INTELLIGENCE,
                          ARTP_DEXTERITY, ARTP_SLAYING, ARTP_SHIELDING,
                          ARTP_BASE_DAM, ARTP_BASE_ACC }),
      brands({ SPWPN_FLAMING, SPWPN_FREEZING, SPWPN_VENOM })
{
    for (auto prop : scaled_properties) maxima[prop] = std::numeric_limits<int>::max();
    for (auto prop : { ARTP_FIRE, ARTP_COLD, ARTP_NEGATIVE_ENERGY, ARTP_WILLPOWER, ARTP_SEE_INVISIBLE, ARTP_ELECTRICITY, ARTP_POISON, ARTP_RCORR })
        maxima[prop] = std::numeric_limits<int>::max();
}
limits shapeshifting_limits(int skill_tenths)
{
    limits result;
    const int skill = std::max(0, std::min(270, skill_tenths));
    result.retention_percent = 35 + skill * 65 / 270;
    return result;
}
int slot_count(int level, const limits& policy)
{
    return std::count_if(policy.slot_levels.begin(), policy.slot_levels.end(),
                         [level](int threshold) { return threshold > 0 && level >= threshold; });
}
int destination(const state& memory, int level, const limits& policy)
{
    int oldest = -1;
    for (int slot = 0; slot < slot_count(level, policy); ++slot)
    {
        const auto found = memory.stored.find(slot);
        if (found == memory.stored.end()) return slot;
        if (oldest < 0 || found->second.id < memory.stored.at(oldest).id) oldest = slot;
    }
    return oldest;
}
std::vector<property> candidates(const base_profile& source, const limits& policy)
{
    std::map<effect_key, int> values;
    for (const auto& effect : source.properties)
    {
        if (effect.query.item_class != OBJ_UNASSIGNED)
        {
            if (effect.value > 0)
                values[key_for(effect)] = 1;
            continue;
        }
        if (effect.trait != weapon_trait::none)
        {
            if (source.group == family::weapon && effect.value > 0 && policy.traits.count(effect.trait))
                values[key_for({ARTP_NUM_PROPERTIES, effect.value, effect.trait})] = (effect.trait == weapon_trait::reaching || effect.trait == weapon_trait::multihit)
                                                               ? std::max(1, effect.value) : 1;
            continue;
        }
        if (effect.type == ARTP_BRAND)
        {
            if (source.group == family::weapon && policy.brands.count(static_cast<brand_type>(effect.value)))
                values[key_for(effect)] = effect.value;
            continue;
        }
        const auto cap = policy.maxima.find(effect.type);
        if (cap != policy.maxima.end() && cap->second > 0 && effect.value > 0)
        {
            auto& stored = values[key_for(effect)];
            stored = std::max(stored, std::min(cap->second, effect.value));
        }
    }
    std::vector<property> result;
    for (const auto& effect : values)
    {
        const auto& key = effect.first;
        result.push_back({ std::get<0>(key), effect.second, std::get<1>(key),
            { std::get<2>(key), std::get<3>(key), std::get<4>(key) } });
    }
    return result;
}
property applied(property source, const limits& policy)
{
    if (source.query.item_class == OBJ_UNASSIGNED && source.trait == weapon_trait::none
        && policy.scaled_properties.count(source.type))
    {
        const auto value = static_cast<std::int64_t>(source.value)
                           * std::max(0, std::min(100, policy.retention_percent)) / 100;
        source.value = static_cast<int>(std::max<std::int64_t>(1, value));
    }
    return source;
}
namespace
{
std::vector<projected_property> project_selected(const state& memory, int level,
                                               const limits& policy, const family* group)
{
    std::map<effect_key, projected_property> selected;
    for (const auto& entry : memory.stored)
    {
        const auto& record = entry.second;
        if (entry.first < 0 || entry.first >= slot_count(level, policy)
            || (group && record.group != *group)) continue;
        for (const auto& source : record.effects)
        {
            const auto effect = applied(source, policy);
            const auto key = key_for(effect);
            const auto found = selected.find(key);
            const bool branded = effect.trait == weapon_trait::none && effect.type == ARTP_BRAND;
            if (found == selected.end()
                || (!branded && effect.value > found->second.effect.value)
                || ((branded || effect.value == found->second.effect.value) && record.id > found->second.origin.id))
                selected[key] = { record, effect };
        }
    }
    std::vector<projected_property> result;
    for (const auto& entry : selected) result.push_back(entry.second);
    return result;
}
}
std::vector<projected_property> project(const state& memory, int level, const limits& policy)
{
    return project_selected(memory, level, policy, nullptr);
}
std::vector<projected_property> project(const state& memory, family group, int level,
                                      const limits& policy)
{
    return project_selected(memory, level, policy, &group);
}
bool absorb(state& memory, const base_profile& source, std::uint64_t source_id,
            std::int64_t now, int level, const limits& policy)
{
    return insert(memory, source, source_id, now, level, policy, false);
}
bool begin(const state& memory, work& task, const base_profile& source,
           std::uint64_t source_id, int level, const limits& policy)
{
    if (task.active || !valid(memory, source, source_id, 0, level, policy) || policy.assimilation_turns <= 0)
        return false;
    task = { true, source_id, source.group, source.properties, policy.assimilation_turns };
    return true;
}
void cancel(work& task) { task = work(); }
progress advance(work& task, bool source_valid, bool owner_can_act, bool interrupted)
{
    if (!task.active) return progress::inactive;
    if (!source_valid || interrupted) { cancel(task); return progress::cancelled; }
    if (!owner_can_act) return progress::waiting;
    if (task.remaining_turns > 0) --task.remaining_turns;
    return task.remaining_turns == 0 ? progress::ready : progress::working;
}
bool complete(state& memory, work& task, std::int64_t now, int level,
              const limits& policy, const std::function<bool(std::uint64_t)>& consume)
{
    if (!task.active || task.remaining_turns != 0) return false;
    const base_profile source = { task.group, task.intrinsic };
    if (!consume || !valid(memory, source, task.source, now, level, policy) || !consume(task.source))
    { cancel(task); return false; }
    const bool result = insert(memory, source, task.source, now, level, policy, true);
    cancel(task);
    return result;
}
int weapon_corrosion_stage(int progress_aut, int lifetime_aut)
{
    if (lifetime_aut <= 0) return 4;
    return std::max(0, std::min(4, static_cast<int>(static_cast<std::int64_t>(progress_aut) * 4 / lifetime_aut)));
}
int weapon_damage_percent(int progress_aut, int lifetime_aut)
{
    return 100 - std::min(3, weapon_corrosion_stage(progress_aut, lifetime_aut)) * 25;
}
}
