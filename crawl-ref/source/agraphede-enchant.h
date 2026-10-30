#pragma once

class actor;

// Activate the calling player's temporary poison-on-hit effect.
void agraphede_enchant_poison(int power);

// Apply the effect to an actual target after a successful attack.
bool agraphede_enchant_hit(const actor* attacker, actor* defender);
