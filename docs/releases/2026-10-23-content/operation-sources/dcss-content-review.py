from pathlib import Path
r=Path('/Users/iancaltabiano/Documents/Projects/dcss/crawl-ref/source')
def edit(n,a,b):
 p=r/n;s=p.read_text();assert s.count(a)==1,(n,a[:80],s.count(a));p.write_text(s.replace(a,b))
edit('player.cc','''    return level;
}

int player_icemail_armour_class''','''    return max(0, level);
}

int player_icemail_armour_class''')
edit('webserver/game_data/static/party-model.js','m.resists,','m.resists, m.defiance, m.elder_rites, m.elder_summary, m.chain_summary,')
edit('eldritch-powers.cc','''                && mon->check_willpower(&you, 30 + you.skill(SK_INVOCATIONS, 3)) <= 0
                && !mon->is_stationary())
                mon->add_ench(mon_enchant(ENCH_SLOW, &you, (2 + rank()) * BASELINE_DELAY));''','''                && !mon->is_stationary())
            {
                const int old_duration = mon->has_ench(ENCH_SLOW)
                    ? mon->get_ench(ENCH_SLOW).duration : 0;
                mon->slow_down(&you, 30 + you.skill(SK_INVOCATIONS, 3));
                if (mon->has_ench(ENCH_SLOW))
                {
                    auto effect = mon->get_ench(ENCH_SLOW);
                    effect.duration = min(effect.duration, max(old_duration, (2 + rank()) * BASELINE_DELAY));
                    mon->update_ench(effect);
                }
            }''')
edit('eldritch-rites.cc','#include "env.h"','#include "env.h"\n#include "fight.h"')
edit('eldritch-rites.cc','''        ouch(3 + random2(4 + you.experience_level), KILLED_BY_DIVINE_WRATH,
             MID_NOBODY, god_name(god).c_str());''','''        ouch(resist_adjust_damage(&you, god == GOD_KIKUBAAQUDGHA ? BEAM_NEG
            : god == GOD_VEHUMET ? BEAM_FIRE : BEAM_MMISSILE,
            3 + random2(4 + you.experience_level)), KILLED_BY_DIVINE_WRATH,
            MID_NOBODY, god_name(god).c_str());''')
edit('eldritch.cc','''    if (!agent || !agent->is_player() || damage <= 0 || !vorr::worthy(target)
        || !(target.holiness() & MH_NATURAL))''','''    if (!agent || !agent->is_player() || damage <= 0
        || !(target.holiness() & MH_NATURAL))''')
edit('eldritch.cc','''    if (!has(GOD_VORR) || you.duration[DUR_DEATHS_DOOR])''','''    if (!has(GOD_VORR) || !vorr::worthy(target) || you.duration[DUR_DEATHS_DOOR])''')
edit('duration-data.h','#include "god-abil.h"','#include "god-abil.h"\n#include "god-vellum.h"')
edit('duration-data.h','{{ "Your borrowed thread regains its strength." }}','{{ "Your borrowed thread regains its strength.", vellum::refresh }}')
edit('eldritch.h','void rite_tick();','void rite_tick();\nvoid record_trial_defeat(const monster& target, killer_type killer);')
edit('eldritch-rites.cc','''        created.push_back(mon->mid);
    }
    return true;''','''        created.push_back(mon->mid);
    }
    auto& members = env.properties[rite_key].get_table()["actors"].get_vector();
    for (mid_t member : created)
        members.push_back(CrawlStoreValue(static_cast<int>(member)));
    return true;''')
edit('eldritch-rites.cc','''    if (!spawn_wave(rank(), 0))
        return spret::abort;
    CrawlHashTable attempt;''','''    CrawlHashTable attempt;''')
edit('eldritch-rites.cc','''    env.properties[rite_key] = attempt;
    mpr("Your Elder Rite begins.''','''    attempt["actors"].new_vector(SV_INT);
    attempt["defeated"].new_vector(SV_INT);
    env.properties[rite_key] = attempt;
    if (!spawn_wave(rank(), 0))
    {
        env.properties.erase(rite_key);
        return spret::abort;
    }
    mpr("Your Elder Rite begins.''')
edit('eldritch-rites.cc','''    if (attempt["wave"].get_int() < 2)
        return;''','''    if (attempt["wave"].get_int() < 2 || attempt["actors"].get_vector().size() != 4
        || attempt["defeated"].get_vector().size() != 4)
        return;''')
edit('eldritch-rites.cc','void leave_floor()\n{','''void record_trial_defeat(const monster& target, killer_type killer)
{
    if (!rite_active() || !target.props.exists(trial_key)
        || killer == KILL_RESET || killer == KILL_RESET_KEEP_ITEMS
        || killer == KILL_TIMEOUT || killer == KILL_TENTACLE_CLEANUP
#if TAG_MAJOR_VERSION == 34
        || killer == KILL_UNSUMMONED
#endif
        || killer == KILL_PACIFIED || killer == KILL_BOUND || killer == KILL_SLIMIFIED)
        return;
    auto& attempt = env.properties[rite_key].get_table();
    if (target.props[trial_key].get_int() != attempt["owner"].get_int())
        return;
    auto& defeated = attempt["defeated"].get_vector();
    for (const auto& member : defeated)
        if (member.get_int() == static_cast<int>(target.mid))
            return;
    for (const auto& member : attempt["actors"].get_vector())
        if (member.get_int() == static_cast<int>(target.mid))
        {
            defeated.push_back(CrawlStoreValue(static_cast<int>(target.mid)));
            return;
        }
}

void leave_floor()
{''')
edit('mon-death.cc','''    crawl_state.dec_mon_acting(&mons);
    monster_cleanup(&mons, reset);''','''    crawl_state.dec_mon_acting(&mons);
    eldritch::record_trial_defeat(mons, killer);
    monster_cleanup(&mons, reset);''')
