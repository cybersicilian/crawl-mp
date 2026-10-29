#include "AppHdr.h"
#include "enchantment-transfer.h"

#include <algorithm>
#include <set>

namespace enchantment_transfer
{
bool same_kind(effect first, effect second)
{
    return first.kind == second.kind && (first.kind == effect_kind::unique_power
        ? first.value == second.value : first.type == second.type);
}

const thread* find(const ledger& state, int id)
{
    for (const auto& entry : state.threads)
        if (entry.id == id)
            return &entry;
    return nullptr;
}

int used(const ledger& state)
{
    int result = 0;
    for (const auto& entry : state.threads)
        if (entry.target > 0)
            result += entry.weight;
    return result;
}

int on_item(const ledger& state, int item)
{
    return std::count_if(state.threads.begin(), state.threads.end(),
        [item](const thread& entry) { return item > 0 && entry.target == item; });
}

bool valid(const ledger& state, int capacity)
{
    if (capacity < 0 || state.next_id <= 0 || state.revision < 0
        || state.vessel < 0 || state.masterwork < 0)
        return false;
    std::set<int> ids;
    std::set<std::pair<effect_kind, int>> bound_types;
    int total = 0;
    for (const auto& entry : state.threads)
    {
        if (entry.id <= 0 || entry.id >= state.next_id || !ids.insert(entry.id).second
            || entry.source < 0 || entry.target < -1 || entry.magic.value == 0
            || (entry.magic.kind == effect_kind::property
                && (entry.magic.type < 0 || entry.magic.type >= ARTP_NUM_PROPERTIES))
            || (entry.magic.kind == effect_kind::unique_power && entry.magic.value <= 0)
            || entry.weight <= 0)
            return false;
        if (entry.target <= 0)
            continue;
        if (!bound_types.insert({entry.magic.kind, entry.magic.kind == effect_kind::unique_power
                    ? entry.magic.value : static_cast<int>(entry.magic.type)}).second
            || on_item(state, entry.target) > (entry.target == state.masterwork ? 2 : 1))
            return false;
        total += entry.weight;
        if (total > capacity)
            return false;
    }
    return true;
}

int extract(ledger& state, int source, effect magic, int weight)
{
    if (source < 0 || (magic.kind == effect_kind::property
            && (magic.type < 0 || magic.type >= ARTP_NUM_PROPERTIES))
        || magic.value == 0 || weight <= 0 || state.next_id == INT_MAX)
        return 0;
    // A depleted physical source cannot issue the same property twice.
    if (source && std::any_of(state.threads.begin(), state.threads.end(),
        [&](const thread& entry) { return entry.source == source && same_kind(entry.magic, magic); }))
        return 0;
    const int id = state.next_id++;
    state.threads.push_back({id, source, 0, magic, weight});
    ++state.revision;
    return id;
}

int contribution(effect magic, int native_value)
{
    if (magic.kind == effect_kind::unique_power)
        return native_value ? 0 : 1;
    if (magic.type == ARTP_BRAND)
        return magic.value == native_value ? 0 : magic.value - native_value;
    if (native_value && (native_value < 0) != (magic.value < 0))
        return 0;
    return magic.value < 0 ? std::min(0, magic.value - native_value)
                           : std::max(0, magic.value - native_value);
}

std::string binding_reason(const ledger& state, int id, int target,
                           int native_value, int capacity, int replace)
{
    const auto* chosen = find(state, id);
    if (!chosen || chosen->target < 0 || target <= 0)
        return "This thread or recipient is no longer available.";
    if (chosen->source == target)
        return "An extracted thread cannot be returned to its donor.";
    if (chosen->target == target)
        return "This thread is already bound here.";
    if (chosen->magic.kind == effect_kind::property && chosen->magic.type != ARTP_BRAND
        && native_value && (native_value < 0) != (chosen->magic.value < 0))
        return "Opposite-signed properties cannot erase each other.";
    if (!contribution(chosen->magic, native_value))
        return "This item already supplies an equal or stronger property.";
    const auto* displaced = find(state, replace);
    if (replace && (!displaced || displaced->target != target || replace == id))
        return "The binding selected for replacement changed.";
    int total = chosen->weight, count = 1;
    for (const auto& entry : state.threads)
    {
        if (entry.id == id || entry.id == replace || entry.target <= 0)
            continue;
        if (same_kind(entry.magic, chosen->magic))
            return "Only one thread of each property can be bound. Archive the other first.";
        total += entry.weight;
        count += entry.target == target;
    }
    if (total > capacity)
        return "The resulting bindings exceed your personal capacity.";
    if (count > (target == state.masterwork ? 2 : 1))
        return "This item has no free binding slot.";
    return "";
}

bool bind(ledger& state, int id, int target, int native_value,
          int capacity, int replace)
{
    if (!binding_reason(state, id, target, native_value, capacity, replace).empty())
        return false;
    for (auto& entry : state.threads)
    {
        if (entry.id == replace)
            entry.target = 0;
        if (entry.id == id)
            entry.target = target;
    }
    ++state.revision;
    return true;
}

bool archive(ledger& state, int id)
{
    for (auto& entry : state.threads)
        if (entry.id == id && entry.target > 0)
        {
            entry.target = 0;
            ++state.revision;
            return true;
        }
    return false;
}

bool sever(ledger& state, int id)
{
    for (auto& entry : state.threads)
        if (entry.id == id && entry.target >= 0)
        {
            entry.target = -1;
            ++state.revision;
            return true;
        }
    return false;
}

bool destroy_target(ledger& state, int target)
{
    bool changed = false;
    for (auto& entry : state.threads)
        if (target > 0 && entry.target == target)
        {
            entry.target = -1;
            changed = true;
        }
    if (changed)
        ++state.revision;
    return changed;
}
}
