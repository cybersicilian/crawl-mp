#include "AppHdr.h"
#include "eldritch.h"

#include "artefact.h"
#include "god-vellum.h"
#include "menu.h"
#include "message.h"
#include "player.h"
#include "prompt.h"
#include "stringutil.h"

namespace eldritch
{
namespace
{
struct option
{
    vellum::request work;
    std::string label;
};

int choose(std::vector<option>& rows, const std::string& title)
{
    if (rows.empty())
    {
        mpr("No eligible whole enchantments or compatible recipients are carried.");
        return -1;
    }
    Menu menu(MF_SINGLESELECT | MF_ALLOW_FORMATTING);
    menu.set_title(title);
    menu_letter key;
    for (auto& row : rows)
    {
        auto* entry = new MenuEntry(row.label, MEL_ITEM, 1, key++);
        entry->data = &row;
        menu.add_entry(entry);
    }
    menu.show();
    std::vector<MenuEntry*> result;
    menu.get_selected(&result);
    return result.empty() ? -1
        : static_cast<option*>(result.front()->data) - rows.data();
}
}

spret borrow_thread()
{
    std::vector<option> choices;
    const auto state = vellum::load(you);
    for (const auto& thread : state.threads)
        if (thread.target >= 0)
        {
            vellum::request move;
            move.action = vellum::operation::bind;
            move.thread = thread.id;
            choices.push_back({move, "Move " + vellum::label(thread.magic) + " — 20 Defiance"});
            move.action = vellum::operation::sever;
            choices.push_back({move, "Sever " + vellum::label(thread.magic) + " permanently — no Defiance"});
        }
    if (choices.empty())
        for (auto& donor : you.inv)
            if (donor.defined() && is_random_artefact(donor))
                for (int property = 0; property < ARTP_NUM_PROPERTIES; ++property)
                {
                    const auto type = static_cast<artefact_prop_type>(property);
                    enchantment_transfer::effect effect{type, native_artefact_property(donor, type)};
                    if (!vellum::source_reason(donor, effect).empty())
                        continue;
                    vellum::request work;
                    work.source = donor.give_unique_id();
                    work.magic = effect;
                    choices.push_back({work, donor.name(DESC_A) + ": " + vellum::label(effect)
                        + make_stringf(" — weight %d; permanently depletes donor", vellum::price(effect))});
                }
    const int selection = choose(choices, make_stringf(
        "Borrowed Thread — one whole property, maximum weight %d", 1 + rank()));
    if (selection < 0)
        return spret::abort;
    auto work = choices[selection].work;
    if (work.action == vellum::operation::sever)
    {
        if (!yesno("Permanently sever your borrowed thread?", false, 'n'))
            return spret::abort;
        return vellum::begin(vellum::preview(work));
    }
    std::vector<option> recipients;
    for (auto& recipient : you.inv)
        if (recipient.defined() && is_random_artefact(recipient))
        {
            work.target = recipient.give_unique_id();
            const auto quote = vellum::preview(work);
            if (quote.blocked.empty())
                recipients.push_back({work, recipient.name(DESC_A) + " — 20 Defiance; five interruptible actions"});
        }
    const int target = choose(recipients, "Bind onto which random artefact?");
    if (target < 0)
        return spret::abort;
    work = recipients[target].work;
    if (work.action == vellum::operation::extract
        && !yesno("Permanently extract this enchantment from its donor?", false, 'n'))
        return spret::abort;
    return vellum::begin(vellum::preview(work));
}
}
