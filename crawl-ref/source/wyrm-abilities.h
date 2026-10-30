#pragma once

#include "ability-type.h"
#include "coord.h"
enum class spret;

namespace wyrm_abilities
{
bool hidden_party_target(const coord_def& target);
spret transmute(ability_type ability, bool fail);
spret transmute_slot(ability_type ability, int slot, bool fail);
spret infuse(const coord_def& target, bool fail);
spret infuse_slot(int slot, const coord_def& target, bool fail);
}
