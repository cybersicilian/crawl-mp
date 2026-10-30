#pragma once

#include "kill-method-type.h"
#include "spell-type.h"

// Fraction of a hit deferred into poison, before poison is applied.
int agraphede_diverted_damage(int damage, int piety);
void agraphede_divert_damage(int& damage, kill_method_type death_type);
void agraphede_feed_poison();
bool agraphede_poison_spell(spell_type spell);
