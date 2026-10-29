#pragma once

class actor;
class monster;
struct dice_def;

// Mana Rupture uses the victim's will before stripping it. Infinite will is
// capped for damage but remains immune to the willpower penalty.
dice_def mana_rupture_damage(int willpower, int power);
bool mana_rupture_dismiss(monster& victim, const actor* agent);
void mana_rupture_weaken(monster& victim, actor* agent);
void blight_monster(monster& victim, actor* agent, int power);
void blight_player(actor* agent, int power);
