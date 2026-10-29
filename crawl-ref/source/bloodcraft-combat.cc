#include "AppHdr.h"
#include "bloodcraft.h"

#include "actor.h"
#include "beam.h"
#include "message.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "fight.h"
#include "god-conduct.h"
#include "religion.h"
#include "random.h"
#include "spl-cast.h"
#include "spl-util.h"

namespace bloodcraft
{
static weapon_action* current_action = nullptr;

weapon_action::weapon_action(bool eligible)
    : previous(current_action), enabled(eligible), owner(you.mid)
{
    current_action = eligible ? this : nullptr;
}

weapon_action::~weapon_action() { current_action = previous; }

void weapon_action::record(const actor& attacker, const actor& defender)
{
    if (enabled && attacker.is_player() && attacker.mid == owner && defender.is_monster()
        && !defender.is_firewood() && !mons_aligned(&attacker, &defender)
        && std::find(hits.begin(), hits.end(), defender.mid) == hits.end())
    {
        hits.push_back(defender.mid);
    }
}

void record_hit(const actor& attacker, const actor& defender)
{
    if (current_action)
        current_action->record(attacker, defender);
}

void weapon_action::finish(int delay)
{
    current_action = nullptr;
    const spell_type rite = active_rite();
    if (!enabled || you.mid != owner || rite == SPELL_NO_SPELL || you.duration[DUR_DEATHS_DOOR]
        || delay <= 0 || !you.alive() || you_worship(GOD_TROG)
        || god_forbids_spell(rite, you.religion))
    {
        return;
    }
    vector<mid_t> living;
    for (mid_t mid : hits)
        if (const monster* mon = monster_by_mid(mid))
            if (mon->alive())
                living.push_back(mid);
    if (living.empty())
        return;
    const beam_type flavour = rite == SPELL_KINDLED_VEINS ? BEAM_FIRE
        : rite == SPELL_WINTERS_DUE ? BEAM_COLD : BEAM_ELECTRICITY;
    const int budget = div_rand_round(
        (1 + random2(rite_die(calc_spell_power(rite)))) * delay, BASELINE_DELAY);
    const int share = budget / living.size();
    const int remainder = budget % living.size();
    // Allocate the whole action before applying damage: deaths and retaliation
    // cannot give later targets a second or larger budget.
    for (unsigned i = 0; i < living.size(); ++i)
        if (monster* mon = monster_by_mid(living[i]))
        {
            const int damage = resist_adjust_damage(mon, flavour,
                share + (i < static_cast<unsigned>(remainder)));
            if (damage > 0 && mon->alive() && you.alive())
            {
                simple_monster_message(*mon, rite == SPELL_KINDLED_VEINS
                    ? " burns with your kindled essence!"
                    : rite == SPELL_WINTERS_DUE
                        ? " shivers beneath winter's due!"
                        : " crackles with borrowed thunder!");
                mon->hurt(&you, damage, flavour);
            }
        }
    enabled = false;
}
}
