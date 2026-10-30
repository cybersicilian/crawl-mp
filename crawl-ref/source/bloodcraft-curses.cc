#include "AppHdr.h"
#include "chain-devil.h"
#include "bloodcraft.h"

#include "act-iter.h"
#include "env.h"
#include "level-time.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "spl-cast.h"
#include "spl-util.h"

namespace bloodcraft
{
namespace
{
struct curse_state
{
    int source = 0;
    int root = 0;
    int anchor = 0;
    int sight = 0;
    int blind = 0;
    int penalty = 0;
};

curse_state read(const CrawlStoreValue& value)
{
    const auto& t = value.get_table();
    curse_state c;
    c.source = t["source"].get_int();
    c.root = t["root"].get_int();
    c.anchor = t["anchor"].get_int();
    c.sight = t["sight"].get_int();
    c.blind = t["blind"].get_int();
    c.penalty = t["penalty"].get_int();
    return c;
}

CrawlStoreValue write(const curse_state& curse)
{
    CrawlHashTable t;
    t["source"] = curse.source;
    t["root"] = curse.root;
    t["anchor"] = curse.anchor;
    t["sight"] = curse.sight;
    t["blind"] = curse.blind;
    t["penalty"] = curse.penalty;
    return CrawlStoreValue(t);
}

template <typename Query>
int strongest(const monster& mon, Query query)
{
    int result = 0;
    if (mon.props.exists(curses_key))
        for (const auto& value : mon.props[curses_key].get_vector())
            result = max(result, static_cast<int>(query(read(value), level_elapsed_time(mon))));
    return result;
}

void remove_source(monster& mon, int source)
{
    if (!mon.props.exists(curses_key))
        return;
    auto& entries = mon.props[curses_key].get_vector();
    for (int i = entries.size() - 1; i >= 0; --i)
        if (read(entries[i]).source == source)
        {
            if (read(entries[i]).root > level_elapsed_time(mon))
                mon.props[recovery_key] = level_elapsed_time(mon) + 30;
            entries.erase(i);
        }
    if (entries.empty())
        mon.props.erase(curses_key);
}

void select_quarry(const monster& target)
{
    for (monster_iterator mi; mi; ++mi)
        if (mi->mid != target.mid)
            remove_source(**mi, you.mid);
}
}

bool bound(const monster& mon)
{
    return strongest(mon, [](const curse_state& c, int now) { return c.root > now; });
}
bool anchored(const monster& mon)
{
    return strongest(mon, [](const curse_state& c, int now) { return c.anchor > now; });
}
bool blinded(const monster& mon)
{
    return strongest(mon, [](const curse_state& c, int now) { return c.blind > now; });
}
int accuracy_penalty(const monster& mon)
{
    // Native blindness already imposes the stronger impairment; do not multiply.
    if (mon.blinded())
        return 0;
    return strongest(mon, [](const curse_state& c, int now)
        { return c.sight > now ? c.penalty : 0; });
}
bool binding_recovery(const monster& mon)
{
    return mon.props.exists(recovery_key)
        && mon.props[recovery_key].get_int() > level_elapsed_time(mon);
}

bool dispel_curses(monster& mon)
{
    const bool root = bound(mon);
    const bool active = root || anchored(mon) || blinded(mon)
        || strongest(mon, [](const curse_state& c, int now) { return c.sight > now; });
    if (root)
        mon.props[recovery_key] = level_elapsed_time(mon) + 30;
    mon.props.erase(curses_key);
    return active;
}

void clear_curses()
{
    for (monster_iterator mi; mi; ++mi)
        remove_source(**mi, you.mid);
}

spret cast_curse(spell_type spell, int power, const coord_def& target, bool fail, bool amp)
{
    monster* mon = monster_at(target);
    if (!mon || !you.can_see(*mon) || !you.see_cell_no_trans(target)
        || grid_distance(you.pos(), target) > curse_range(power)
        || mon->wont_attack() || mon->is_firewood())
    {
        mpr("There is no eligible quarry there.");
        return spret::abort;
    }
    const bool can_bind = !mon->is_stationary() && !mon->is_binding_sigil_immune()
        && !bound(*mon) && !chains::held(*mon) && !binding_recovery(*mon);
    const bool can_anchor = amp && !mon->no_tele();
    if (spell == SPELL_SCARLET_FETTERS && !can_bind && !can_anchor)
    {
        mpr("That quarry cannot be bound again yet, or would be unaffected.");
        return spret::abort;
    }
    const int hp = amp ? amplification_cost(unreserved_hp()) : 0;
    if (hp && !enough_hp(hp, false))
        return spret::abort;
    fail_check();
    if (hp)
        pay_hp(hp);
    select_quarry(*mon);

    if (!mon->props.exists(curses_key))
        mon->props[curses_key].new_vector(SV_HASH);
    auto& entries = mon->props[curses_key].get_vector();
    curse_state curse;
    curse.source = you.mid;
    int index = -1;
    for (int i = entries.size() - 1; i >= 0; --i)
    {
        const auto old = read(entries[i]);
        if (old.source == curse.source)
        {
            curse = old;
            index = i;
            break;
        }
    }
    const int now = level_elapsed_time(*mon);
    if (spell == SPELL_SCARLET_FETTERS)
    {
        const int duration = binding_duration(power, amp);
        if (can_bind && mon->check_willpower(&you, power + (amp ? 30 : 0)) <= 0)
        {
            curse.root = now + duration;
            mon->props[recovery_key] = curse.root + 30;
            simple_monster_message(*mon, " is held by scarlet fetters!");
        }
        else
            simple_monster_message(*mon, " resists the binding.");
        if (can_anchor)
        {
            curse.anchor = now + duration;
            simple_monster_message(*mon, " is anchored to this dimension.");
        }
    }
    else
    {
        curse.sight = now + sight_duration(power, amp);
        curse.penalty = sight_penalty(power);
        curse.blind = amp && !mon->res_blind()
            && mon->check_willpower(&you, power + 30) <= 0 ? curse.sight : 0;
        simple_monster_message(*mon, curse.blind > now
            ? " loses its sight!" : " struggles to aim accurately.");
    }
    if (index >= 0)
        entries[index] = write(curse);
    else
        entries.push_back(write(curse));
    behaviour_event(mon, ME_WHACK, &you);
    you.redraw_hit_points = true;
    return spret::success;
}
}
