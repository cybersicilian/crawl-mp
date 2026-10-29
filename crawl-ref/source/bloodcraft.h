#pragma once

#include "spell-type.h"
#include "externs.h"
#include <string>
#include <vector>

class actor;
class monster;
class dist;
enum class spret;

namespace bloodcraft
{
constexpr const char* rite_key = "bloodcraft_rite";
constexpr const char* curses_key = "bloodcraft_curses";
constexpr const char* recovery_key = "bloodcraft_binding_recovery";

bool is_rite(spell_type spell);
bool is_curse(spell_type spell);
bool amplified(spell_type spell);
int extra_mp(spell_type spell);
int amplified_mana(spell_type spell);
spell_type active_rite();
int unreserved_hp();
int reservation(int maximum_hp);
int amplification_cost(int maximum_hp);
// Character-adjusted versions of the unmodified costs above.
int player_reservation(int maximum_hp);
int player_amplification_cost(int maximum_hp);
int reserved_hp(int maximum_hp);
int rite_die(int power);
int curse_range(int power);
int binding_duration(int power, bool amplify);
int sight_duration(int power, bool amplify);
int sight_penalty(int power);

std::string casting_reason(spell_type spell);
std::string cost_description(spell_type spell, bool amplify = false);
std::string effect_description(spell_type spell, bool amplify = false);
spret cast_rite(spell_type spell, bool fail);
spret cast_curse(spell_type spell, int power, const coord_def& target, bool fail, bool amplify = false);
spret cast_amplified(spell_type spell, dist* target = nullptr);
void dismiss_rite(bool quiet = false);

bool bound(const monster& mon);
bool anchored(const monster& mon);
bool blinded(const monster& mon);
int accuracy_penalty(const monster& mon);
bool binding_recovery(const monster& mon);
void clear_curses();
bool dispel_curses(monster& mon);
void forget_spell(spell_type spell);

// A single budget for an entire weapon action, including dual wielding,
// multi-hit weapons, cleaving and penetrating missiles. Nested spell attacks
// explicitly suspend the outer action rather than borrowing its budget.
class weapon_action
{
public:
    explicit weapon_action(bool eligible);
    ~weapon_action();
    void finish(int delay);
    void record(const actor& attacker, const actor& defender);
private:
    weapon_action* previous;
    bool enabled;
    mid_t owner;
    std::vector<mid_t> hits;
};
void record_hit(const actor& attacker, const actor& defender);
}
