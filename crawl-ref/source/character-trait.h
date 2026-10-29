#pragma once

#include <string>

#include "job-type.h"
#include "species-type.h"

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
