#pragma once

#include "coord.h"

class monster;
enum class spret;

// A prism flashes on three consecutive turns, then shatters.
spret cast_imus_prism(int power, const coord_def& where, bool fail);
void imus_prism_act(monster& prism);
bool imus_prism_can_dazzle(const monster& target);
