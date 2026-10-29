#include "AppHdr.h"
#include "god-pakellas.h"

#include "artefact.h"
#include "env.h"
#include "evoke.h"
#include "invent.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "message.h"
#include "player.h"
#include "religion.h"
#include "skills.h"
#include "state.h"
#include "stringutil.h"

namespace pakellas
{
namespace
{
int value(const char* key)
{
    return you.props.exists(key) ? you.props[key].get_int() : 0;
}
constexpr const char* capacity_key = "pakellas_capacity";
constexpr const char* price_key = "pakellas_price";
constexpr const char* debt_key = "pakellas_debt";
constexpr const char* loan_key = "pakellas_loan";
constexpr const char* selection_key = "pakellas_selection";
constexpr const char* mark_key = "pakellas_mark";
constexpr const char* owner_key = "pakellas_owner";

int wand_capacity(int subtype)
{
    switch (subtype)
    {
    case WAND_FLAME: return 3;
    case WAND_PARALYSIS:
    case WAND_CHARMING:
    case WAND_POLYMORPH: return 1;
    default: return 2;
    }
}
}

bool active(int rank)
{
    return you_worship(GOD_PAKELLAS) && !player_under_penance(GOD_PAKELLAS)
        && piety_rank() >= rank;
}

bool eligible(const item_def& item)
{
    return item.defined() && !item_type_removed(item.base_type, item.sub_type)
        && (item.base_type == OBJ_WANDS ? per_use(item) > 0
            : is_xp_evoker(item) && !enhancement_description(item).empty());
}

bool designated(const item_def& item)
{
    return eligible(item) && value(selection_key) > 0
        && item.props.exists(mark_key) && item.props.exists(owner_key)
        && item.props[mark_key].get_int() == value(selection_key)
        && item.props[owner_key].get_int() == static_cast<int>(you.mid);
}

bool preserve_wand(const item_def& item)
{
    // A formerly designated chassis remains an inert, nonstackable item after
    // transfer. Its mark never grants the receiver another player's account.
    return item.base_type == OBJ_WANDS && item.props.exists(mark_key);
}

item_def* prototype()
{
    for (auto& item : you.inv)
        if (designated(item))
            return &item;
    return nullptr;
}

recharge::account workshop()
{
    return {value(capacity_key), value(price_key), value(debt_key), value(loan_key)};
}

void save_workshop(const recharge::account& a)
{
    you.props[capacity_key] = a.capacity;
    you.props[price_key] = a.price;
    you.props[debt_key] = a.debt;
    you.props[loan_key] = a.loan;
    you.redraw_status_lights = true;
}

int per_use(const item_def& item)
{
    if (is_xp_evoker(item))
        return evoker_charge_xp_debt(item.sub_type) * recharge::precision;
    if (item.base_type != OBJ_WANDS)
        return 0;
    int work;
    switch (item.sub_type)
    {
    case WAND_FLAME: work = 3; break;
    case WAND_DIGGING: work = 6; break;
    case WAND_PARALYSIS:
    case WAND_CHARMING:
    case WAND_POLYMORPH: work = 12; break;
    case WAND_MINDBURST:
    case WAND_ROOTS:
    case WAND_WARPING: work = 10; break;
    case WAND_ICEBLAST:
    case WAND_ACID:
    case WAND_LIGHT:
    case WAND_QUICKSILVER: work = 8; break;
    default: return 0;
    }
    return work * recharge::precision;
}

int ready(const item_def& item)
{
    if (item.base_type == OBJ_WANDS)
        return designated(item) && active() ? workshop().ready() : 0;
    return is_xp_evoker(item) ? evoker_charges(item.sub_type) : 0;
}

std::string designation_reason(const item_def& item)
{
    if (!active())
        return "Prototype requires one star and no penance.";
    if (!eligible(item) || !in_inventory(item))
        return "Choose a carried wand or experience-charged evoker.";
    if (you.has_mutation(MUT_NO_ARTIFICE))
        return "You cannot use artifice.";
    if (you.berserk() || you.confused() || you.cannot_act())
        return "You cannot operate your workshop in this state.";
    if (designated(item))
        return "Already your Prototype.";
    if (value(selection_key) > 0 && you.piety() < 4)
        return "Replacing your Prototype requires four piety.";
    return "";
}

bool designate(item_def& item)
{
    if (!designation_reason(item).empty())
        return false;
    const bool replacing = value(selection_key) > 0;
    if (item.base_type == OBJ_WANDS)
    {
        auto a = workshop();
        a.reconfigure(per_use(item) * wand_capacity(item.sub_type), per_use(item));
        if (!value("pakellas_seeded"))
        {
            a.debt = 0;
            you.props["pakellas_seeded"] = 1;
        }
        save_workshop(a);
    }
    const int mark = value("pakellas_sequence") + 1;
    you.props["pakellas_sequence"] = mark;
    you.props[selection_key] = mark;
    item.props[mark_key] = mark;
    item.props[owner_key] = static_cast<int>(you.mid);
    if (replacing)
        lose_piety(4);
    mprf(MSGCH_GOD, "Pakellas designates %s as your Prototype.",
         item.name(DESC_YOUR).c_str());
    you.turn_is_over = true;
    you.redraw_status_lights = true;
    return true;
}

std::string enhancement_description(const item_def& item)
{
    if (item.base_type == OBJ_WANDS)
    {
        switch (item.sub_type)
        {
        case WAND_PARALYSIS:
        case WAND_CHARMING:
        case WAND_POLYMORPH: return "+50% application power up to its cap; normal resistance checks.";
        case WAND_ROOTS: return "Applied roots last 35% longer; normal application checks.";
        case WAND_DIGGING: return "No Overclock enhancement; ordinary Prototype digging remains available.";
        default: return "+35% direct damage before armour and resistance; normal targeting and status effects.";
        }
    }
    switch (item.sub_type)
    {
    case MISC_CONDENSER_VANE: return "New clouds last 35% longer; normal cloud selection and placement.";
    case MISC_BOX_OF_BEASTS:
    case MISC_SACK_OF_SPIDERS:
    case MISC_PHANTOM_MIRROR: return "Summons last 35% longer; normal number, strength and eligibility.";
    case MISC_HORN_OF_GERYON: return "All answering summons last 35% longer, including hostile answers.";
    case MISC_AEGIS_STANDARD: return "+2 AC and +2 SH on the ward; normal recipients and duration.";
    case MISC_ASTRAL_BEACON: return "+35% healing, or +10 percentage points of revived HP up to 65%; normal injury and other effects.";
    case MISC_SKALD_HORN: return "+35% direct damage and 35% longer ballad and swiftness, within duration caps.";
    case MISC_LIGHTNING_ROD:
    case MISC_PHIAL_OF_FLOODS:
    case MISC_TIN_OF_TREMORSTONES:
    case MISC_GRAVITAMBOURINE:
    case MISC_TWIN_SPARK_CONDUIT:
        return "+35% direct damage; normal geometry, defenses and other effects.";
    default: return "";
    }
}

std::string designation_quote(const item_def& item)
{
    if (item.base_type == OBJ_WANDS)
    {
        auto next = workshop();
        next.reconfigure(per_use(item) * wand_capacity(item.sub_type), per_use(item));
        if (!value("pakellas_seeded"))
            next.debt = 0;
        return make_stringf("%d/%d renewable uses after designation; all loan debt persists",
                            next.ready(), wand_capacity(item.sub_type));
    }
    return make_stringf("%d/%d native charges retained; faster recovery; all debt persists",
                       evoker_charges(item.sub_type), evoker_max_charges(item.sub_type));
}

std::string description(const item_def& item)
{
    if (!designated(item))
        return "";
    const int count = ready(item);
    const auto a = workshop();
    std::string text = "Pakellas's Prototype: ";
    if (item.base_type == OBJ_WANDS)
        text += make_stringf("%d/%d workshop uses; %d ordinary charges. ",
            count, wand_capacity(item.sub_type), item.charges);
    else
        text += make_stringf("%d/%d native charges; 50%% faster recharge. ",
            count, evoker_max_charges(item.sub_type));
    const int price = per_use(item);
    const int capacity = item.base_type == OBJ_WANDS ? a.capacity
        : evoker_max_charges(item.sub_type) * price;
    const std::string fraction_key = make_stringf("pakellas_misc_fraction_%d", item.sub_type);
    const int debt = item.base_type == OBJ_WANDS ? a.debt
        : max(0, evoker_debt(item.sub_type) * recharge::precision
                 - (you.props.exists(fraction_key) ? you.props[fraction_key].get_int() : 0));
    const int available = item.base_type == OBJ_WANDS ? a.ready() : evoker_charges(item.sub_type);
    const int needed = max(0, debt - max(0, capacity - (available + 1) * price));
    if (needed)
        text += make_stringf("Next use needs %d%% of one ordinary activation's recovery. ",
                            (needed * 100 + price - 1) / price);
    if (!active())
        text += "Workshop powers are currently suspended. ";
    if (a.loan)
    {
        const int total = max(a.loan, value("pakellas_loan_total"));
        text += make_stringf("Breakthrough loan: %d%% remaining; Prototype recovery is paused.",
                             (a.loan * 100 + total - 1) / total);
    }
    else
        text += "Gain experience to restore readiness.";
    return text;
}

std::string summary()
{
    if (item_def* item = prototype())
        return item->name(DESC_BASENAME) + ": " + description(*item);
    const int loan = workshop().loan;
    if (loan)
    {
        const int total = max(loan, value("pakellas_loan_total"));
        return make_stringf("Breakthrough loan: %d%% remaining. Gain experience to repay it; no Prototype is currently carried.",
                            (loan * 100 + total - 1) / total);
    }
    return "Designate a carried device as your Prototype.";
}

int recover(int xp, int xp_factor)
{
    auto a = workshop();
    item_def* item = prototype();
    const bool powered = active();
    const bool owing = a.loan > 0;
    if (!owing && (!powered || !item))
        return -1;
    int& remainder = you.props["pakellas_xp_fraction"].get_int();
    int& denominator = you.props["pakellas_xp_denominator"].get_int();
    const bool gadgeteer = you.wearing_ego(OBJ_GIZMOS, SPGIZMO_GADGETEER)
        || you.unrand_equipped(UNRAND_GADGETEER);
    const int scale = player_under_penance(GOD_PAKELLAS) ? 2 : 1;
    int work = recharge::convert_xp(xp, max(1, xp_factor) * 10 * scale,
                                    gadgeteer ? 13 : 10, remainder, denominator);
    work = a.repay(work);
    int skip = -1;
    if (item && (powered || owing) && (powered || is_xp_evoker(*item)))
    {
        const int old_ready = ready(*item);
        if (is_xp_evoker(*item))
        {
            skip = item->sub_type;
            const std::string key = make_stringf("pakellas_misc_fraction_%d", skip);
            int& fraction = you.props[key].get_int();
            const std::string bonus_key = make_stringf("pakellas_misc_bonus_fraction_%d", skip);
            int& bonus_fraction = you.props[bonus_key].get_int();
            const int64_t amount = int64_t(work) * (powered ? 3 : 2) * (5 + evoker_plus(skip))
                                   + bonus_fraction;
            bonus_fraction = static_cast<int>(amount % 10);
            const int64_t earned = amount / 10 + fraction;
            evoker_debt(skip) -= static_cast<int>(min<int64_t>(evoker_debt(skip),
                                                              earned / recharge::precision));
            fraction = evoker_debt(skip) ? earned % recharge::precision : 0;
            if (!evoker_debt(skip))
                bonus_fraction = 0;
        }
        else
        {
            const int64_t amount = int64_t(work) * 3 + value("pakellas_wand_bonus_fraction");
            you.props["pakellas_wand_bonus_fraction"] = static_cast<int>(amount % 2);
            a.recover(static_cast<int>(min<int64_t>(a.debt, amount / 2)));
            if (!a.debt)
                you.props["pakellas_wand_bonus_fraction"] = 0;
        }
        if (!a.loan && (skip >= 0 ? evoker_debt(skip) == 0 : a.debt == 0))
        {
            remainder = 0;
            denominator = 0;
        }
        save_workshop(a);
        if (ready(*item) > old_ready)
            mprf(MSGCH_GOD, "Your Prototype %s regains readiness.",
                 item->name(DESC_BASENAME).c_str());
    }
    else
        save_workshop(a);
    return skip;
}

std::string fingerprint(const item_def& item)
{
    const auto a = workshop();
    return make_stringf("%d:%d:%d:%d:%d:%d:%d:%d:%d", static_cast<int>(you.mid),
        value(selection_key), a.capacity, a.price, a.debt, a.loan,
        is_xp_evoker(item) ? evoker_debt(item.sub_type) : item.charges,
        you.piety(), static_cast<int>(you.religion));
}

bool kit_claimed()
{
    return value("pakellas_kit") != 0;
}

int field_kit(int choice)
{
    if (!active(0) || kit_claimed() || choice < 0 || choice > 2
        || you.has_mutation(MUT_NO_ARTIFICE))
        return NON_ITEM;
    const int types[] = {WAND_FLAME, WAND_ICEBLAST, WAND_PARALYSIS};
    const int charges[] = {6, 3, 3};
    int index = items(false, OBJ_WANDS, types[choice], 0, 0, GOD_PAKELLAS);
    if (index == NON_ITEM)
        return NON_ITEM;
    env.item[index].charges = charges[choice];
    identify_item(env.item[index]);
    you.props["pakellas_kit"] = 1;
    // A generated item is still unlinked. The inventory overload copies it;
    // remove that temporary source after a successful transfer.
    if (move_item_to_inv(env.item[index]))
        destroy_item(index);
    else
        move_item_to_grid(&index, you.pos());
    mprf(MSGCH_GOD, "Pakellas supplies your Field Kit.");
    return index;
}

void migrate()
{
    you.duration[DUR_DEVICE_SURGE] = 0;
    const bool previous_worship = you_worship(GOD_PAKELLAS)
        || you.worshipped[GOD_PAKELLAS] || you.piety_max[GOD_PAKELLAS]
        || you.one_time_ability_used[GOD_PAKELLAS] || you.num_total_gifts[GOD_PAKELLAS];
    if (!previous_worship || value("pakellas_version"))
        return;
    you.props["pakellas_version"] = 1;
    you.props["pakellas_kit"] = 1;
    if (you_worship(GOD_PAKELLAS))
        mprf(MSGCH_GOD, "Pakellas has redesigned the workshop. Designate a Prototype; "
                       "Overclock and Breakthrough now spend device readiness.");
}
}
