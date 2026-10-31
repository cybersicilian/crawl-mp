#pragma once

#include <string>
#include <vector>
#include "ability-type.h"
#include "god-type.h"
#include "killer-type.h"
#include "skill-type.h"
#include "spl-cast.h"

class player;
class monster;
class actor;
class dist;

namespace eldritch
{
struct power
{
    god_type god;
    ability_type native_ability;
    const char* name;
    int defiance;
    int range;
    bool passive;
    const char* benefit;
    const char* punishment;
};
const std::vector<power>& powers();
const power* policy(god_type god);
ability_type ability(god_type god);
god_type god_for_ability(ability_type ability);
bool is_ability(ability_type ability);
bool has(const player& owner, god_type god);
bool has(god_type god);
int rank(const player& owner);
int rank();
int reserve(const player& owner);
int cost(god_type god);
bool spend(int amount);
std::string reason(ability_type ability);
std::string summary(const player& owner);
spret invoke(ability_type ability, dist* target = nullptr);
spret profane(bool confirm = true, skill_type insight = SK_NONE);
spret invoke_power(god_type god, dist* target);
spret borrow_thread();
void recover(unsigned int experience);
void tick();
void leave_floor();
void credited_kill();
void on_damage(monster& target, const actor* agent, int damage);
int skill_bonus(const player& owner, skill_type skill, bool temporary);
int torment_reduction();
int shield_bonus(const player& owner);
int armour_bonus(const player& owner);
int wrath_remaining(const player& owner, god_type god);
bool rite_active();
bool party_rite_active();
void rite_tick();
void record_trial_defeat(const monster& target, killer_type killer);
spret start_rite();
}
