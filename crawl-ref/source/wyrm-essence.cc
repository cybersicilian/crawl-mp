#include "AppHdr.h"

#include "wyrm-essence.h"

#include "mon-ench.h"
#include "cloud.h"
#include "coord.h"
#include "monster.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "religion.h"

namespace wyrm_essence
{
static const char* const CITRINITAS_OWNER = "wyrm_citrinitas_owner";
static const char* const NIGREDO_OWNER = "wyrm_nigredo_owner";
bool is_essence(potion_type potion)
{
    return potion >= POT_NIGREDO && potion <= POT_RUBEDO;
}

int infusion_piety(const monster& mon, enchant_type enchantment)
{
    if (!mon.has_ench(enchantment))
        return 0;
    const mid_t owner = mon.get_ench(enchantment).source;
    const player* player_owner = owner == you.mid ? &you : party::player_by_mid(owner);
    return player_owner ? player_owner->piety() : 0;
}

bool converts_damage(const monster& source)
{
    return source.has_ench(ENCH_WYRM_VIRIDITAS)
           && source.get_ench(ENCH_WYRM_VIRIDITAS).source == you.mid;
}

void empower_player(player& recipient, int turns, mid_t owner)
{
    recipient.props[CITRINITAS_OWNER] = static_cast<int>(owner);
    recipient.increase_duration(DUR_WYRM_CITRINITAS, turns, 50);
    recipient.redraw_status_lights = true;
}

void infuse_player_nigredo(player& recipient, int turns, mid_t owner)
{
    recipient.props[NIGREDO_OWNER] = static_cast<int>(owner);
    recipient.increase_duration(DUR_WYRM_NIGREDO, turns, 50);
    recipient.redraw_status_lights = true;
}

void leave_player_miasma(player& recipient, const coord_def& previous)
{
    if (!recipient.duration[DUR_WYRM_NIGREDO] || !in_bounds(previous)
        || cloud_at(previous) || !recipient.props.exists(NIGREDO_OWNER))
        return;
    const mid_t owner = static_cast<mid_t>(recipient.props[NIGREDO_OWNER].get_int());
    const actor* source = owner == recipient.mid ? &recipient : actor_by_mid(owner);
    place_cloud(CLOUD_MIASMA, previous, 2, source);
}

int empowerment_piety()
{
    if (!you.duration[DUR_WYRM_CITRINITAS])
        return 0;
    const mid_t owner = you.props.exists(CITRINITAS_OWNER)
        ? static_cast<mid_t>(you.props[CITRINITAS_OWNER].get_int()) : you.mid;
    const player* player_owner = owner == you.mid ? &you : party::player_by_mid(owner);
    return player_owner ? player_owner->piety() : 0;
}

bool penance_extracts_potion(int roll)
{
    return player_under_penance(GOD_GREAT_WYRM) && roll == 0;
}
}
