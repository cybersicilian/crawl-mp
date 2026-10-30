#pragma once

#include "ability-type.h"
#include "coord.h"

enum class spret;

namespace agraphede_abilities
{
bool uses_poison(ability_type ability);
int poison_cost(ability_type ability);
bool can_pay(ability_type ability, bool quiet = false);
void pay(ability_type ability);
int poison_enhancement();
int enhanced_power(int base);
spret create_web(const coord_def& target, bool fail);
spret convert_curing(bool fail);
spret convert_curing_slot(int slot, int count, bool fail);
spret summon_spiders(const coord_def& target, bool fail);
}
