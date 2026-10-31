#pragma once

#include <string>

#include "item-prop-enum.h"
#include "spl-cast.h"

class actor;
class player;
struct item_def;

namespace elemental_weapon
{
spret cast(int power, bool fail);
void on_spell_cast(spell_type spell);
void on_unequip(const item_def& item);
void end();
brand_type brand(const actor& owner, const item_def* item);
int damage_bonus(const actor& owner, const item_def* item);
std::string description(const player& owner, const item_def& item);
}
