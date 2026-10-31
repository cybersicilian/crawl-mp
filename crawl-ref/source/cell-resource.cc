#include "AppHdr.h"
#include "cell-resource.h"

#include <algorithm>
#include <map>
#include <numeric>
#include <tuple>

#include "store.h"

namespace cell_resource
{
void prune(ledger& entries, int now)
{
    entries.erase(std::remove_if(entries.begin(), entries.end(),
        [now](const deposit& entry) { return entry.units <= 0 || entry.expires <= now; }), entries.end());
}

int at(const ledger& entries, const coord_def& pos, int now)
{
    int units = 0;
    for (const auto& entry : entries)
        if (entry.pos == pos && entry.expires > now && entry.units > 0)
            units += entry.units;
    return units;
}

int add(ledger& entries, const coord_def& pos, int units, int expires,
        int now, int cell_cap)
{
    if (expires <= now || units <= 0 || cell_cap <= 0)
        return 0;
    const int accepted = std::min(units, std::max(0, cell_cap - at(entries, pos, now)));
    if (accepted)
    {
        for (auto& entry : entries)
            if (entry.pos == pos && entry.expires == expires)
            {
                entry.units += accepted;
                return accepted;
            }
        entries.push_back({pos, accepted, expires});
    }
    return accepted;
}

payment select_up_to(const ledger& entries, const coord_def& center, int units,
                     int now, const predicate& eligible)
{
    if (units <= 0)
        return {};
    std::vector<std::size_t> candidates;
    for (std::size_t i = 0; i < entries.size(); ++i)
        if (entries[i].units > 0 && entries[i].expires > now && eligible(entries[i].pos))
            candidates.push_back(i);
    std::stable_sort(candidates.begin(), candidates.end(), [&](std::size_t a, std::size_t b) {
        const auto& left = entries[a];
        const auto& right = entries[b];
        return std::make_tuple(grid_distance(left.pos, center), left.expires, left.pos.x, left.pos.y)
             < std::make_tuple(grid_distance(right.pos, center), right.expires, right.pos.x, right.pos.y);
    });
    payment result;
    for (std::size_t index : candidates)
    {
        const int taken = std::min(units, entries[index].units);
        result.push_back({index, taken});
        units -= taken;
        if (!units)
            return result;
    }
    return result;
}

payment select(const ledger& entries, const coord_def& center, int units,
               int now, const predicate& eligible)
{
    auto result = select_up_to(entries, center, units, now, eligible);
    return total(result) == units ? result : payment{};
}

int total(const payment& plan)
{
    return std::accumulate(plan.begin(), plan.end(), 0,
        [](int sum, const allocation& part) { return sum + part.units; });
}

bool commit(ledger& entries, const payment& plan, int now)
{
    if (plan.empty())
        return false;
    std::map<std::size_t, int> requested;
    for (const auto& part : plan)
    {
        if (part.index >= entries.size() || part.units <= 0)
            return false;
        requested[part.index] += part.units;
    }
    for (const auto& part : requested)
        if (entries[part.first].expires <= now || entries[part.first].units < part.second)
            return false;
    for (const auto& part : requested)
        entries[part.first].units -= part.second;
    return true;
}

ledger load(const CrawlHashTable& properties, const std::string& key, int now)
{
    ledger result;
    if (!properties.exists(key))
        return result;
    for (const auto& value : properties[key].get_vector())
    {
        const auto& table = value.get_table();
        result.push_back({table["pos"].get_coord(), table["units"].get_int(), table["expires"].get_int()});
    }
    prune(result, now);
    return result;
}

void save(CrawlHashTable& properties, const std::string& key,
          const ledger& entries, int now)
{
    ledger live = entries;
    prune(live, now);
    if (live.empty())
    {
        properties.erase(key);
        return;
    }
    properties.erase(key);
    auto& values = properties[key].new_vector(SV_HASH);
    for (const auto& entry : live)
    {
        CrawlHashTable table;
        table["pos"] = entry.pos;
        table["units"] = entry.units;
        table["expires"] = entry.expires;
        values.push_back(CrawlStoreValue(table));
    }
}
}
