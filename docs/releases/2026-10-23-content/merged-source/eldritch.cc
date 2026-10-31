#include "AppHdr.h"
#include "eldritch.h"

#include "act-iter.h"
#include "ability.h"
#include "bloodcraft.h"
#include "env.h"
#include "god-vellum.h"
#include "god-vorr.h"
#include "level-time.h"
#include "mon-death.h"
#include "menu.h"
#include "message.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "prompt.h"
#include "religion.h"
#include "skills.h"
#include "stringutil.h"
#include "terrain.h"

namespace eldritch
{
namespace
{
constexpr const char* choices_key = "eldritch_choices";
constexpr const char* defiance_key = "eldritch_defiance";

int value(const player& owner, const char* key)
{
    return owner.props.exists(key) ? owner.props[key].get_int() : 0;
}

skill_type choose_insight()
{
    Menu menu(MF_SINGLESELECT);
    menu.set_title("Borrowed Insight: choose one skill permanently");
    menu_letter letter;
    for (int i = 0; i < NUM_SKILLS; ++i)
    {
        const auto skill = static_cast<skill_type>(i);
        if ((is_mundane_skill(skill) || is_magic_skill(skill))
            && !is_useless_skill(skill, false))
        {
            auto* entry = new MenuEntry(skill_name(skill), MEL_ITEM, 1, letter++);
            entry->data = reinterpret_cast<void*>(static_cast<intptr_t>(i + 1));
            menu.add_entry(entry);
        }
    }
    menu.show();
    vector<MenuEntry*> selected;
    menu.get_selected(&selected);
    return selected.empty() ? SK_NONE
        : static_cast<skill_type>(reinterpret_cast<intptr_t>(selected.front()->data) - 1);
}

int choices(const player& owner)
{
    return owner.props.exists(choices_key) ? owner.props[choices_key].get_vector().size() : 0;
}
}

bool has(const player& owner, god_type god)
{
    if (owner.species != SP_ELDRITCH || !owner.props.exists(choices_key) || !policy(god))
        return false;
    for (const auto& choice : owner.props[choices_key].get_vector())
        if (choice.get_table()["god"].get_int() == god)
            return true;
    return false;
}

bool has(god_type god) { return has(you, god); }
int rank(const player& owner) { return min(3, max(0, value(owner, "eldritch_rites"))); }
int rank() { return rank(you); }
int reserve(const player& owner) { return max(0, min(100, value(owner, defiance_key))); }
int cost(god_type god)
{
    const auto* row = policy(god);
    return !row ? 0 : row->defiance - (god == GOD_GOZAG ? 3 * rank() : 0);
}

bool spend(int amount)
{
    if (you.species != SP_ELDRITCH || amount < 0 || reserve(you) < amount)
        return false;
    you.props[defiance_key] = reserve(you) - amount;
    you.redraw_status_lights = true;
    return true;
}

int wrath_remaining(const player& owner, god_type god)
{
    if (has(owner, god))
        for (const auto& choice : owner.props[choices_key].get_vector())
            if (choice.get_table()["god"].get_int() == god)
                return choice.get_table()["wrath"].get_int();
    return 0;
}

std::string reason(ability_type selected)
{
    if (you.species != SP_ELDRITCH)
        return "Only Eldritch can profane the gods.";
    if (you.berserk() || you.confused() || you.cannot_act())
        return "You cannot direct stolen divinity in this state.";
    if (selected == ABIL_PROFANE_ALTAR)
    {
        const god_type god = feat_altar_god(env.grid(you.pos()));
        if (choices(you) >= 3)
            return "You have already chosen three gods.";
        if (!policy(god) || is_unavailable_god(god))
            return "Stand on an available god's own altar to profane it.";
        if (has(god))
            return "You have already stolen this god's power.";
        return "";
    }
    if (selected == ABIL_ELDER_RITE)
    {
        if (!choices(you))
            return "Profane your first altar before undertaking an Elder Rite.";
        if (rank() >= 3)
            return "You have completed all three Elder Rites.";
        if (you.experience_level < 9 + 6 * rank())
            return make_stringf("Your next Elder Rite requires XL%d.", 9 + 6 * rank());
        if (party_rite_active())
            return "An Elder Rite is already active in your party.";
        return "";
    }
    const god_type god = god_for_ability(selected);
    const auto* row = policy(god);
    if (!row || row->passive || !has(god))
        return "You have not stolen this invocation.";
    if (you.is_silenced() && !ability_permits_silence(row->native_ability))
        return "Silence prevents this stolen invocation.";
    if (reserve(you) < cost(god))
        return make_stringf("You need %d Defiance; combat XP restores it.", cost(god));
    if (god == GOD_TROG && !you.can_go_berserk(true, false, true))
        return "You cannot go berserk now.";
    if ((god == GOD_ELYVILON || god == GOD_RU) && you.duration[DUR_DEATHS_DOOR])
        return "Death's Door prevents healing.";
    if (god == GOD_RU && you.duration[DUR_EXHAUSTED])
        return "You are exhausted.";
    return "";
}

spret profane(bool confirm, skill_type insight)
{
    const std::string blocked = reason(ABIL_PROFANE_ALTAR);
    if (!blocked.empty())
    {
        mpr(blocked);
        return spret::abort;
    }
    const god_type god = feat_altar_god(env.grid(you.pos()));
    const auto& row = *policy(god);
    if (god == GOD_ASHENZARI && insight == SK_NONE)
        insight = choose_insight();
    if (god == GOD_ASHENZARI
        && (insight < 0 || insight >= NUM_SKILLS
            || !(is_mundane_skill(insight) || is_magic_skill(insight))
            || is_useless_skill(insight, false)))
        return spret::abort;
    if (confirm && !yesno(make_stringf(
        "Permanently steal %s from %s? %s Wrath: %s (%d of 3 choices)",
        row.name, god_name(god).c_str(), row.benefit, row.punishment,
        choices(you) + 1).c_str(), false, 'n'))
        return spret::abort;
    // Revalidate after menus/confirmation; no altar or ally state is mutated.
    if (!reason(ABIL_PROFANE_ALTAR).empty())
        return spret::abort;
    if (!you.props.exists(choices_key))
        you.props[choices_key].new_vector(SV_HASH);
    CrawlHashTable entry;
    entry["god"] = static_cast<int>(god);
    const int level_xp = exp_needed(you.experience_level + 1) - exp_needed(you.experience_level);
    entry["wrath"] = max(500, level_xp * 3) * (choices(you) + 1);
    you.props[choices_key].get_vector().push_back(CrawlStoreValue(entry));
    if (!you.props.exists("eldritch_first_theft"))
    {
        you.props["eldritch_first_theft"] = true;
        you.props[defiance_key] = 40;
    }
    if (god == GOD_ASHENZARI)
        you.props["eldritch_insight_skill"] = static_cast<int>(insight);
    you.redraw_status_lights = you.redraw_armour_class = you.redraw_evasion = true;
    mprf("You profane %s's altar and steal %s!", god_name(god).c_str(), row.name);
    return spret::success;
}

spret invoke(ability_type selected, dist* target)
{
    const std::string blocked = reason(selected);
    if (!blocked.empty())
    {
        mpr(blocked);
        return spret::abort;
    }
    if (selected == ABIL_PROFANE_ALTAR)
        return profane();
    if (selected == ABIL_ELDER_RITE)
        return start_rite();
    return invoke_power(god_for_ability(selected), target);
}

void recover(unsigned int experience)
{
    if (you.species != SP_ELDRITCH || !choices(you) || !experience)
        return;
    const int denominator = max(50u, (exp_needed(you.experience_level + 1)
        - exp_needed(you.experience_level)) / 5);
    const int64_t credit = static_cast<int64_t>(value(you, "eldritch_xp_credit"))
        + static_cast<int64_t>(experience) * 100;
    you.props[defiance_key] = static_cast<int>(min<int64_t>(100, reserve(you) + credit / denominator));
    you.props["eldritch_xp_credit"] = reserve(you) == 100 ? 0 : static_cast<int>(credit % denominator);
    for (auto& choice : you.props[choices_key].get_vector())
    {
        int& remaining = choice.get_table()["wrath"].get_int();
        remaining = static_cast<int>(max<int64_t>(0, static_cast<int64_t>(remaining) - experience));
    }
    you.props["eldritch_wrath_credit"] = min(1000000,
        value(you, "eldritch_wrath_credit") + static_cast<int>(min(experience, 1000000u)));
    you.redraw_status_lights = true;
}

int skill_bonus(const player& owner, skill_type skill, bool temporary)
{
    int bonus = has(owner, GOD_ASHENZARI) && owner.props.exists("eldritch_insight_skill")
        && owner.props["eldritch_insight_skill"].get_int() == skill ? 1 + rank(owner) : 0;
    if (temporary && owner.duration[DUR_ELDER_HEROISM] && skill <= SK_LAST_MUNDANE)
        bonus += 1 + rank(owner);
    if (temporary && owner.duration[DUR_ELDER_SAP] && skill == SK_SPELLCASTING)
        bonus -= 4;
    if (temporary && owner.duration[DUR_ELDER_EVO_DRAIN] && skill == SK_EVOCATIONS)
        bonus -= 4;
    return bonus;
}

int torment_reduction() { return has(GOD_KIKUBAAQUDGHA) ? 20 + 10 * rank() : 0; }
int shield_bonus(const player& owner) { return owner.duration[DUR_ELDER_SHIELD] ? 3 + rank(owner) : 0; }
int armour_bonus(const player& owner) { return owner.duration[DUR_ELDER_ARMOUR] ? 2 + rank(owner) : 0; }

std::string summary(const player& owner)
{
    if (owner.species != SP_ELDRITCH)
        return "";
    std::string text = make_stringf("Defiance %d/100; Elder Rites %d/3.", reserve(owner), rank(owner));
    for (const auto& row : powers())
        if (has(owner, row.god))
            text += make_stringf("\n%s: %s (%s). %s", god_name(row.god).c_str(), row.name,
                wrath_remaining(owner, row.god) ? "angry" : "settled", row.benefit);
    return text;
}

void credited_kill()
{
    if (has(GOD_MAKHLEB) && !you.duration[DUR_DEATHS_DOOR])
        inc_hp(3 + rank(), true);
    if (has(GOD_VEHUMET))
        inc_mp(1 + rank());
}

void on_damage(monster& target, const actor* agent, int damage)
{
    if (!agent || !agent->is_player() || damage <= 0
        || !(target.holiness() & MH_NATURAL))
        return;
    const int slot = party::slot_for_mid(agent->mid);
    if (slot < 0)
        return;
    party::scoped_player_context context(slot);
    if (!has(GOD_VORR) || !vorr::worthy(target) || you.duration[DUR_DEATHS_DOOR])
        return;
    const int clock = level_elapsed_time(target) / BASELINE_DELAY;
    if (!you.props.exists("eldritch_blood_clock") || value(you, "eldritch_blood_clock") != clock)
    {
        you.props["eldritch_blood_clock"] = clock;
        you.props["eldritch_blood_used"] = 0;
    }
    const int credit = value(you, "eldritch_blood_fraction") + damage * (2 + rank());
    const int amount = min(credit / 100,
        max(0, 3 + you.skill(SK_INVOCATIONS) / 6 - value(you, "eldritch_blood_used")));
    you.props["eldritch_blood_fraction"] = credit % 100;
    const int recovered = min(amount, you.hp_max - you.hp);
    you.props["eldritch_blood_used"] = value(you, "eldritch_blood_used") + recovered;
    inc_hp(recovered, true);
}
}
