#include "AppHdr.h"

#include "protean.h"
#include "message.h"
#include "player.h"
#include "player-equip.h"
#include "unwind.h"

namespace protean
{
int mutation_levels(const player& p)
{
    if (p.species != SP_PROTEAN)
        return 0;
    int total = 0;
    for (int i = 0; i < NUM_MUTATIONS; ++i)
        total += max(0, p.mutation[i] - p.innate_mutation[i]);
    return total;
}

int health_bonus_percent(const player& p)
{
    return 4 * mutation_levels(p);
}

size_type size_for_hp(int max_hp)
{
    if (max_hp < 50) return SIZE_TINY;
    if (max_hp < 100) return SIZE_LITTLE;
    if (max_hp < 150) return SIZE_SMALL;
    if (max_hp < 200) return SIZE_MEDIUM;
    if (max_hp < 300) return SIZE_LARGE;
    return SIZE_GIANT;
}

void reconcile_equipment()
{
    static bool reconciling = false;
    if (you.species != SP_PROTEAN || reconciling)
        return;
    unwind_bool guard(reconciling, true);
    const vector<item_def*> to_remove = you.equipment.get_forced_removal_list(true);
    for (item_def* item : to_remove)
    {
        mprf("%s no longer fits and falls away!", item->name(DESC_YOUR).c_str());
        unequip_item(*item, false);
    }
    you.equipment.update();
}
}
