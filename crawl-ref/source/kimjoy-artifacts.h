#pragma once

class actor;
class player;

// These helpers operate on the attacking actor or the active party member;
// callers must not invoke player effects for a different member's damage.
bool vipers_fang_virulence(actor* attacker, actor* defender, int damage);
bool golem_armour_complete(const player& wearer);
bool activate_golem_armour();
void deactivate_golem_armour();
void unseen_dragon_after_damage(int damage);
void distortion_gauntlets_after_damage(int damage);
