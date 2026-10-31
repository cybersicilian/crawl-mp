#pragma once

#include <string>

#include "job-type.h"
#include "species-type.h"

class monster;
class player;

// Stable values: these may be stored with a character in future saves.
enum class character_trait
{
    none = 0,
    mummy = 1,
    zombie = 2,
    ghost = 3,
};

enum class trait_restriction
{
    allowed,
    invalid_trait,
    invalid_species,
    already_undead,
    nonliving,
    incompatible_background,
};

// Shared by character creation, preview, and the runtime validation boundary.
// This only checks trait compatibility; ordinary species/job restrictions
// still apply independently.
trait_restriction check_trait(character_trait trait, species_type species,
                              job_type job);
const char *trait_restriction_reason(trait_restriction restriction);
const char *character_trait_name(character_trait trait);
bool parse_character_trait(const std::string& name, character_trait& trait);
character_trait get_character_trait(const player& p);
trait_restriction set_character_trait(player& p, character_trait trait);
// Called once after the host species' innate mutations are initialized.
void give_basic_trait_mutations();
void give_level_trait_mutations(int xp_level);

// Ghost trait (drawn from bloatcrawl2's Mirror Eidolon): the spectral body
// never regenerates on its own and slowly fades, but feeding on kills
// restores it. The fade is a steady 1 HP per GHOST_FADE_TURNS player turns
// and never reduces HP below 1 on its own.
constexpr int GHOST_FADE_TURNS = 15;
// Harvest heals 1 + the victim's hit dice, capped at this fraction of max HP.
constexpr int GHOST_HARVEST_CAP_DIVISOR = 4;

// True when this player's trait forbids natural HP regeneration entirely.
bool trait_blocks_natural_regen(const player& p);
// Advance the fade clock by `delay` aut for `p`; returns HP lost (0 or more).
int ghost_trait_fade(player& p, int delay);
// HP a ghost-trait player of `hp_max` would harvest from a kill of `hit_dice`.
int ghost_trait_harvest_amount(int hit_dice, int hp_max);
// Restore HP to `p` for personally killing `mons`; returns HP gained. Only
// acts for ghost-trait players and only if the kill was worth experience.
int ghost_trait_harvest(player& p, const monster& mons, bool gives_xp);
