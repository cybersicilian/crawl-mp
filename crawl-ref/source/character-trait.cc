#include "AppHdr.h"

#include "character-trait.h"
#include "mutation.h"
#include "player.h"
#include "species.h"

namespace
{
const char *const TRAIT_KEY = "character_trait";
}

trait_restriction check_trait(character_trait trait, species_type sp,
                              job_type job)
{
    switch (trait)
    {
    case character_trait::none:
    case character_trait::mummy:
    case character_trait::zombie:
    case character_trait::ghost:
        break;
    default:
        return trait_restriction::invalid_trait;
    }

    if (!species::is_valid(sp))
        return trait_restriction::invalid_species;
    if (trait == character_trait::none)
        return trait_restriction::allowed;
    if (species::is_undead(sp))
        return trait_restriction::already_undead;
    if (species::is_nonliving(sp))
        return trait_restriction::nonliving;

    // The Apothecary's starting kit is defined by potions, which mummies
    // cannot drink and which new-game setup would otherwise discard.
    if (trait == character_trait::mummy && job == JOB_APOTHECARY)
        return trait_restriction::incompatible_background;

    if (job == JOB_PALADIN || job == JOB_PREACHER || job == JOB_HEALER
        || job == JOB_SLIME_PRIEST
        || job == JOB_SHAPESHIFTER || job == JOB_STALKER
#if TAG_MAJOR_VERSION == 34
        || job == JOB_PRIEST
#endif
        )
    {
        return trait_restriction::incompatible_background;
    }
    return trait_restriction::allowed;
}

const char *trait_restriction_reason(trait_restriction restriction)
{
    switch (restriction)
    {
    case trait_restriction::allowed: return "";
    case trait_restriction::invalid_trait: return "Unknown trait.";
    case trait_restriction::invalid_species: return "Choose a valid species first.";
    case trait_restriction::already_undead: return "This species is already undead.";
    case trait_restriction::nonliving: return "This species is nonliving.";
    case trait_restriction::incompatible_background:
        return "This background is incompatible with an undead trait.";
    }
    return "Unknown trait restriction.";
}

const char *character_trait_name(character_trait trait)
{
    switch (trait)
    {
    case character_trait::none: return "none";
    case character_trait::mummy: return "mummy";
    case character_trait::zombie: return "zombie";
    case character_trait::ghost: return "ghost";
    }
    return "unknown";
}

bool parse_character_trait(const std::string& name, character_trait& trait)
{
    for (const auto value : {character_trait::none, character_trait::mummy,
                             character_trait::zombie, character_trait::ghost})
    {
        if (name == character_trait_name(value))
        {
            trait = value;
            return true;
        }
    }
    return false;
}

character_trait get_character_trait(const player& p)
{
    if (!p.props.exists(TRAIT_KEY))
        return character_trait::none;
    const int value = p.props[TRAIT_KEY].get_int();
    if (value < static_cast<int>(character_trait::none)
        || value > static_cast<int>(character_trait::ghost))
        return character_trait::none;
    return static_cast<character_trait>(value);
}

trait_restriction set_character_trait(player& p, character_trait trait)
{
    const auto restriction = check_trait(trait, p.species, p.char_class);
    if (restriction == trait_restriction::allowed)
        p.props[TRAIT_KEY] = static_cast<int>(trait);
    return restriction;
}

void give_basic_trait_mutations()
{
    if (get_character_trait(you) != character_trait::mummy)
        return;
    // These defining mummy mutations do not conflict with species mutations.
    // Resistances are composed separately, so host species retain their own
    // opposing resistances and future species growth.
    for (const auto mut : {MUT_NO_DRINK, MUT_FAITH, MUT_NECRO_ENHANCER,
                           MUT_ACCURSED})
    {
        you.mutation[mut] = max<int>(you.mutation[mut], 1);
        you.innate_mutation[mut] = max<int>(you.innate_mutation[mut], 1);
    }
}

void give_level_trait_mutations(int xp_level)
{
    if (xp_level == 13 && get_character_trait(you) == character_trait::mummy)
        perma_mutate(MUT_NECRO_ENHANCER, 1, "mummy trait growth");
}
