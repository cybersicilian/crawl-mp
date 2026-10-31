#pragma once

#include "coord.h"
class actor;
class monster;
enum class spret;

// Does not perform the spell's willpower check; useful for effects and tests.
bool shackle_monster(monster& target, const actor* caster, int power);
spret cast_shackle(int power, const coord_def& target, bool fail);
