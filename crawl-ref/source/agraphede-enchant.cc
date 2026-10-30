#include "AppHdr.h"

#include "agraphede-enchant.h"

#include "actor.h"
#include "beam.h"
#include "message.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "random.h"

void agraphede_enchant_poison(int power)
{
    you.increase_duration(DUR_AGRAPHEDE_ENCHANT_POISON,
                          8 + roll_dice(2, max(1, power)), 100);
    mpr("Agraphede imbues your attacks with venom.");
}

bool agraphede_enchant_hit(const actor* attacker, actor* defender)
{
    if (!attacker || !attacker->is_player() || !defender
        || !defender->is_monster() || !defender->alive())
        return false;
    const player* owner = attacker->as_player();
    monster* target = defender->as_monster();
    // Multiplayer proxies represent players and must not receive monster
    // enchantments in place of their owning player.
    if (!owner->duration[DUR_AGRAPHEDE_ENCHANT_POISON]
        || party::is_proxy_monster(*target))
        return false;
    return poison_monster(target, attacker);
}
