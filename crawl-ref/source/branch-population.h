// Depth profiles for the ordinary native population dice. Entries select
// population quantity; individual monsters retain their normal XP values.
#pragma once

#include <array>
#include <vector>
#include "branch-type.h"

struct branch_population_profile
{
    branch_type branch;
    std::vector<int> dice;
};

inline const std::array<branch_population_profile, 3>& branch_population_profiles()
{
    static const std::array<branch_population_profile, 3> profiles = {{
        { BRANCH_BURROWS, {19, 20, 20, 44} },
        { BRANCH_WORMLANDS, {14, 20, 26, 36} },
        { BRANCH_HIVE, {26, 38} },
    }};
    return profiles;
}

inline int branch_population_die_size(branch_type branch, int depth, int fallback)
{
    for (const auto& profile : branch_population_profiles())
        if (profile.branch == branch && depth > 0
            && static_cast<unsigned>(depth) <= profile.dice.size())
        {
            return profile.dice[depth - 1];
        }
    return fallback;
}
