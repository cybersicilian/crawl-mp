#include "AppHdr.h"
#include "god-vellum.h"

#include "artefact.h"
#include "art-enum.h"
#include "item-prop.h"
#include "items.h"
#include "player.h"
#include "store.h"

namespace vellum
{
namespace
{
constexpr const char* scripts_key = "vellum_script_sources";
constexpr const char* active_key = "vellum_active_scripts";
constexpr const char* removed_key = "vellum_unique_removed";

const CrawlVector* scripts(const player& owner)
{
    return owner.props.exists(scripts_key)
        && owner.props[scripts_key].get_type() == SV_VEC
        ? &owner.props[scripts_key].get_vector() : nullptr;
}

int source_id(const player& owner, const item_def* item)
{
    if (const auto* rows = scripts(owner))
        for (const auto& row : *rows)
        {
            const auto& table = row.get_table();
            if (&table["item"].get_item() == item)
                return table["id"].get_int();
        }
    return 0;
}

bool worn(const player& owner, int id)
{
    int instances = 0;
    for (const auto& item : owner.inv)
        instances += item.defined() && item_id(item) == id;
    if (instances != 1)
        return false;
    for (const auto& entry : owner.equipment.items)
        if (!entry.melded && !entry.is_overflow && entry.slot != SLOT_UNUSED
            && item_id(owner.inv[entry.item]) == id)
            return true;
    return false;
}
}

bool native_power_enabled(const item_def& item)
{
    return !item.props.exists(removed_key);
}

std::vector<const item_def*> script_sources(const player& owner)
{
    std::vector<const item_def*> result;
    if (!active(owner))
        return result;
    const auto state = load(owner);
    const auto* rows = scripts(owner);
    if (!rows || !enchantment_transfer::valid(state, capacity(owner)))
        return result;
    for (const auto& row : *rows)
    {
        const auto& table = row.get_table();
        const auto* thread = enchantment_transfer::find(state, table["id"].get_int());
        if (thread && thread->magic.kind == enchantment_transfer::effect_kind::unique_power
            && thread->target > 0 && worn(owner, thread->target))
            result.push_back(&table["item"].get_item());
    }
    return result;
}

int script_source_id(const item_def* item) { return source_id(you, item); }

item_def* script_source_by_id(int id)
{
    if (const auto* rows = scripts(you))
        for (const auto& row : *rows)
        {
            const auto& table = row.get_table();
            if (table["id"].get_int() == id)
                return const_cast<item_def*>(&table["item"].get_item());
        }
    return nullptr;
}

int script_target(const player& owner, const item_def* source)
{
    const int id = source_id(owner, source);
    const auto state = load(owner);
    const auto* thread = enchantment_transfer::find(state, id);
    return thread ? thread->target : 0;
}

bool has_power(const item_def& item, int unrand)
{
    if (!item.defined() || !item_id(item))
        return false;
    for (const auto* source : script_sources(you))
        if (source->unrand_idx == unrand && script_target(you, source) == item_id(item))
        {
            for (const auto& physical : you.inv)
                if (&physical == &item)
                    return true;
        }
    return false;
}

bool script_applies(const item_def& source, const item_def* target)
{
    if (!script_source_id(&source) || !is_weapon(source))
        return true;
    return target && script_target(you, &source) == item_id(*target);
}

int script_property(const player& owner, const item_def& target, artefact_prop_type prop)
{
    int total = 0;
    for (const auto* source : script_sources(owner))
        if (script_target(owner, source) == item_id(target))
            total += native_artefact_property(*source, prop);
    return total;
}

int script_enchantment(const item_def& target)
{
    int total = 0;
    for (const auto* source : script_sources(you))
        if (script_target(you, source) == item_id(target))
            total += source->plus - source->props["vellum_base_plus"].get_int();
    return total;
}

void extract_script(item_def& donor, int thread)
{
    ASSERT(is_unrandom_artefact(donor) && native_power_enabled(donor));
    item_def source = donor;
    source.props.erase(ITEM_UNIQUE_ID);
    source.props.erase("vellum_depleted");
    source.link = NON_ITEM;
    source.pos = coord_def();
    const auto* definition = get_unrand_entry(donor.unrand_idx);
    source.props["vellum_base_plus"] = static_cast<int>(definition->plus);
    // Keep mutable script state, but none of the separately movable static
    // enchantments. Victory is the native script that mutates art properties.
    for (int i = 0; i < ART_PROPERTIES; ++i)
    {
        const auto prop = static_cast<artefact_prop_type>(i);
        const bool mutable_stat = donor.unrand_idx == UNRAND_VICTORY
            && (prop == ARTP_SLAYING || prop == ARTP_INTELLIGENCE);
        artefact_set_property(source, prop, mutable_stat
            ? native_artefact_property(donor, prop) - definition->prpty[i] : 0);
    }
    if (!you.props.exists(scripts_key))
        you.props[scripts_key].new_vector(SV_HASH);
    CrawlHashTable row;
    row["id"] = thread;
    row["item"] = source;
    you.props[scripts_key].get_vector().push_back(CrawlStoreValue(row));
    if (item_is_equipped(donor) && definition->unequip_func)
    {
        bool messages = false;
        definition->unequip_func(&donor, &messages);
    }
    donor.props[removed_key] = true;
    donor.plus = definition->plus;
    if (donor.unrand_idx == UNRAND_VICTORY)
        for (auto prop : {ARTP_SLAYING, ARTP_INTELLIGENCE})
            artefact_set_property(donor, prop, definition->prpty[prop]);
    reapply_depletion(donor);
}

void sync_scripts()
{
    std::vector<int> previous, current;
    if (you.props.exists(active_key))
        for (const auto& value : you.props[active_key].get_vector())
            previous.push_back(value.get_int());
    for (const auto* source : script_sources(you))
        current.push_back(source_id(you, source));
    bool messages = false;
    for (int id : previous)
        if (std::find(current.begin(), current.end(), id) == current.end())
            if (auto* source = script_source_by_id(id))
                if (const auto fn = get_unrand_entry(source->unrand_idx)->unequip_func)
                    fn(source, &messages);
    for (int id : current)
        if (std::find(previous.begin(), previous.end(), id) == previous.end())
            if (auto* source = script_source_by_id(id))
                if (const auto fn = get_unrand_entry(source->unrand_idx)->equip_func)
                    fn(source, &messages, false);
    auto& ids = you.props[active_key].new_vector(SV_INT);
    for (int id : current)
        ids.push_back(CrawlStoreValue(id));
}
}
