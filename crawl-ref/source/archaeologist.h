#pragma once

#include <string>

#include "skill-type.h"

struct item_def;

namespace archaeologist
{
// Start and progress are owned by the active player; item properties retain
// the owner identity when an item is dropped or carried by another hero.
void start_quest();
void on_level_change();
void on_manual_training(skill_type skill, int bonus);
void reconcile_training();
void on_skill_maxed(skill_type skill);
// Returns true when a deciphered tome is consumed instead of entering inventory.
bool on_pickup(item_def& item);
std::string item_description(const item_def& item);
}
