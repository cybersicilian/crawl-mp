#include "AppHdr.h"
#include "god-vellum.h"

#include "artefact.h"
#include "delay.h"
#include "item-prop.h"
#include "items.h"
#include "message.h"
#include "nearby-danger.h"
#include "player.h"
#include "religion.h"
#include "store.h"
#include "stringutil.h"

namespace vellum
{
namespace
{
std::string signature(const item_def* item)
{
    if (!item)
        return "absent";
    std::string result = make_stringf("%d/%d/%d/%d/%d/%d/%d/%d/%d",
        item_id(*item), item->base_type, item->sub_type, item->plus, item->brand,
        item->unrand_idx, item->flags, item->quantity,
        static_cast<int>(you.equipment.find_equipped_slot(*item)));
    result += you.equipment.is_melded(*item) ? ":melded" : ":unmelded";
    for (int i = 0; i < ART_PROPERTIES; ++i)
        result += ":" + std::to_string(native_value(*item, static_cast<artefact_prop_type>(i)));
    return result;
}

bool starter_magic(enchantment_transfer::effect magic)
{
    if (magic.kind != enchantment_transfer::effect_kind::property)
        return false;
    return magic.type == ARTP_SEE_INVISIBLE ? magic.value == 1
        : (magic.type == ARTP_STRENGTH || magic.type == ARTP_INTELLIGENCE
           || magic.type == ARTP_DEXTERITY) && magic.value == 2;
}

std::string state_reason()
{
    if (you.berserk() || you.confused() || you.cannot_act())
        return "You cannot weave enchantments in this state.";
    return "";
}

bool prepare(quote& result, enchantment_transfer::ledger& next)
{
    using namespace enchantment_transfer;
    const auto& work = result.work;
    auto* source = carried(work.source);
    auto* target = carried(work.target);
    const auto* selected = find(next, work.thread);
    const int old_target = selected ? selected->target : 0;
    result.fingerprint = signature(source) + "|" + signature(target)
        + "|" + signature(carried(old_target));
    const bool cleanup = work.action == operation::archive || work.action == operation::sever;
    if (!valid(next, maximum_capacity))
        result.blocked = "Binding data needs repair; no changes were made.";
    else if (!cleanup && !active(you))
        result.blocked = "Vellum's favour is required.";
    else if (!(result.blocked = state_reason()).empty())
        return false;
    if (!result.blocked.empty())
        return false;
    if (cleanup)
    {
        if (!selected || selected->target < 0)
            result.blocked = "This thread no longer exists.";
        else if (work.action == operation::archive
                 && (selected->target <= 0 || !carried(selected->target)))
            result.blocked = "Carry the bound item to archive its thread, or sever the inaccessible binding.";
        else if (work.action == operation::archive && carried(selected->target)->cursed())
            result.blocked = "Cursed bindings cannot be altered.";
        else if (work.action == operation::archive)
            archive(next, work.thread);
        else
        {
            result.turns = 1;
            sever(next, work.thread);
        }
        return result.blocked.empty();
    }
    if (work.action == operation::masterwork)
    {
        result.cost = 3;
        if (rank(you) < 6 || !target || !is_artefact(*target))
            result.blocked = "A Masterwork requires six earned stars and a carried artifact.";
        else if (next.masterwork == work.target)
            result.blocked = "This is already your Masterwork.";
        else if (on_item(next, next.masterwork) > 1)
            result.blocked = "Archive a thread from the old Masterwork before replacing it.";
        else
            result.blocked = recipient_reason(*target, {ARTP_STRENGTH, 2});
        if (result.blocked.empty())
        {
            next.masterwork = work.target;
            ++next.revision;
        }
        return result.blocked.empty();
    }
    int id = work.thread;
    if (work.action == operation::starter)
    {
        result.turns = 1;
        if (next.starter_claimed || !starter_magic(work.magic) || !target)
            result.blocked = "Choose one unused starter enchantment and a carried vessel.";
        else
        {
            id = extract(next, 0, work.magic, 1);
            next.starter_claimed = true;
        }
    }
    else if (work.action == operation::extract)
    {
        if (!source)
            result.blocked = "The source item is no longer carried.";
        else
            result.blocked = source_reason(*source, work.magic);
        if (result.blocked.empty())
        {
            result.cost = 2 + 2 * min(maximum_capacity, price(work.magic));
            id = extract(next, work.source, work.magic, price(work.magic));
            if (!id)
                result.blocked = "This source property has already been extracted.";
        }
    }
    else if (work.action == operation::bind)
    {
        result.cost = 3;
        if (!selected || selected->target < 0)
            result.blocked = "The selected thread no longer exists.";
        else if (selected->target > 0 && !carried(selected->target))
            result.blocked = "Carry the old recipient before moving this thread.";
        else if (selected->target > 0 && carried(selected->target)->cursed())
            result.blocked = "Cursed bindings cannot be altered.";
        else if (rank(you) < minimum_rank(selected->magic.type) && selected->source != 0)
            result.blocked = "You have not earned this property's devotion milestone.";
    }
    if (!result.blocked.empty())
        return false;
    if (!work.target && work.action == operation::extract)
        return true;
    const auto* chosen = find(next, id);
    if (!chosen || !target)
    {
        result.blocked = "Choose a carried recipient.";
        return false;
    }
    if (work.vessel && next.vessel != work.target)
    {
        for (const auto& entry : next.threads)
            if (entry.target > 0 && entry.target == next.vessel && entry.id != id)
                result.blocked = "Archive the old vessel's other thread before replacing it.";
        next.vessel = work.target;
    }
    if (result.blocked.empty())
        result.blocked = recipient_reason(*target, chosen->magic, work.vessel);
    if (result.blocked.empty())
        result.blocked = binding_reason(next, id, work.target,
            native_effect_value(*target, chosen->magic), capacity(you), work.replace);
    if (!result.blocked.empty())
        return false;
    return bind(next, id, work.target, native_effect_value(*target, chosen->magic),
                capacity(you), work.replace);
}

bool unchanged(const quote& prepared, const quote& fresh)
{
    return fresh.blocked.empty() && fresh.owner == prepared.owner
        && fresh.revision == prepared.revision && fresh.cost == prepared.cost
        && fresh.turns == prepared.turns && fresh.fingerprint == prepared.fingerprint;
}

class WeavingDelay final : public Delay
{
    quote prepared;
    int last_hp;
    bool invalidated() override
    {
        if (you.hp < last_hp || !i_feel_safe(false)
            || !unchanged(prepared, preview(prepared.work)))
        {
            mpr("Your weaving stops; no enchantments or piety were spent.");
            return true;
        }
        last_hp = you.hp;
        return false;
    }
    void tick() override
    {
        you.time_taken = BASELINE_DELAY;
        you.turn_is_over = true;
        if (duration == 1)
        {
            if (commit(prepared))
                mpr("Vellum completes your weaving.");
            else
                mpr("The weaving changed; no enchantments or piety were spent.");
        }
    }
    void finish() override { }
public:
    explicit WeavingDelay(quote work)
        : Delay(work.turns - 1), prepared(std::move(work)), last_hp(you.hp) { }
    const char* name() const override { return "weaving"; }
    const char* cooperative_activity_name() const override { return "weaving enchantments"; }
    bool try_interrupt(bool) override
    {
        mpr("You stop weaving; no enchantments or piety were spent.");
        return true;
    }
    bool is_being_used(const item_def& item) const override
    {
        const int id = item_id(item);
        const auto state = load(you);
        const auto* old = enchantment_transfer::find(state, prepared.work.thread);
        return id && (id == prepared.work.source || id == prepared.work.target
            || (old && old->target == id));
    }
};
}

quote preview(const request& work)
{
    auto next = load(you);
    quote result{work, static_cast<int>(you.mid), next.revision, 0, 5, "", ""};
    prepare(result, next);
    if (result.blocked.empty() && result.cost && you.piety() <= result.cost)
        result.blocked = "You need enough piety to pay this price and retain at least one piety.";
    return result;
}

bool commit(const quote& prepared)
{
    if (!prepared.blocked.empty() || !unchanged(prepared, preview(prepared.work)))
        return false;
    auto next = load(you);
    auto fresh = prepared;
    if (!prepare(fresh, next))
        return false;
    const int old_mp = you.scan_artefacts(ARTP_MAGICAL_POWER);
    const auto* target_before = carried(prepared.work.target);
    const int old_regen = target_before
        ? item_bonus(you, *target_before, ARTP_REGENERATION) : 0;
    if (prepared.work.action == operation::extract)
    {
        auto& item = *carried(prepared.work.source);
        if (prepared.work.magic.kind == enchantment_transfer::effect_kind::unique_power)
            extract_script(item, next.next_id - 1);
        else
        {
        if (!item.props.exists("vellum_depleted"))
            item.props["vellum_depleted"].new_vector(SV_INT);
        item.props["vellum_depleted"].get_vector().push_back(
            CrawlStoreValue(static_cast<int>(prepared.work.magic.type)));
        artefact_set_property(item, prepared.work.magic.type, 0);
        }
    }
    save(you, next);
    if (prepared.cost)
        lose_piety(prepared.cost);
    you.equipment.update();
    const int lost_mp = old_mp - you.scan_artefacts(ARTP_MAGICAL_POWER);
    if (lost_mp > 0 && !you.has_mutation(MUT_HP_CASTING))
        pay_mp(lost_mp);
    // MP depletion above covers native and borrowed losses together.
    you.props["vellum_applied_mp"] = bonus(you, ARTP_MAGICAL_POWER);
    // A newly attached regeneration source must undergo native attunement.
    if (auto* item = carried(prepared.work.target))
        for (auto& entry : you.equipment.items)
            if (entry.item == item->link && !entry.is_overflow
                && item_bonus(you, *item, ARTP_REGENERATION) > old_regen)
                entry.attuned = you.hp == you.hp_max
                    && (!is_mana_regen_item(*item) || you.magic_points == you.max_magic_points);
    refresh();
    return true;
}

spret begin(const quote& prepared)
{
    const auto fresh = preview(prepared.work);
    if (!unchanged(prepared, fresh) || !i_feel_safe(false))
    {
        mpr(fresh.blocked.empty() ? "Find safety before weaving enchantments." : fresh.blocked);
        return spret::abort;
    }
    if (prepared.turns == 1)
        return commit(prepared) ? spret::success : spret::abort;
    start_delay<WeavingDelay>(prepared);
    mpr("You begin weaving. Four more of your actions remain; danger interrupts the work.");
    return spret::success;
}
}
