/**
 * @file
 * @brief Functions for using some of the wackier inventory items.
**/

#pragma once

#include <vector>
#include "evocation.h"
#include "spl-cast.h"

using std::vector;

struct dice_def;

constexpr int CENTIPEDE_BAUBLE_MINSKILL = 4;

string manual_skill_names(bool short_text=false);

void wind_blast(actor* agent, int pow, coord_def target);
bool agraphede_summon_spiders(int power, int count, const coord_def& target);

string cannot_evoke_item_reason(const item_def *item=nullptr,
                                bool temp=true, bool ident=true,
                                bool *god_forbids=nullptr, bool allow_empty=false);
bool item_currently_evokable(const item_def *item);
bool item_ever_evokable(const item_def &item);
bool evoke_item(item_def &item, dist *target=nullptr);
spret evoke_device(item_def& item, dist* target, const evocation& activation = {});
int wand_mp_cost();
int wand_power(spell_type spell, int skill_bonus = 0);
void zap_wand(int slot = -1, dist *target=nullptr);

int tremorstone_count(int pow);

string target_evoke_desc(const monster_info& mi, const item_def& item);
string evoke_damage_string(const item_def& item);
string evoke_noise_string(const item_def& item);

dice_def pyromania_damage(bool random = true, bool max = false);
int pyromania_trigger_chance(bool max = false);
int mesmerism_orb_radius(bool max = false);
int stardust_orb_max(bool max = false);
int stardust_orb_power(int mp_spent, bool max_evo = false);
void stardust_orb_trigger(int mp_spent);
bool mirror_can_effect(monster *victim);
bool recall_pipe_can_recall(const monster& target);
