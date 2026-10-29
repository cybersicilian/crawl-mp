#pragma once

#include <string>

#include "ability-type.h"
#include "evocation.h"
#include "recharge-account.h"
#include "spl-cast.h"

struct item_def;
class dist;

namespace pakellas
{
bool active(int rank = 1);
bool is_ability(ability_type ability);
bool kit_claimed();
int field_kit(int choice);
bool eligible(const item_def& item);
bool designated(const item_def& item);
bool preserve_wand(const item_def& item);
item_def* prototype();
recharge::account workshop();
void save_workshop(const recharge::account& value);
int per_use(const item_def& item);
int ready(const item_def& item);
bool designate(item_def& item);
std::string designation_reason(const item_def& item);
std::string action_reason(const item_def& item, bool enhanced, bool borrowed,
                          bool ordinary_charges = false);
std::string description(const item_def& item);
std::string designation_quote(const item_def& item);
std::string enhancement_description(const item_def& item);
std::string summary();
std::string fingerprint(const item_def& item);
std::string reason(ability_type ability);
std::string costs(ability_type ability);
spret invoke(ability_type ability, dist* target = nullptr, int item_slot = -1,
             bool ordinary_charges = false);
// Returns the designated miscellaneous subtype to skip in the native loop.
int recover(int xp, int xp_factor);
void joined(bool migration = false);
void migrate();
}
