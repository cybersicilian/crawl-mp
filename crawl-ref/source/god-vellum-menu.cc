#include "AppHdr.h"
#include "eldritch.h"
#include "god-vellum.h"

#include "artefact.h"
#include "menu.h"
#include "item-prop.h"
#include "message.h"
#include "options.h"
#include "player.h"
#include "prompt.h"
#include "religion.h"
#include "state.h"
#include "stringutil.h"
#include "unwind.h"

namespace vellum
{
namespace
{
struct choice
{
    request work;
    std::string title;
    std::string blocked;
};

int choose(std::vector<choice>& choices, const std::string& title)
{
    if (choices.empty())
    {
        mpr("No compatible enchantments are available. Find an identified artifact first.");
        return -1;
    }
    Menu menu(MF_SINGLESELECT | MF_ALLOW_FORMATTING);
    menu.set_title(title);
    menu_letter hotkey;
    for (auto& row : choices)
    {
        auto* entry = new MenuEntry(row.title
            + (row.blocked.empty() ? "" : " — " + row.blocked), MEL_ITEM, 1, hotkey++);
        entry->data = &row;
        entry->set_enabled(row.blocked.empty());
        menu.add_entry(entry);
    }
    menu.show();
    std::vector<MenuEntry*> selected;
    menu.get_selected(&selected);
    return selected.empty() ? -1
        : static_cast<const choice*>(selected.front()->data) - choices.data();
}

std::string item_name(int id)
{
    const auto* item = carried(id);
    return item ? item->name(DESC_A) : "an item outside your inventory";
}

std::vector<choice> recipients(request work)
{
    std::vector<choice> choices;
    const auto state = load(you);
    if (work.action == operation::extract)
    {
        const auto q = preview(work);
        choices.push_back({work, make_stringf("Archive %s for later — %d piety; drawbacks still reserve capacity",
            label(work.magic).c_str(), q.cost), q.blocked});
    }
    for (auto& item : you.inv)
    {
        if (!item.defined() || (!item_type_is_equipment(item.base_type) && item.base_type != OBJ_TALISMANS))
            continue;
        work.target = item.give_unique_id();
        work.vessel = !is_artefact(item);
        std::vector<int> replacements{0};
        for (const auto& entry : state.threads)
            if (entry.target == work.target && entry.id != work.thread)
                replacements.push_back(entry.id);
        for (int replacement : replacements)
        {
            work.replace = replacement;
            const auto q = preview(work);
            const auto* previous = enchantment_transfer::find(state, replacement);
            const auto* selected = enchantment_transfer::find(state, work.thread);
            const auto magic = selected ? selected->magic : work.magic;
            const std::string change = previous
                ? " (archive " + label(previous->magic) + ")" : "";
            const int before = native_effect_value(item, magic);
            choices.push_back({work, make_stringf("%s — %s: native %d -> %d; %d capacity; %d piety%s%s",
                item.name(DESC_A).c_str(), label(magic).c_str(), before,
                before + enchantment_transfer::contribution(magic, before), price(magic), q.cost, change.c_str(),
                work.vessel ? "; apprentice vessel" : ""), q.blocked});
        }
    }
    return choices;
}
}

spret invoke(int source_slot)
{
    if (eldritch::has(GOD_VELLUM))
        return eldritch::borrow_thread();
    std::vector<choice> choices;
    const auto state = load(you);
    if (!state.starter_claimed && active(you))
        for (auto type : {ARTP_STRENGTH, ARTP_INTELLIGENCE, ARTP_DEXTERITY, ARTP_SEE_INVISIBLE})
        {
            request work;
            work.action = operation::starter;
            work.magic = {type, type == ARTP_SEE_INVISIBLE ? 1 : 2};
            work.vessel = true;
            choices.push_back({work, "Receive starter: " + label(work.magic) + " — once per character", ""});
        }
    if (active(you))
        for (int slot = 0; slot < ENDOFPACK; ++slot)
        {
            auto& item = you.inv[slot];
            if ((source_slot >= 0 && source_slot != slot) || !item.defined() || !is_artefact(item)
                || item.base_type == OBJ_BOOKS)
                continue;
            if ((item.base_type == OBJ_WEAPONS || item.base_type == OBJ_ARMOUR)
                && native_item_enchantment(item))
            {
                request work;
                work.action = operation::extract;
                work.source = item.give_unique_id();
                work.magic = {ARTP_NUM_PROPERTIES, native_item_enchantment(item),
                    enchantment_transfer::effect_kind::enchantment};
                const auto q = preview(work);
                choices.push_back({work, make_stringf("Extract %s from %s — %d capacity; %d piety",
                    label(work.magic).c_str(), item.name(DESC_A).c_str(), price(work.magic), q.cost), q.blocked});
            }
            if (is_unrandom_artefact(item) && native_power_enabled(item))
            {
                request work;
                work.action = operation::extract;
                work.source = item.give_unique_id();
                work.magic = {ARTP_NUM_PROPERTIES, item.unrand_idx,
                    enchantment_transfer::effect_kind::unique_power};
                const auto q = preview(work);
                choices.push_back({work, "Extract " + label(work.magic)
                    + " — 6 capacity; " + std::to_string(q.cost) + " piety", q.blocked});
            }
            for (int i = 0; i < ART_PROPERTIES; ++i)
            {
                request work;
                work.action = operation::extract;
                work.source = item.give_unique_id();
                work.magic = {static_cast<artefact_prop_type>(i), native_artefact_property(item, static_cast<artefact_prop_type>(i))};
                work.magic.brand_class = item.base_type;
                if (!price(work.magic))
                    continue;
                const auto q = preview(work);
                choices.push_back({work, make_stringf("Extract %s from %s — %d capacity; %d piety",
                    label(work.magic).c_str(), item.name(DESC_A).c_str(), price(work.magic), q.cost), q.blocked});
            }
        }
    for (const auto& thread : state.threads)
    {
        if (thread.target < 0)
            continue;
        request work;
        work.thread = thread.id;
        if (active(you))
        {
            work.action = operation::bind;
            choices.push_back({work, (thread.target ? "Move " : "Bind ") + label(thread.magic)
                + (thread.target ? " from " + item_name(thread.target) : " from the archive") + " — 3 piety", ""});
        }
        if (thread.target)
        {
            work.action = operation::archive;
            const auto q = preview(work);
            choices.push_back({work, "Archive " + label(thread.magic) + " from " + item_name(thread.target), q.blocked});
        }
        work.action = operation::sever;
        choices.push_back({work, (enchantment_transfer::drawback(thread.magic)
            ? "Restore drawback to donor: " : "Destroy thread: ") + label(thread.magic)
            + (thread.target ? " on " + item_name(thread.target) : " in archive"), preview(work).blocked});
    }
    if (active(you) && rank(you) >= 6)
        for (auto& item : you.inv)
            if (item.defined() && is_artefact(item) && item.base_type != OBJ_BOOKS)
            {
                request work;
                work.action = operation::masterwork;
                work.target = item.give_unique_id();
                const auto q = preview(work);
                choices.push_back({work, "Masterwork: " + item.name(DESC_A) + " — two slots; 3 piety", q.blocked});
            }
    int selection = choose(choices, "Vellum — " + summary(you));
    if (selection < 0)
        return spret::abort;
    auto work = choices[selection].work;
    if (work.action == operation::starter || work.action == operation::extract || work.action == operation::bind)
    {
        auto targets = recipients(work);
        selection = choose(targets, "Choose recipient — " + summary(you));
        if (selection < 0)
            return spret::abort;
        work = targets[selection].work;
    }
    const auto q = preview(work);
    if (!q.blocked.empty())
    {
        mpr(q.blocked);
        return spret::abort;
    }
    if (work.action == operation::extract || work.action == operation::sever)
    {
        const std::string consequence = work.action == operation::extract
            ? "Permanently remove " + label(work.magic) + " from " + item_name(work.source)
                + (work.target ? " and bind it to " + item_name(work.target) : " into your archive")
            : "End this thread permanently (an extracted drawback returns to its donor)";
        const std::string prompt = consequence + make_stringf("?\n%d piety; %d of your actions. Interrupted work spends nothing.", q.cost, q.turns);
        unwind_var<bool> popup(Options.prompt_menu, true);
        if (!yesno(prompt.c_str(), true, 'n'))
            return spret::abort;
    }
    return begin(q);
}
}
