#pragma once

#include "ability-type.h"
#include "cell-resource.h"

namespace vorr
{
struct corpse_debit
{
    int index;
    int units;
    coord_def pos;
    int kind;
    int freshness;
};
struct rite_payment
{
    cell_resource::ledger entries;
    cell_resource::payment blood;
    std::vector<corpse_debit> corpses;
    std::vector<coord_def> cells;
    int missing = 0;
    int hp = 0;
};
cell_resource::ledger blood_ledger();
void save_blood(const cell_resource::ledger& entries);
bool visible_fuel(const coord_def& pos);
void release_blood(const coord_def& origin, int units, int radius = 2);
int corpse_fuel_at(const coord_def& pos);
rite_payment plan_payment(ability_type ability, const coord_def& aim);
std::string payment_reason(const rite_payment& plan);
bool commit_payment(const rite_payment& plan);
}
