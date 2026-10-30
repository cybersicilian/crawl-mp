#pragma once

#include <string>
#include "ability-type.h"
#include "coord-def.h"
#include "spl-cast.h"

class monster;
class player;
class dist;

namespace chains
{
constexpr int lash_range = 4;

struct view
{
    bool active = false;
    bool pinned = false;
    coord_def source;
    coord_def target;
    coord_def anchor;
    int radius = 0;
};
view snapshot();
bool has_body(const player& owner);
bool held(monster& target);
bool may_step(monster& target, coord_def destination);
bool strain(monster& target);
bool attachment_eligible(monster& target);
void release(player& owner);
void refresh();
std::string reason(ability_type ability);
std::string summary();
spret invoke(ability_type ability, dist* target = nullptr);
// Native operation separated from hit resolution for lifecycle/geometry tests.
bool attach(monster& target);
}
