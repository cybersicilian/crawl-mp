#pragma once

#include <string>

class player;
struct player_beam_tracer;
struct coord_def;
enum spell_type : int;

namespace automaton
{
// The existing magic reserve represents remaining thermal capacity. Keeping
// it on the player preserves per-hero state and existing save compatibility.
int heat(const player& p);
void mark_combat(player& p);
int cooling_rate(const player& p, int base_regeneration);
bool overheat_from_berserk(player& p);
bool unlock_laser(player& p);
bool casting_automatically();
// Describes the currently implemented trigger; this is not a promise that a
// particular target or situation will pass the safety checks.
std::string engraving_guidance(spell_type spell);
// True only when this spell has an implemented automatic category.
bool has_automatic_trigger(spell_type spell);
bool beam_requires_confirmation(player_beam_tracer tracer);
// Automatic casts use the current hero context and consume no extra action.
bool safe_attack_engraving(spell_type spell, const coord_def& target);
bool safe_area_engraving(spell_type spell);
bool safe_ignite_engraving();
bool safe_intoxication_engraving();
bool safe_toxic_engraving();
bool safe_bog_engraving();
bool safe_bee_engraving(const coord_def& target);
bool spike_wall_has_foe(const coord_def& wall);
bool safe_spike_engraving();
bool start_bee_engraving(const coord_def& target);
int bee_winding_remaining(const player& p);
void advance_bee_engraving();
void interrupt_bee_engraving();
void mark_toxic_engraving();
void protect_toxic_engraving();
bool summon_attack_engraving_ready(spell_type spell);
bool safe_passwall_destination(const coord_def& dest);
bool passwall_escape_aim(coord_def& aim);
coord_def area_engraving_aim(spell_type spell, const coord_def& origin);
bool trigger_attack(const coord_def& target, bool ranged = false);
// One offensive opportunity after the active hero's time-consuming action.
// Reuses attack safety checks, without requiring a weapon attack first.
void react_to_action();
bool trigger_escape();
void observe_encounter();
}
