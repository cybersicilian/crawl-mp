#include "AppHdr.h"
#include "eldritch.h"

#include <optional>
#include "act-iter.h"
#include "artefact.h"
#include "beam.h"
#include "decks.h"
#include "delay.h"
#include "directn.h"
#include "coordit.h"
#include "fight.h"
#include "env.h"
#include "evoke.h"
#include "god-abil.h"
#include "god-vellum.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "menu.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-behv.h"
#include "mon-place.h"
#include "mon-poly.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "potion.h"
#include "random.h"
#include "skills.h"
#include "spl-goditem.h"
#include "spl-book.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"
#include "terrain.h"

namespace eldritch
{
spret borrow_thread();
namespace
{
int percent() { return 25 + 10 * rank(); }

std::optional<coord_def> aim(dist* supplied, int range, bool hostile = true,
                            bool path = false)
{
    dist selected;
    if (supplied && supplied->isCancel)
        return std::nullopt;
    if (supplied && supplied->isValid)
        selected = *supplied;
    else
    {
        direction_chooser_args args;
        args.restricts = DIR_TARGET;
        args.mode = hostile ? TARG_HOSTILE : TARG_ANY;
        args.range = range;
        args.needs_path = path;
        args.top_prompt = "Direct your stolen power where?";
        direction(selected, args);
    }
    if (!selected.isValid || selected.isCancel || !in_bounds(selected.target)
        || !you.see_cell_no_trans(selected.target)
        || grid_distance(selected.target, you.pos()) > range)
        return std::nullopt;
    return selected.target;
}

monster* hostile_at(coord_def cell)
{
    monster* target = monster_at(cell);
    return target && target->hostile() && !target->is_firewood()
        && !party::is_proxy_monster(*target) && you.can_see(*target) ? target : nullptr;
}

bool creation_alive(god_type god)
{
    for (monster_iterator mon; mon; ++mon)
        if (mon->props.exists("eldritch_echo_god")
            && mon->props["eldritch_echo_god"].get_int() == god
            && mon->summoner == you.mid)
            return true;
    return false;
}

monster* summon(god_type god, monster_type type, coord_def cell,
                monster_type base = MONS_NO_MONSTER)
{
    mgen_data mg(type, BEH_FRIENDLY, cell, MHITNOT, MG_FORCE_BEH);
    mg.set_summoned(&you, MON_SUMM_AID, (6 + 2 * rank()) * BASELINE_DELAY);
    mg.base_type = base;
    mg.extra_flags |= MF_NO_REWARD | MF_HARD_RESET;
    if (type == MONS_ANCESTOR)
        mg.hd = 1 + you.experience_level / 2;
    monster* mon = create_monster(mg);
    if (mon)
        mon->props["eldritch_echo_god"] = static_cast<int>(god);
    return mon;
}

class ElderChannel final : public Delay
{
    int amount;
    int last_hp;
    bool invalidated() override { return you.hp < last_hp || you.cannot_act(); }
    void tick() override
    {
        inc_mp(amount);
        you.time_taken = BASELINE_DELAY;
        you.turn_is_over = true;
        last_hp = you.hp;
    }
    void finish() override { }
public:
    explicit ElderChannel(int restoration)
        : Delay(2), amount(restoration), last_hp(you.hp) { }
    const char* name() const override { return "elder channel"; }
    const char* cooperative_activity_name() const override { return "channeling stolen magic"; }
    bool try_interrupt(bool) override { return true; }
};

spret petition()
{
    constexpr const char* key = "eldritch_petition";
    static const std::vector<potion_type> pool = {
        POT_MIGHT, POT_BRILLIANCE, POT_HASTE, POT_RESISTANCE, POT_INVISIBILITY,
        POT_ENLIGHTENMENT
    };
    if (!you.props.exists(key))
    {
        auto remaining = pool;
        auto& offers = you.props[key].new_vector(SV_INT);
        for (int i = 0; i < 3; ++i)
        {
            const int selected = random2(remaining.size());
            offers.push_back(CrawlStoreValue(static_cast<int>(remaining[selected])));
            remaining.erase(remaining.begin() + selected);
        }
    }
    const auto& offers = you.props[key].get_vector();
    Menu menu(MF_SINGLESELECT);
    menu.set_title(make_stringf("Counterfeit Petition — %d Defiance", cost(GOD_GOZAG)));
    menu_letter letter;
    for (const auto& offer : offers)
    {
        const auto* effect = get_potion_effect(static_cast<potion_type>(offer.get_int()));
        auto* entry = new MenuEntry(effect->potion_name, MEL_ITEM, 1, letter++);
        entry->data = const_cast<CrawlStoreValue*>(&offer);
        entry->set_enabled(effect->can_quaff());
        menu.add_entry(entry);
    }
    menu.show();
    std::vector<MenuEntry*> selection;
    menu.get_selected(&selection);
    if (selection.empty())
        return spret::abort; // Keep the same offers after cancellation/save.
    const auto chosen = static_cast<potion_type>(
        static_cast<CrawlStoreValue*>(selection.front()->data)->get_int());
    if (!get_potion_effect(chosen)->can_quaff() || !spend(cost(GOD_GOZAG)))
        return spret::abort;
    potionlike_effect(chosen, 40);
    you.props.erase(key);
    return spret::success;
}

spret wand_surge(dist* target)
{
    std::vector<int> slots;
    for (const auto& item : you.inv)
        if (item.defined() && item.base_type == OBJ_WANDS && item.charges > 0
            && spell_power_cap(spell_in_wand(static_cast<wand_type>(item.sub_type))) > 0
            && cannot_evoke_item_reason(&item).empty())
            slots.push_back(item.link);
    if (slots.empty())
    {
        mpr("You need a charged wand whose effect benefits from Evocations.");
        return spret::abort;
    }
    int slot = slots.front();
    if (slots.size() > 1)
    {
        Menu menu(MF_SINGLESELECT);
        menu.set_title("Wand Surge — 8 Defiance plus an ordinary wand charge");
        menu_letter letter;
        for (int& candidate : slots)
        {
            auto* entry = new MenuEntry(you.inv[candidate].name(DESC_A), MEL_ITEM, 1, letter++);
            entry->data = &candidate;
            menu.add_entry(entry);
        }
        menu.show();
        std::vector<MenuEntry*> selected;
        menu.get_selected(&selected);
        if (selected.empty())
            return spret::abort;
        slot = *static_cast<int*>(selected.front()->data);
    }
    evocation request;
    request.skill_bonus = 2 + 2 * rank();
    request.payment = []() { return spend(cost(GOD_PAKELLAS)); };
    return evoke_device(you.inv[slot], target, request);
}
}

spret invoke_power(god_type god, dist* target)
{
    if (!reason(ability(god)).empty())
        return spret::abort;
    if (god == GOD_VELLUM)
        return borrow_thread();
    if (god == GOD_GOZAG)
        return petition();
#if TAG_MAJOR_VERSION == 34
    if (god == GOD_PAKELLAS)
        return wand_surge(target);
#endif
    const int price = cost(god);
    spret result = spret::success;
    switch (god)
    {
    case GOD_ZIN: case GOD_BEOGH: case GOD_LUGONU: case GOD_JIYVA:
    {
        const auto cell = aim(target, LOS_RADIUS, true, god == GOD_LUGONU);
        monster* victim = cell ? hostile_at(*cell) : nullptr;
        if (!victim)
            return spret::abort;
        if (god == GOD_BEOGH)
            result = cast_smiting(12 + skill_bump(SK_INVOCATIONS, 6, true), victim, false, percent());
        else if (god == GOD_LUGONU)
        {
            bolt beam;
            beam.source = you.pos();
            beam.target = *cell;
            beam.range = LOS_RADIUS;
            result = zapping(ZAP_BANISHMENT, (68 + you.skill(SK_INVOCATIONS, 3)) * percent() / 100,
                             beam, true);
        }
        else if (god == GOD_JIYVA)
        {
            if (!mon_can_be_slimified(victim))
                return spret::abort;
            if (victim->check_willpower(&you, (60 + you.skill(SK_INVOCATIONS, 4)) * percent() / 100) <= 0)
                slimify_monster(victim);
            else
                simple_monster_message(*victim, " resists your stolen power.");
        }
        else if (victim->check_willpower(&you, 30 + you.skill(SK_INVOCATIONS, 3)) <= 0)
            victim->daze(2 + rank());
        else
            simple_monster_message(*victim, " resists your rebuke.");
        break;
    }
    case GOD_SHINING_ONE:
        you.duration[DUR_ELDER_SHIELD] = 80;
        break;
    case GOD_YREDELEMNUL:
    {
        if (creation_alive(god))
            return spret::abort;
        bool raised = false;
        for (stack_iterator corpse(you.pos()); corpse; ++corpse)
            if (corpse->is_type(OBJ_CORPSES, CORPSE_BODY)
                && mons_class_can_be_zombified(corpse->mon_type))
            {
                if (!summon(god, MONS_ZOMBIE, you.pos(), corpse->mon_type))
                    return spret::abort;
                dec_mitm_item_quantity(corpse.index(), 1);
                raised = true;
                break;
            }
        if (!raised)
        {
            mpr("Stand over an eligible corpse. One of your zombies may live at a time.");
            return spret::abort;
        }
        break;
    }
    case GOD_XOM:
        if (!you.weapon() || !is_melee_weapon(*you.weapon()) || is_artefact(*you.weapon())
            || get_weapon_brand(*you.weapon()) != SPWPN_NORMAL)
        {
            mpr("Chaos Touch requires a compatible unbranded ordinary melee weapon.");
            return spret::abort;
        }
        you.props["eldritch_chaos_weapon"] = you.weapon()->give_unique_id();
        you.duration[DUR_ELDER_CHAOS] = (4 + 2 * rank()) * BASELINE_DELAY;
        break;
    case GOD_OKAWARU:
        you.duration[DUR_ELDER_HEROISM] = 60;
        break;
    case GOD_SIF_MUNA:
        if (you.magic_points == you.max_magic_points)
            return spret::abort;
        inc_mp(1 + rank());
        start_delay<ElderChannel>(1 + rank());
        break;
    case GOD_TROG:
        if (!you.go_berserk(true))
            return spret::abort;
        you.duration[DUR_BERSERK] = (4 + rank()) * BASELINE_DELAY;
        you.props["eldritch_rage"] = true;
        break;
    case GOD_NEMELEX_XOBEH:
    {
        if (!spend(price))
            return spret::abort;
        const int reference = 120 * (you.skill(SK_INVOCATIONS, 100) + 2500) / 2700
            + you.skill(SK_INVOCATIONS, 9) + 180;
        draw_destruction(reference * percent() / 100);
        return spret::success; // Drawing commits before revealing any random card.
    }
    case GOD_ELYVILON:
    {
        if (you.hp == you.hp_max)
            return spret::abort;
        const int power = min(50, 10 + you.skill_rdiv(SK_INVOCATIONS, 1, 3));
        inc_hp((power + roll_dice(2, power) - 2) * (20 + 10 * rank()) / 100);
        break;
    }
    case GOD_FEDHAS: case GOD_HEPLIAKLQANA:
    {
        if (creation_alive(god))
            return spret::abort;
        coord_def cell = you.pos();
        if (god == GOD_FEDHAS)
        {
            const auto chosen = aim(target, 1, false);
            if (!chosen || actor_at(*chosen) || !feat_has_solid_floor(env.grid(*chosen)))
                return spret::abort;
            cell = *chosen;
        }
        if (!summon(god, god == GOD_FEDHAS ? MONS_BRIAR_PATCH : MONS_ANCESTOR, cell))
            return spret::abort;
        break;
    }
    case GOD_CHEIBRIADOS:
        for (monster_near_iterator mon(you.pos(), LOS_NO_TRANS); mon; ++mon)
            if (grid_distance(mon->pos(), you.pos()) <= 1 && hostile_at(mon->pos())
                && !mon->is_stationary())
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
            }
        break;
    case GOD_DITHMENOS:
    {
        if (you.no_tele(true))
            return spret::abort;
        const auto cell = aim(target, 2 + rank(), false);
        if (!cell || actor_at(*cell) || !you.is_habitable(*cell))
            return spret::abort;
        bool enemy = false;
        for (adjacent_iterator adjacent(*cell); adjacent; ++adjacent)
            enemy |= hostile_at(*adjacent) != nullptr;
        if (!enemy || !check_moveto(*cell, "shadow step", false, false))
            return spret::abort;
        if (!you.blink_to(*cell))
            return spret::abort;
        break;
    }
    case GOD_QAZLAL:
        result = qazlal_upheaval(coord_def(), false, false, target, percent());
        break;
    case GOD_RU:
    {
        const int strength = 20 + 10 * rank();
        if (you.caught()) you.stop_being_caught();
        you.stop_being_constricted(false, "burst");
        you.duration[DUR_CONF] = you.duration[DUR_SLOW] = you.duration[DUR_PETRIFYING] = 0;
        you.clear_beholders();
        you.clear_fearmongers();
        inc_hp((120 / 16 + roll_dice(6, 6)) * strength / 100);
        inc_mp((120 / 48 + roll_dice(3, 4)) * strength / 100);
        you.duration[DUR_EXHAUSTED] = 120;
        break;
    }
    case GOD_USKAYAW:
    {
        vector<coord_def> area;
        for (adjacent_iterator cell(you.pos()); cell; ++cell)
            area.push_back(*cell);
        if (warn_about_bad_targets("The stolen shockwave", area, nullptr, "Stomp anyway?"))
            return spret::abort;
        for (monster_near_iterator mon(you.pos(), LOS_NO_TRANS); mon; ++mon)
            if (grid_distance(mon->pos(), you.pos()) <= 1 && hostile_at(mon->pos()))
            {
                const int damage = (div_rand_round(mon->hit_points, 6)
                    + uskayaw_stomp_extra_damage().roll()) * percent() / 100;
                mon->hurt(&you, damage, BEAM_ENERGY);
            }
        break;
    }
    case GOD_IGNIS:
        you.duration[DUR_ELDER_ARMOUR] = 80;
        break;
    default:
        return spret::abort;
    }
    if (result == spret::success)
    {
        spend(price);
        you.redraw_armour_class = you.redraw_evasion = you.redraw_status_lights = true;
    }
    return result;
}
}
