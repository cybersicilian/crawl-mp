#pragma once

#include "enchant-type.h"
#include "externs.h"
#include "potion-type.h"

class monster;
class player;
struct coord_def;

namespace wyrm_essence
{
bool is_essence(potion_type potion);
// Piety belongs to the player who infused this monster, not the active slot.
int infusion_piety(const monster& mon, enchant_type enchantment);
bool converts_damage(const monster& source);
void empower_player(player& recipient, int turns, mid_t owner);
void infuse_player_nigredo(player& recipient, int turns, mid_t owner);
void leave_player_miasma(player& recipient, const coord_def& previous);
int empowerment_piety();
bool penance_extracts_potion(int roll);
}
