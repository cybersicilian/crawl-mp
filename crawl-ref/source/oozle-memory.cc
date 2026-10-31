#include "AppHdr.h"
#include "oozle-memory.h"
#include "oozle-memory-effects.h"
#include "equipment-memory-items.h"
#include "artefact.h"
#include "areas.h"
#include "delay.h"
#include "invent.h"
#include "item-def.h"
#include "item-prop.h"
#include "items.h"
#include "libutil.h"
#include "mpr.h"
#include "options.h"
#include "prompt.h"
#include "player.h"
#include "player-equip.h"
#include "player-stats.h"
#include "random.h"
#include "spl-cast.h"
#include "stringutil.h"
#include "transform.h"
#include "unwind.h"
#include <limits>

namespace oozle
{
using namespace equipment_memory;
namespace
{
const char* const memory_key = "oozle_memories_v1";
const char* const serial_key = "oozle_memory_serial";


void changed()
{
    invalidate_agrid(true);
    notify_stat_change();
    calc_hp();
    calc_mp();
    const bool was_airborne = you.airborne();
    const bool had_flight = you.attribute[ATTR_PERM_FLIGHT];
    you.attribute[ATTR_PERM_FLIGHT] = you.equip_flight() ? 1 : 0;
    if (!was_airborne && you.attribute[ATTR_PERM_FLIGHT]) float_player();
    else if (had_flight && !you.attribute[ATTR_PERM_FLIGHT]) land_player();
    you.redraw_armour_class = you.redraw_evasion = you.wield_change = true;
}
std::uint64_t new_source()
{
    return ++you.props[serial_key].get_int();
}
void save(const state& memory, int source_slot, const string& source, item_def source_item)
{
    const auto before = source_snapshot();
    std::map<int, item_def> originals;
    if (you.props.exists(memory_key))
        for (const auto& value : you.props[memory_key].get_vector())
        {
            const auto& row = value.get_table();
            if (row.exists("item")) originals[row["id"].get_int()] = row["item"].get_item();
        }
    source_item.link = NON_ITEM;
    source_item.pos = coord_def();
    source_item.quantity = 1;
    source_item.props.erase("oozle_corrosion_aut"); // Discard legacy passive wear.
    vector<string> names(6);
    for (int slot = 0; slot < 6; ++slot) names[slot] = source_name(slot);
    if (source_slot >= 0) names[source_slot] = source;
    you.props.erase(memory_key);
    auto& rows = you.props[memory_key].new_vector(SV_HASH);
    for (const auto& entry : memory.stored)
    {
        const auto& record = entry.second;
        CrawlHashTable row;
        row["slot"] = entry.first;
        row["id"] = static_cast<int>(record.id);
        row["source"] = static_cast<int>(record.source);
        row["family"] = static_cast<int>(record.group);
        auto& effects = row["effects"].new_vector(SV_HASH);
        for (const auto& effect : record.effects)
        {
            CrawlHashTable value;
            value["property"] = static_cast<int>(effect.type);
            value["value"] = effect.value;
            value["trait"] = static_cast<int>(effect.trait);
            value["query_class"] = static_cast<int>(effect.query.item_class);
            value["query_subtype"] = effect.query.subtype;
            value["query_kind"] = static_cast<int>(effect.query.kind);
            effects.push_back(CrawlStoreValue(value));
        }
        row["acquired"] = static_cast<int>(record.acquired);
        row["active"] = record.assimilated;
        if (entry.first == source_slot) row["item"] = source_item;
        else if (originals.count(record.id)) row["item"] = originals.at(record.id);
        row["name"] = names[entry.first];
        rows.push_back(CrawlStoreValue(row));
    }
    source_lifecycle(before);
    changed();
}
class AssimilationDelay final : public Delay
{
    int index;
    int uid;
    string source;
    work task;

