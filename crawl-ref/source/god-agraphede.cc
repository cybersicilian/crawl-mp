#include "AppHdr.h"

#include "god-agraphede.h"

#include "god-passive.h"
#include "player.h"
#include "random.h"
#include "religion.h"

int agraphede_diverted_damage(int damage, int piety)
{
    if (damage <= 0)
        return 0;
    const int percent = 10 + min(200, max(0, piety)) / 5;
    return min(damage, max(1, static_cast<int>(int64_t(damage) * percent / 100)));
}

void agraphede_divert_damage(int& damage, kill_method_type death_type)
{
    if (damage <= 0 || death_type == KILLED_BY_POISON
        || death_type == KILLED_BY_ZOT || death_type == KILLED_BY_WIZMODE
        || death_type == KILLED_BY_QUITTING
        || death_type == KILLED_BY_LEAVING || death_type == KILLED_BY_WINNING
        || !have_passive(passive_t::agraphede_poison_guard))
        return;
    const int diverted = agraphede_diverted_damage(damage, you.piety());
    // If poison cannot actually be applied (e.g. a lifeless transformation or
    // divine stamina), never grant free damage reduction.
    if (poison_player(diverted, "Agraphede", "deferred wounds", true))
        damage -= diverted;
}

void agraphede_feed_poison()
{
    if (have_passive(passive_t::agraphede_poison_feed)
        && !you.duration[DUR_POISONING] && you.hp > you.hp_max / 2
        && one_chance_in(6))
        poison_player(max(1, you.hp_max * 15 / 100), "Agraphede", "divine venom", true);
}

bool agraphede_poison_spell(spell_type spell)
{
    // The fork had a Poison school; current Alchemy also contains unrelated
    // spells, so preserve the poison niche explicitly rather than boosting it all.
    switch (spell)
    {
    case SPELL_MEPHITIC_CLOUD:
    case SPELL_OLGREBS_TOXIC_RADIANCE:
    case SPELL_POISONOUS_CLOUD:
    case SPELL_STING:
    case SPELL_IGNITE_POISON:
    case SPELL_INTOXICATE:
    case SPELL_NOXIOUS_BOG:
    case SPELL_POISONOUS_VAPOURS:
    case SPELL_SCORPION_FORM:
    case SPELL_ERINGYAS_ROOTSPIKE:
    case SPELL_OLGREBS_LAST_MERCY:
        return true;
    default:
        return false;
    }
}
