#pragma once

struct item_def;

namespace party
{
// Superlative tallies live in each hero's props across save and resume.
void save_tallies();
void restore_tallies();
int slot_citation_points(int slot);
// Chef's Citations for the loot race. Heavy Pebbles doubles relics, runes
// and floor-firsts.
void award_item_citation(const item_def &item, int value_score);
void set_seasoning_heavy_pebbles(bool enabled);
}
