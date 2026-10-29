#include "AppHdr.h"
#include "coop-content.h"

#include "artefact.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "religion.h"

namespace coop_content
{
bool enabled()
{
    return party::multiplayer_enabled();
}

bool exclusive_item(object_class_type base, int subtype)
{
    switch (base)
    {
    case OBJ_POTIONS:
        return party::is_coop_potion(subtype);
    case OBJ_SCROLLS:
        return party::is_coop_scroll(subtype);
    case OBJ_JEWELLERY:
        return subtype == RING_CAMARADERIE || subtype == AMU_VANGUARD;
    case OBJ_MISCELLANY:
        return subtype == MISC_AEGIS_STANDARD || subtype == MISC_ASTRAL_BEACON
            || subtype == MISC_TWIN_SPARK_CONDUIT || subtype == MISC_SKALD_HORN;
    default:
        return false;
    }
}

bool exclusive_unrand(int index)
{
    switch (index)
    {
    case UNRAND_AEGIS_OF_FELLOWSHIP:
    case UNRAND_CONDUIT_STAFF:
    case UNRAND_TWIN_SOUL_RING:
    case UNRAND_DAWNFORGED:
    case UNRAND_DUSKWEAVER:
    case UNRAND_SHIELDMATE_GAUNTLETS:
        return true;
    default:
        return false;
    }
}

bool exclusive_monster(monster_type monster)
{
    return monster == MONS_CHAIN_WARDEN || monster == MONS_VOID_TETHER_STALKER;
}

bool exclusive_spell(spell_type spell)
{
    return spell == SPELL_AEGIS_LINK || spell == SPELL_BALLAD_OF_THE_VANGUARD
        || spell == SPELL_SANCTUARY_CHORUS;
}

bool spell_available(spell_type spell)
{
    return enabled() || !exclusive_spell(spell);
}

bool has_spell_companion()
{
    return enabled() && party::nearest_living_ally_slot(
        you.pos(), LOS_RADIUS, party::active_slot(), true) >= 0;
}

bool offers_fellowship_prayer()
{
    return enabled() && is_good_god(you.religion);
}

static bool _prayer_companion(int slot)
{
    if (slot == party::active_slot() || !party::slot_is_alive(slot)
        || party::is_player_downed(slot) || !party::slot_is_on_current_floor(slot))
    {
        return false;
    }
    const player &ally = party::get_player(slot);
    return is_good_god(ally.religion) && !ally.penance[ally.religion]
        && you.see_cell_no_trans(ally.pos());
}

bool can_pray(bool quiet)
{
    const char *reason = nullptr;
    if (!offers_fellowship_prayer())
        reason = "The good gods answer this prayer only in multiplayer.";
    else if (player_under_penance() || you.piety() < piety_breakpoint(2))
        reason = "You lack the divine favour to offer this prayer.";
    else
    {
        for (int slot = 0; slot < party::player_count(); ++slot)
            if (_prayer_companion(slot))
                return true;
        reason = "No faithful companion of the good gods is in sight.";
    }
    if (!quiet)
        mpr(reason);
    return false;
}

spret pray(bool fail)
{
    if (!can_pray())
        return spret::abort;
    fail_check();

    const int skill = you.skill(SK_INVOCATIONS);
    const int turns = 5 + skill / 3;
    const int healing = 5 + random2(1 + skill / 2);
    mprf(MSGCH_GOD, "%s answers your prayer for your companions.",
         god_name(you.religion).c_str());
    for (int slot = 0; slot < party::player_count(); ++slot)
        if (slot == party::active_slot() || _prayer_companion(slot))
            party::heal_or_buff_party_member(slot, healing, DUR_REGENERATION, turns);
    return spret::success;
}
}
