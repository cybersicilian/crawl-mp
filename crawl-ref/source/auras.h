#pragma once

#include <array>
#include "coord-def.h"
#include "spell-type.h"

class player;

// Shared spell stance rules. Backgrounds only supply access to the spells.
namespace auras
{
constexpr int base_radius = 2;
constexpr int power_cap = 100;
extern const std::array<spell_type, 7> spells;

int clamp_power(int power);
int duration_turns(int power);
int radius(const player& caster);
int strength(int power); // Common +1 to +3 progression.
int power(const player& caster, spell_type spell);
bool reaches(const player& caster, const coord_def& target, int range_limit = -1);
int movement_discount(const coord_def& from, const coord_def& to);
int intercept_damage(int damage);
}
