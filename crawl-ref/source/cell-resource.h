#pragma once

#include <functional>
#include <string>
#include <vector>

#include "coord.h"

class CrawlHashTable;

// Finite, expiring quantities held by cells. Callers supply terrain, visibility,
// ownership and payment policy; this layer has no religion or UI dependencies.
namespace cell_resource
{
struct deposit
{
    coord_def pos;
    int units;
    int expires;
};
struct allocation
{
    std::size_t index;
    int units;
};
using ledger = std::vector<deposit>;
using payment = std::vector<allocation>;
using predicate = std::function<bool(const coord_def&)>;

void prune(ledger& entries, int now);
int at(const ledger& entries, const coord_def& pos, int now);
int add(ledger& entries, const coord_def& pos, int units,
        int expires, int now, int cell_cap = 3);
payment select(const ledger& entries, const coord_def& center, int units,
               int now, const predicate& eligible);
payment select_up_to(const ledger& entries, const coord_def& center, int units,
                     int now, const predicate& eligible);
int total(const payment& plan);
bool commit(ledger& entries, const payment& plan, int now);

ledger load(const CrawlHashTable& properties, const std::string& key, int now);
void save(CrawlHashTable& properties, const std::string& key,
          const ledger& entries, int now);
}
