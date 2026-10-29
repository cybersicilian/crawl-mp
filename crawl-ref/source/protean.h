#pragma once

#include "size-type.h"

class player;

namespace protean
{
int mutation_levels(const player& p);
int health_bonus_percent(const player& p);
size_type size_for_hp(int max_hp);
void reconcile_equipment();
}
