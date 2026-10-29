#include "AppHdr.h"
#include "oozle-memory-effects.h"
#include "oozle-memory.h"
#include "actor.h"
#include "art-enum.h"
#include "artefact.h"
#include "item-prop.h"
#include "fight.h"
#include "player.h"
#include "player-equip.h"
#include "spl-summoning.h"
#include <map>
#include <tuple>

namespace oozle
{
namespace
{
using identity = std::tuple<object_class_type, int, bool>;
identity key(const item_def& item)
{
    return {item.base_type, is_unrandom_artefact(item) ? item.unrand_idx : item.sub_type,
            is_unrandom_artefact(item)};
}
bool physically_active(const player& owner, const item_def& source)
{
    for (const auto& entry : owner.equipment.items)
        if (entry.slot != SLOT_UNUSED && !entry.melded && !entry.is_overflow
            && key(owner.inv[entry.item]) == key(source)) return true;
    return false;
}
void visit_unique(const std::function<void(item_def&, const unrandart_entry&)>& visit)
{
    for (item_def* item : effect_sources())
        if (is_unrandom_artefact(*item)) visit(*item, *get_unrand_entry(item->unrand_idx));
}
}
std::vector<const item_def*> effect_sources(const player& owner)
{
    std::map<identity, std::pair<int, const item_def*>> selected;
    if (has_memory(owner) && owner.props.exists("oozle_memories_v1"))
        for (const auto& value : owner.props["oozle_memories_v1"].get_vector())
        {
            const auto& row = value.get_table();
            const int slot = row["slot"].get_int();
            // Slot unlocks depend only on XL, never on native item effects.
            if (slot < 0 || slot >= equipment_memory::slot_count(owner.experience_level, equipment_memory::limits())
                || !row.exists("item")) continue;
            const auto& item = row["item"].get_item();
            if (!item.defined() || physically_active(owner, item)) continue;
            const int id = row["id"].get_int();
            auto& current = selected[key(item)];
            if (!current.second || id > current.first) current = {id, &item};
        }
    std::vector<const item_def*> result;
    for (const auto& entry : selected) result.push_back(entry.second.second);
    return result;
}
std::vector<item_def*> effect_sources()
{
    std::vector<item_def*> result;
    for (const item_def* source : effect_sources(you)) result.push_back(const_cast<item_def*>(source));
    return result;
}
int effect_source_id(const item_def* item)
{
    if (!has_memory() || !you.props.exists("oozle_memories_v1")) return 0;
    for (const auto& value : you.props["oozle_memories_v1"].get_vector())
    {
        const auto& row = value.get_table();
        if (row.exists("item") && &row["item"].get_item() == item) return row["id"].get_int();
    }
    return 0;
}
item_def* effect_source_by_id(int id)
{
    for (auto* source : effect_sources())
        if (effect_source_id(source) == id) return source;
    return nullptr;
}
bool is_effect_source(const item_def* item)
{
    const auto sources = effect_sources();
    return std::find(sources.begin(), sources.end(), item) != sources.end();
}
const item_def* type_source(object_class_type type, int subtype)
{
    for (const auto* source : effect_sources())
        if (source->is_type(type, subtype)) return source;
    return nullptr;
}
item_def* spectral_source()
{
    for (auto* item : effect_sources())
        if (is_melee_weapon(*item) && (get_weapon_brand(*item) == SPWPN_SPECTRAL
            || is_unrandom_artefact(*item, UNRAND_GUARD))) return item;
    return nullptr;
}
std::vector<item_def> source_snapshot()
{
    std::vector<item_def> result;
    for (const auto* source : effect_sources())
    {
        result.push_back(*source);
        result.back().props["oozle_memory_id"] = effect_source_id(source);
    }
    return result;
}
bool absorbed_unrand(const player& owner, int index)
{
    for (const item_def* item : effect_sources(owner))
        if (is_unrandom_artefact(*item, index)) return true;
    return false;
}
bool has_equipment_effect(const actor& owner, const item_def* item, int unrand)
{
    return (item && is_unrandom_artefact(*item, unrand))
        || (owner.is_player() && absorbed_unrand(*owner.as_player(), unrand));
}
item_def* unrand_source(int index, bool include_melded)
{
    for (auto& entry : you.equipment.items)
        if (entry.slot != SLOT_UNUSED && !entry.is_overflow && (include_melded || !entry.melded)
            && is_unrandom_artefact(entry.get_item(), index)) return &entry.get_item();
    for (auto* item : effect_sources())
        if (is_unrandom_artefact(*item, index)) return item;
    return nullptr;
}
void source_lifecycle(const std::vector<item_def>& before)
{
    const auto after = source_snapshot();
    const auto contains = [](const std::vector<item_def>& items, const item_def& source) {
        return std::any_of(items.begin(), items.end(), [&](const item_def& item) { return key(item) == key(source); });
    };
    for (auto item : before)
        if (std::none_of(after.begin(), after.end(), [&](const item_def& current) {
            return current.props["oozle_memory_id"].get_int() == item.props["oozle_memory_id"].get_int();
        })) end_spectral_weapon(find_spectral_weapon(item), false, true);
    bool messages = true;
    for (auto item : before)
        if (is_unrandom_artefact(item) && !contains(after, item) && !physically_active(you, item))
            if (const auto fn = get_unrand_entry(item.unrand_idx)->unequip_func) fn(&item, &messages);
    for (auto* item : effect_sources())
        if (is_unrandom_artefact(*item) && !contains(before, *item))
            if (const auto fn = get_unrand_entry(item->unrand_idx)->equip_func) fn(item, &messages, false);
}
brand_type effective_brand(const actor& owner, const item_def* item)
{
    const auto native = item ? get_weapon_brand(*item) : SPWPN_NORMAL;
    if (native != SPWPN_NORMAL || !owner.is_player()) return native;
    return static_cast<brand_type>(body_property(*owner.as_player(), ARTP_BRAND));
}
int inherited_strikes(const item_def* item)
{
    if (!has_memory() || (!item && !you.has_mutation(MUT_ACIDIC_TOUCH))) return 1;
    int strikes = 1;
    for (const auto* source : effect_sources())
        if (is_melee_weapon(*source)) strikes = std::max(strikes, weapon_hits_per_swing(*source));
    return strikes;
}
int inherited_block_limit(const player& owner)
{
    int blocks = 1;
    for (const auto* item : effect_sources(owner))
        if (is_shield(*item)) blocks = std::max(blocks, ::shield_block_limit(*item));
    return blocks;
}
void world_effects()
{
    visit_unique([](item_def& item, const unrandart_entry& entry) {
        if (entry.world_reacts_func) entry.world_reacts_func(&item);
    });
}
void death_effects(monster* target, killer_type killer)
{
    visit_unique([&](item_def& item, const unrandart_entry& entry) {
        if (entry.death_effects) entry.death_effects(&item, target, killer);
    });
}
void melee_effects(actor* attacker, actor* defender, int damage, melee_attack* attack, bool killed)
{
    if (!attacker->is_player()) return;
    visit_unique([&](item_def& item, const unrandart_entry& entry) {
        // Shield melee hooks describe a successful block, not an attack.
        if (!entry.melee_effects || is_shield(item)) return;
        if (killed != (item.unrand_idx == UNRAND_WYRMBANE && !defender->alive())) return;
        entry.melee_effects(&item, attacker, defender, damage, attack);
    });
}
void block_effects(actor* wearer, actor* attacker)
{
    if (!wearer->is_player()) return;
    visit_unique([&](item_def& item, const unrandart_entry& entry) {
        if (is_shield(item) && entry.melee_effects)
            entry.melee_effects(&item, wearer, attacker, 0, nullptr);
    });
}
void launch_effects(bolt& beam)
{
    visit_unique([&](item_def&, const unrandart_entry& entry) {
        if (entry.launch) entry.launch(&beam);
    });
}
}