    bool source_valid() const
    {
        const auto& item = you.inv[index];
        if (!item.defined() || !item.props.exists(ITEM_UNIQUE_ID)
            || item.props[ITEM_UNIQUE_ID].get_int() != uid || !eligibility(item).empty())
            return false;
        const auto fresh = intrinsic_profile(item).properties;
        if (fresh.size() != task.intrinsic.size()) return false;
        for (size_t i = 0; i < fresh.size(); ++i)
            if (fresh[i].type != task.intrinsic[i].type || fresh[i].value != task.intrinsic[i].value
                || fresh[i].trait != task.intrinsic[i].trait
                || fresh[i].query.item_class != task.intrinsic[i].query.item_class
                || fresh[i].query.subtype != task.intrinsic[i].query.subtype
                || fresh[i].query.kind != task.intrinsic[i].query.kind)
                return false;
        return true;
    }
    bool invalidated() override
    {
        if (!task.active) return false;
        if (has_memory() && source_valid()) return false;
        mpr("Your assimilation stops; the item is unchanged.");
        return true;
    }
    void tick() override
    {
        you.time_taken = BASELINE_DELAY;
        you.turn_is_over = true;
        if (advance(task, true, true) != progress::ready) return;
        auto memory = memories();
        const auto policy = current_policy();
        const auto choices = destinations(memory, you.experience_level, policy);
        const int slot = choices.empty() ? -1
            : choices.size() == 1 ? choices.front() : choices[random2(static_cast<int>(choices.size()))];
        const item_def original = you.inv[index];
        if (complete(memory, task, you.elapsed_time, you.experience_level, policy,
                     [&](std::uint64_t) {
                         if (!source_valid()) return false;
                         item_was_destroyed(you.inv[index]);
                         dec_inv_item_quantity(index, 1);
                         return true;
                     }, slot))
        {
            save(memory, slot, source, original);
            mprf("You assimilate %s, preserving its extracted properties in one memory.", source.c_str());
        }
        else mpr("Your assimilation stops; no memory is replaced.");
    }
    void finish() override { }
public:
    AssimilationDelay(int item_index, work pending)
        : Delay(pending.remaining_turns), index(item_index),
          uid(you.inv[index].give_unique_id()), source(you.inv[index].name(DESC_PLAIN)),
          task(std::move(pending)) { }
    const char* name() const override { return "assimilation"; }
    const char* cooperative_activity_name() const override { return "assimilating"; }
    bool try_interrupt(bool) override
    {
        mpr("You stop assimilating; the item is unchanged.");
        return true;
    }
    bool is_being_used(const item_def& item) const override { return &item == &you.inv[index]; }
    const string& source_label() const { return source; }
};
const AssimilationDelay* current_work()
{
    return dynamic_cast<const AssimilationDelay*>(current_delay().get());
}
}
bool has_memory(const player& owner) { return owner.species == SP_OOZLE; }
bool has_memory() { return has_memory(you); }
limits current_policy(const player& owner)
{
    auto policy = shapeshifting_limits(owner.skill(SK_SHAPESHIFTING, 10, true, false));
    // Reuse the native property catalogue, including all beneficial passives.
    for (int prop = 0; prop < ART_PROPERTIES; ++prop)
    {
        const auto type = static_cast<artefact_prop_type>(prop);
        if (artp_potentially_good(type)) policy.maxima[type] = std::numeric_limits<int>::max();
    }
    for (auto type : {ARTP_HP, ARTP_CLARITY, ARTP_RMSL, ARTP_RMUT})
        policy.maxima[type] = std::numeric_limits<int>::max();
    for (int brand = SPWPN_NORMAL + 1; brand < NUM_REAL_SPECIAL_WEAPONS; ++brand)
        policy.brands.insert(static_cast<brand_type>(brand));
    policy.brands.insert(SPWPN_ACID);
    policy.brands.insert(SPWPN_FOUL_FLAME);
    policy.scaled_properties.insert(ARTP_HP);
    policy.scaled_properties.insert(ARTP_MAGICAL_POWER);
    return policy;
}
limits current_policy() { return current_policy(you); }
state memories(const player& owner)
{
    state result;
    if (!has_memory(owner) || !owner.props.exists(memory_key)) return result;
    for (const auto& value : owner.props[memory_key].get_vector())
    {
        const auto& row = value.get_table();
        const int slot = row["slot"].get_int();
        if (slot < 0 || slot >= 6) continue;
        const auto id = static_cast<std::uint64_t>(row["id"].get_int());
        vector<equipment_memory::property> effects;
        if (row.exists("effects"))
            for (const auto& stored : row["effects"].get_vector())
            {
                const auto& effect = stored.get_table();
                effects.push_back({ static_cast<artefact_prop_type>(effect["property"].get_int()),
                    effect["value"].get_int(), static_cast<weapon_trait>(effect["trait"].get_int()),
                    {effect.exists("query_class") ? static_cast<object_class_type>(effect["query_class"].get_int()) : OBJ_UNASSIGNED,
                     effect.exists("query_subtype") ? effect["query_subtype"].get_int() : 0,
                     effect.exists("query_kind") ? static_cast<native_kind>(effect["query_kind"].get_int())
                        : effect.exists("query_ego") && effect["query_ego"].get_bool() ? native_kind::ego : native_kind::item} });
            }
        else effects.push_back({ static_cast<artefact_prop_type>(row["property"].get_int()), row["value"].get_int() });
        // Native callbacks may grow or change an absorbed source. Project its
        // current native state while keeping the saved raw bundle for old saves.
        if (row.exists("item"))
            effects = candidates(intrinsic_profile(row["item"].get_item()), current_policy(owner));
        result.stored[slot] = { id, static_cast<std::uint64_t>(row["source"].get_int()),
            static_cast<family>(row["family"].get_int()),
            effects,
            row["acquired"].get_int(), row["active"].get_bool() };
        result.next_id = max(result.next_id, id + 1);
    }
    return result;
}
state memories() { return memories(you); }
string source_name(int slot)
{
    if (you.props.exists(memory_key))
        for (const auto& value : you.props[memory_key].get_vector())
        {
            const auto& row = value.get_table();
            if (row["slot"].get_int() == slot) return row["name"].get_string();
        }
    return "";
}
int body_property(const player& owner, artefact_prop_type type)
{
    if (!has_memory(owner)) return 0;
    for (const auto& effect : project(memories(owner), owner.experience_level, current_policy(owner)))
        if (effect.effect.query.item_class == OBJ_UNASSIGNED
            && effect.effect.trait == weapon_trait::none && effect.effect.type == type) return effect.effect.value;
    return 0;
}
int body_property(artefact_prop_type type) { return body_property(you, type); }
int unarmed_property(artefact_prop_type type)
{
    if (!has_memory() || !you.has_mutation(MUT_ACIDIC_TOUCH)) return 0;
    return body_property(type);
}
namespace
{
int inherited_trait(const item_def* item, weapon_trait trait)
{
    if (!has_memory() || (!item && !you.has_mutation(MUT_ACIDIC_TOUCH))) return 0;
    for (const auto& effect : project(memories(), you.experience_level, current_policy()))
        if (effect.effect.trait == trait) return effect.effect.value;
    return 0;
}
}
bool inherited_cleaving(const item_def* item)
{
    return inherited_trait(item, weapon_trait::cleaving) > 0;
}
int inherited_reach(const item_def* item)
{
    return max(1, inherited_trait(item, weapon_trait::reaching));
}
int passive_bonus(const player& owner, artefact_prop_type type)
{
    return type == ARTP_BRAND ? 0 : body_property(owner, type);
}
int passive_bonus(artefact_prop_type type) { return passive_bonus(you, type); }
int native_bonus(const player& owner, object_class_type item_class, int subtype, bool ego)
{
    if (!has_memory(owner)) return 0;
    for (const auto& effect : project(memories(owner), owner.experience_level, current_policy(owner)))
    {
        const auto& query = effect.effect.query;
        if (query.item_class == item_class && query.subtype == subtype && query.kind == (ego ? native_kind::ego : native_kind::item))
            return effect.effect.value;
    }
    return 0;
}
string eligibility(const item_def& item)
{
    family group;
    if (!item.defined() || !item_family(item, group)) return "Choose equipment or a talisman.";
    if (item.is_critical() || item.summoned()) return "That item cannot be consumed.";
    if (item.cursed()) return "Unbind that item before assimilating it.";
    // Explicit assimilation operates on carried gear, independently of fit.
    if (item_is_equipped(item)) return "Remove that item before actively assimilating it.";
    if (candidates(intrinsic_profile(item), current_policy()).empty()) return "That item has no supported property to preserve.";
    return "";
}
spret assimilate(int inventory_slot)
{
    if (!has_memory()) return spret::abort;
    const int index = inventory_slot == -1
        ? prompt_invent_item("Assimilate which carried item?", menu_type::invlist, OSEL_ANY, OPER_ANY)
        : inventory_slot;
    if (index < 0 || index >= ENDOFPACK || !you.inv[index].defined()) return spret::abort;
    auto& item = you.inv[index];
    const string reason = eligibility(item);
    if (!reason.empty()) { mpr(reason); return spret::abort; }
    const auto memory = memories();
    const auto policy = current_policy();
    const int slot = destination(memory, you.experience_level, policy);
    const auto old = memory.stored.find(slot);
    const string replacement = old == memory.stored.end()
        ? "Uses a random empty memory slot when complete."
        : "Replaces the oldest memory when complete.\nCurrent oldest: " + source_name(slot) + ".";
    item_def consumed = item;
    consumed.quantity = 1;
    const string prompt = make_stringf("Assimilate %s?\n\n"
        "Consumes one item after %d of your turns.\n"
        "Stores its extracted properties in one memory.\n%s",
        consumed.name(DESC_A).c_str(), policy.assimilation_turns, replacement.c_str());
    {
        // Keep one native confirmation for both the ability and item menus.
        // The safe default and Escape cancel without starting the delay.
        unwind_var<bool> popup(Options.prompt_menu, true);
        if (!yesno(prompt.c_str(), true, 'n')) return spret::abort;
    }
    work task;
    if (!begin(memory, task, intrinsic_profile(item), new_source(), you.experience_level, policy))
        return spret::abort;
    // The initiating action is the first of five owner turns. Four native delay
    // ticks follow, yielding at each party scheduling boundary.
    advance(task, true, true);
    start_delay<AssimilationDelay>(index, std::move(task));
    mpr("You begin assimilating. All extracted properties will share one memory slot.");
    return spret::success;
}
int assimilation_remaining()
{
    const auto* task = current_work();
    return task ? task->duration : 0;
}
string assimilation_source()
{
    const auto* task = current_work();
    return task ? task->source_label() : "";
}
}
