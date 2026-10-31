#pragma once

#include "size-type.h"
#include "coord-def.h"
#include <vector>
#include <string>

class player;
enum class spret;

namespace hermit_crab
{
// Shell state lives in player properties so it is saved per party member.
size_type shell_size(const player& p);
int armour_bonus(const player& p);
bool grow_shell(player& p, int level);
int moult_chances(const player& p);
bool gain_moult_chance(player& p, int level);
std::string moult_reason(const player& p);
spret begin_moult();
void finish_moult();
bool break_shell(player& p);
void reconcile_equipment();
void start_crab_walk(player& p);
int crab_walk_remaining(const player& p);
bool crab_walk_ready(const player& p);
bool crab_walk_shape(const coord_def& from, const coord_def& to);
std::vector<coord_def> crab_walk_targets();
spret crab_walk(const coord_def& target);
}
