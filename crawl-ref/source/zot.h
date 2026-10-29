/**
 * @file
 * @brief Zot clock functions.
**/

#pragma once

// How many auts does the clock roll back every time the player
// enters a new floor?
const int ZOT_CLOCK_PER_FLOOR = 6000 * BASELINE_DELAY;
// After how many auts without visiting new floors does the player die instantly?
const int MAX_ZOT_CLOCK = 27000 * BASELINE_DELAY;

int zot_clock_scale_pct();
int zot_clock_per_floor();
int max_zot_clock();

bool bezotted();
bool bezotted_in(branch_type br);
bool should_fear_zot();
bool zot_immune();
bool zot_clock_active();
int zot_short_lifespan_count();
int zot_lifespan_divisor();
int zot_clock_remaining_aut();
int zot_clock_capacity_aut();
int bezotting_level();
int bezotting_level_in(branch_type br);
int turns_until_zot();
int turns_until_zot_in(branch_type br);
void decr_zot_clock(bool extra_life = false);
void incr_zot_clock();
// Advance party deadlines by campaign time (multiplayer) or region time (solo).
void incr_party_zot_clocks(int elapsed);
void set_turns_until_zot(int turns_left);

bool gem_clock_active();
void incr_gem_clock();
void print_gem_warnings(int gem, int old_time_taken);
void maybe_break_floor_gem();
void shatter_floor_gem(bool quiet = false);
int gem_time_left(int gem);
string gem_status();
