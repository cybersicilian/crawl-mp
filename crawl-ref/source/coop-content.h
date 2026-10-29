#pragma once

#include "monster-type.h"
#include "object-class-type.h"
#include "spell-type.h"
#include "spl-cast.h"

// Content eligibility follows the saved game mode, not roster size or the
// number of connected clients. IDs remain stable for existing saves.
namespace coop_content
{
bool enabled();
bool exclusive_item(object_class_type base, int subtype);
bool exclusive_unrand(int index);
bool exclusive_monster(monster_type monster);
bool exclusive_spell(spell_type spell);
bool spell_available(spell_type spell);
bool has_spell_companion();
bool offers_fellowship_prayer();
bool can_pray(bool quiet = false);
spret pray(bool fail);
}
