#include "AppHdr.h"
#include "god-pakellas.h"

#include "evoke.h"
#include "invent.h"
#include "item-prop.h"
#include "menu.h"
#include "message.h"
#include "player.h"
#include "religion.h"
#include "spl-book.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"

namespace pakellas
{
namespace
{
int choose_device(const std::string& title, bool designation = false, bool* finite = nullptr)
{
    struct choice { int slot; bool finite; std::string label; std::string blocked; };
    std::vector<choice> choices;
    for (auto& item : you.inv)
    {
        if (!eligible(item))
            continue;
        if (designation)
        {
            choices.push_back({item.link, false, item.name(DESC_A) + " — " + designation_quote(item),
                               designation_reason(item)});
            continue;
        }
        const auto add = [&](bool ordinary) {
            const std::string payment = item.base_type == OBJ_WANDS
                ? ordinary ? "two finite charges" : "Prototype reserve, 150% recharge debt"
                : "150% native recharge debt";
            choices.push_back({item.link, ordinary, item.name(DESC_A) + " — 4 piety; " + payment,
                               action_reason(item, true, false, ordinary)});
        };
        if (item.base_type != OBJ_WANDS || designated(item))
            add(false);
        if (item.base_type == OBJ_WANDS)
            add(true);
    }
    if (choices.empty())
    {
        mpr("You have no compatible devices.");
        return -1;
    }
    // A single usable funding choice can go directly to native aiming.
    const choice* sole = nullptr;
    int enabled = 0;
    for (const auto& candidate : choices)
        if (candidate.blocked.empty())
        {
            sole = &candidate;
            ++enabled;
        }
    if (!designation && enabled == 1 && choices.size() == 1)
    {
        if (finite)
            *finite = sole->finite;
        return sole->slot;
    }
    Menu menu(MF_SINGLESELECT | MF_ALLOW_FORMATTING);
    menu.set_title(title);
    menu_letter hotkey;
    for (auto& candidate : choices)
    {
        auto* entry = new MenuEntry(candidate.label
            + (candidate.blocked.empty() ? "" : " — " + candidate.blocked), MEL_ITEM, 1, hotkey++);
        entry->data = &candidate;
        entry->set_enabled(candidate.blocked.empty());
        menu.add_entry(entry);
    }
    menu.show();
    std::vector<MenuEntry*> selected;
    menu.get_selected(&selected);
    if (selected.empty())
        return -1;
    const auto& result = *static_cast<const choice*>(selected[0]->data);
    if (finite)
        *finite = result.finite;
    return result.slot;
}

spret choose_kit()
{
    Menu menu(MF_SINGLESELECT | MF_ALLOW_FORMATTING);
    menu.set_title("Pakellas's Field Kit: choose one device");
    const char* descriptions[] = {
        "Flame (6 charges): aimed fire damage; resisted by fire resistance.",
        "Iceblast (3 charges): aimed cold explosion; can hit allies.",
        "Paralysis (3 charges): disable a target that fails its willpower check."
    };
    int choices[] = {0, 1, 2};
    for (int i = 0; i < 3; ++i)
    {
        auto* entry = new MenuEntry(descriptions[i], MEL_ITEM, 1, 'a' + i);
        entry->data = &choices[i];
        menu.add_entry(entry);
    }
    menu.show();
    std::vector<MenuEntry*> selected;
    menu.get_selected(&selected);
    if (selected.empty())
        return spret::abort;
    return field_kit(*static_cast<const int*>(selected[0]->data)) == NON_ITEM
        ? spret::abort : spret::success;
}

bool supported(const item_def& item)
{
    return eligible(item) && !(item.base_type == OBJ_WANDS && item.sub_type == WAND_DIGGING);
}
}

bool is_ability(ability_type ability)
{
    return ability >= ABIL_PAKELLAS_DEVICE_SURGE && ability <= ABIL_PAKELLAS_EVOKE_PROTOTYPE;
}

std::string action_reason(const item_def& item, bool enhanced, bool borrowed,
                          bool ordinary_charges)
{
    if (!active(borrowed ? 5 : enhanced ? 3 : 1))
        return "Pakellas has not granted that workshop power.";
    if (!eligible(item) || !in_inventory(item))
        return "Choose a carried wand or experience-charged evoker.";
    if (you.berserk() || you.confused() || you.cannot_act())
        return "You cannot operate your workshop in this state.";
    const bool reserve = item.base_type == OBJ_WANDS && !ordinary_charges;
    if ((reserve || borrowed) && !designated(item))
        return "That device is not your current Prototype.";
    if (enhanced && !supported(item))
        return "Digging has no Overclock enhancement. Use the ordinary Prototype action.";
    if (enhanced && item.base_type == OBJ_WANDS
        && (item.sub_type == WAND_PARALYSIS || item.sub_type == WAND_CHARMING
            || item.sub_type == WAND_POLYMORPH))
    {
        const spell_type spell = spell_in_wand(static_cast<wand_type>(item.sub_type));
        const int power = wand_power(spell);
        if (min(spell_power_cap(spell), power * 3 / 2) <= power)
            return "This device's application power is already at its cap.";
    }
    const std::string native = cannot_evoke_item_reason(&item, true, true, nullptr,
                                                       reserve || borrowed);
    if (!native.empty())
        return native;
    if (borrowed)
    {
        if (workshop().loan)
            return "Repay your existing Breakthrough loan first.";
        if (ready(item) != 0)
            return "Your Prototype is still ready. Use ordinary Overclock.";
    }
    else if (reserve && !ready(item))
        return "Your Prototype reserve is empty. Gain experience to recharge it.";
    else if (item.base_type == OBJ_WANDS && ordinary_charges && item.charges < 2)
        return "Ordinary Overclock requires two finite wand charges.";
    const int piety = borrowed ? 8 : enhanced ? 4 : 0;
    if (you.piety() < piety)
        return "You do not have enough piety for that activation.";
    return "";
}

std::string reason(ability_type ability)
{
    if (ability == ABIL_PAKELLAS_FIELD_KIT)
        return kit_claimed() ? "You have already received your Field Kit."
                            : you.has_mutation(MUT_NO_ARTIFICE) ? "You cannot use artifice." : "";
    if (ability == ABIL_PAKELLAS_QUICK_CHARGE)
        return active() ? "" : "Pakellas has not granted you a Prototype.";
    if (ability == ABIL_PAKELLAS_DEVICE_SURGE)
    {
        for (const auto& device : you.inv)
            if (eligible(device)
                && (action_reason(device, true, false, device.base_type == OBJ_WANDS && !designated(device)).empty()
                    || device.base_type == OBJ_WANDS && action_reason(device, true, false, true).empty()))
            {
                return "";
            }
        return "No carried device can currently pay for Overclock.";
    }
    const item_def* item = prototype();
    if (!item)
        return "Designate a carried device as your Prototype first.";
    return action_reason(*item, ability != ABIL_PAKELLAS_EVOKE_PROTOTYPE,
                         ability == ABIL_PAKELLAS_SUPERCHARGE);
}

std::string costs(ability_type ability)
{
    switch (ability)
    {
    case ABIL_PAKELLAS_FIELD_KIT: return "One Field Kit per character";
    case ABIL_PAKELLAS_QUICK_CHARGE: return "One action; replacing costs 4 piety; debt persists";
    case ABIL_PAKELLAS_DEVICE_SURGE: return "4 piety; 150% recharge debt (rounded up)";
    case ABIL_PAKELLAS_SUPERCHARGE: return "8 piety; two activations of loan debt; pauses Prototype recovery";
    case ABIL_PAKELLAS_EVOKE_PROTOTYPE: return "Prototype readiness; ordinary wand charges are preserved";
    default: return "";
    }
}

spret invoke(ability_type ability, dist* target, int item_slot, bool ordinary_charges)
{
    if (!is_ability(ability) || (ordinary_charges && ability != ABIL_PAKELLAS_DEVICE_SURGE))
        return spret::abort;
    if (ability == ABIL_PAKELLAS_FIELD_KIT)
        return active(0) && !kit_claimed() ? choose_kit() : spret::abort;
    if (ability == ABIL_PAKELLAS_QUICK_CHARGE)
    {
        if (!active())
            return spret::abort;
        if (item_slot < 0)
            item_slot = choose_device("Designate Prototype: replacement costs 4 piety; all debt persists", true);
        if (item_slot < 0 || item_slot >= ENDOFPACK)
            return spret::abort;
        const auto blocked = designation_reason(you.inv[item_slot]);
        if (!blocked.empty())
        {
            mpr(blocked);
            return spret::abort;
        }
        return designate(you.inv[item_slot]) ? spret::success : spret::abort;
    }
    if (item_slot < 0)
    {
        if (ability == ABIL_PAKELLAS_DEVICE_SURGE)
            item_slot = choose_device("Overclock: choose a device and funding source", false, &ordinary_charges);
        else if (item_def* selected = prototype())
            item_slot = selected->link;
    }
    if (item_slot < 0 || item_slot >= ENDOFPACK)
        return spret::abort;
    item_def& item = you.inv[item_slot];
    const bool enhanced = ability != ABIL_PAKELLAS_EVOKE_PROTOTYPE;
    const bool borrowed = ability == ABIL_PAKELLAS_SUPERCHARGE;
    const std::string blocked = action_reason(item, enhanced, borrowed, ordinary_charges);
    if (!blocked.empty())
    {
        mpr(blocked);
        return spret::abort;
    }
    const mid_t owner = you.mid;
    const int uid = item.give_unique_id();
    const int old_selection = you.props["pakellas_selection"].get_int();
    const auto before = workshop();
    const int old_native = is_xp_evoker(item) ? evoker_debt(item.sub_type) : 0;
    const int old_charges = item.charges;
    const bool had_loan_total = you.props.exists("pakellas_loan_total");
    const int old_loan_total = had_loan_total ? you.props["pakellas_loan_total"].get_int() : 0;
    const int piety = borrowed ? 8 : enhanced ? 4 : 0;
    evocation request;
    if (enhanced)
    {
        request.damage_percent = item.base_type == OBJ_WANDS && item.sub_type == WAND_ROOTS ? 100 : 135;
        request.duration_percent = 135;
        request.application_percent = 150;
        request.ward_bonus = 2;
        request.revival_hp_bonus = 10;
        request.revival_hp_cap = 65;
    }
    request.externally_funded = true;
    request.payment = [&]() {
        if (you.mid != owner || !item.defined() || !in_inventory(item)
            || !item.props.exists(ITEM_UNIQUE_ID) || item.props[ITEM_UNIQUE_ID].get_int() != uid
            || (!ordinary_charges && you.props["pakellas_selection"].get_int() != old_selection)
            || !action_reason(item, enhanced, borrowed, ordinary_charges).empty())
        {
            mpr("The hero, device or funding changed. Choose the action again.");
            return false;
        }
        auto a = workshop();
        if (borrowed)
        {
            auto credit = item.base_type == OBJ_WANDS ? a
                : recharge::account{evoker_max_charges(item.sub_type) * per_use(item),
                    per_use(item), evoker_debt(item.sub_type) * recharge::precision, a.loan};
            if (!credit.borrow())
                return false;
            a.loan = credit.loan;
            you.props["pakellas_loan_total"] = a.loan;
        }
        else if (item.base_type == OBJ_WANDS && !ordinary_charges)
            a.spend(enhanced);
        else if (is_xp_evoker(item))
            evoker_debt(item.sub_type) += (enhanced ? recharge::enhanced_price(per_use(item))
                                                   : per_use(item)) / recharge::precision;
        else
            item.charges -= 2;
        save_workshop(a);
        return true;
    };
    if (enhanced)
        mprf("%s: %d piety; %s.", borrowed ? "Breakthrough" : "Overclock", piety,
             borrowed ? "two ordinary activations of personal loan debt"
                 : ordinary_charges ? "two finite wand charges"
                 : "150% of normal recharge debt, rounded up");
    const spret result = evoke_device(item, target, request);
    if (result == spret::abort && request.committed)
    {
        // Native secondary vetoes must not leave a partial payment behind.
        save_workshop(before);
        if (is_xp_evoker(item))
            evoker_debt(item.sub_type) = old_native;
        else
            item.charges = old_charges;
        if (had_loan_total)
            you.props["pakellas_loan_total"] = old_loan_total;
        else
            you.props.erase("pakellas_loan_total");
    }
    if (result != spret::abort)
    {
        // Match native ability payment ordering. Capacity and loan are reserved
        // before the effect (so its XP can repay debt); piety is finalized only
        // after secondary native vetoes, avoiding spurious rank-loss messages.
        if (piety)
            lose_piety(piety);
        you.turn_is_over = true;
    }
    return result == spret::fail ? spret::success : result;
}

void joined(bool migration)
{
    if (!you_worship(GOD_PAKELLAS))
        return;
    if (migration)
    {
        migrate();
        return;
    }
    you.props["pakellas_version"] = 1;
    if (!kit_claimed() && !you.has_mutation(MUT_NO_ARTIFICE))
        choose_kit();
}
}
