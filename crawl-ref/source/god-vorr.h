#pragma once

#include <memory>
#include <string>

#include "ability-type.h"
#include "coord.h"
#include "killer-type.h"
#include "spl-cast.h"

class actor;
class monster;
class targeter;

namespace vorr
{
constexpr const char* blood_key = "vorr_blood";
bool active(int rank = 0);
bool worthy(const monster& victim);
int blood_at(const coord_def& pos);
int blood_visual(const coord_def& pos);
int nearby_blood();
int nearby_corpses();
int speed_bonus();
bool self_blood_available();
int self_blood_cost();
int ability_range(ability_type ability);
std::string damage_description(ability_type ability);
int regeneration_bonus();
std::string blood_description(const coord_def& pos);
std::string ability_reason(ability_type ability);
std::string cost_description(ability_type ability);
std::string detailed_cost_description(ability_type ability);
std::unique_ptr<targeter> ability_targeter(ability_type ability);
spret invoke(ability_type ability, bool fail, const coord_def* target = nullptr);
void on_damage(monster& victim, const actor* agent, int hp_before, int damage, int force);
void on_kill(monster& victim, killer_type killer, bool gives_xp, bool pet_kill);
void abandon();
void wrath();
}
