#pragma once

// Shared by native action eligibility and read-only initiative projections.
constexpr int MONSTER_ACTION_ENERGY_THRESHOLD = 80;

inline int monster_energy_deficit(int energy)
{
    return energy < MONSTER_ACTION_ENERGY_THRESHOLD
        ? MONSTER_ACTION_ENERGY_THRESHOLD - energy : 0;
}
