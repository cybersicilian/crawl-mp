#include "AppHdr.h"
#include "god-vellum.h"

#include "artefact.h"
#include "areas.h"
#include "unwind.h"
#include "env.h"
#include "item-prop.h"
#include "items.h"
#include "message.h"
#include "party.h"
#include "player.h"
#include "player-stats.h"
#include "religion.h"
#include "store.h"
#include "stringutil.h"

namespace vellum
{
namespace
{
constexpr const char* state_key = "vellum_bindings";
constexpr const char* depletion_key = "vellum_depleted";

bool integer(const CrawlHashTable& table, const char* key)
{
    return table.exists(key) && table[key].get_type() == SV_INT;
}

enchantment_transfer::ledger invalid_state()
{
    enchantment_transfer::ledger state;
    state.next_id = 0;
    return state;
}
}

enchantment_transfer::ledger load(const player& owner)
{
    enchantment_transfer::ledger state;
    if (!owner.props.exists(state_key))
        return state;
    if (owner.props[state_key].get_type() != SV_HASH)
        return invalid_state();
    const auto& table = owner.props[state_key].get_table();
    for (const char* key : {"version", "revision", "next", "vessel", "masterwork", "starter"})
        if (!integer(table, key))
            return invalid_state();
    if (table["version"].get_int() != 1 || !table.exists("threads")
        || table["threads"].get_type() != SV_VEC
        || table["threads"].get_vector().get_type() != SV_HASH)
        return invalid_state();
    state.revision = table["revision"].get_int();
    state.next_id = table["next"].get_int();
    state.vessel = table["vessel"].get_int();
    state.masterwork = table["masterwork"].get_int();
    state.starter_claimed = table["starter"].get_int() != 0;
    for (const auto& value : table["threads"].get_vector())
    {
        const auto& row = value.get_table();
        for (const char* key : {"id", "source", "target", "property", "value", "weight", "kind"})
            if (!integer(row, key))
                return invalid_state();
        enchantment_transfer::thread entry{
            row["id"].get_int(), row["source"].get_int(), row["target"].get_int(),
            {static_cast<artefact_prop_type>(row["property"].get_int()), row["value"].get_int()},
            row["weight"].get_int()};
        const int kind = row["kind"].get_int();
        if (kind < 0 || kind > static_cast<int>(enchantment_transfer::effect_kind::enchantment))
            return invalid_state();
        entry.magic.kind = static_cast<enchantment_transfer::effect_kind>(kind);
        if (row.exists("brand_class"))
        {
            if (!integer(row, "brand_class") || row["brand_class"].get_int() < 0
                || row["brand_class"].get_int() >= NUM_OBJECT_CLASSES)
                return invalid_state();
            entry.magic.brand_class = static_cast<object_class_type>(row["brand_class"].get_int());
        }
        if (!price(entry.magic) || price(entry.magic) != entry.weight)
            return invalid_state();
        state.threads.push_back(entry);
    }
    return enchantment_transfer::valid(state, maximum_capacity) ? state : invalid_state();
}

void save(player& owner, const enchantment_transfer::ledger& state)
{
    ASSERT(enchantment_transfer::valid(state, maximum_capacity));
    CrawlHashTable table;
    table["version"] = 1;
    table["revision"] = state.revision;
    table["next"] = state.next_id;
    table["vessel"] = state.vessel;
    table["masterwork"] = state.masterwork;
    table["starter"] = static_cast<int>(state.starter_claimed);
    auto& rows = table["threads"].new_vector(SV_HASH);
    for (const auto& entry : state.threads)
    {
        CrawlHashTable row;
        row["id"] = entry.id;
        row["source"] = entry.source;
        row["target"] = entry.target;
        row["property"] = static_cast<int>(entry.magic.type);
        row["value"] = entry.magic.value;
        row["weight"] = entry.weight;
        row["kind"] = static_cast<int>(entry.magic.kind);
        row["brand_class"] = static_cast<int>(entry.magic.brand_class);
        rows.push_back(CrawlStoreValue(row));
    }
    owner.props[state_key] = table;
    owner.redraw_status_lights = true;
}

static bool owned_item(const player& owner, const item_def& item)
{
    if (!active(owner) || !item.defined() || item_id(item) <= 0)
        return false;
    const auto state = load(owner);
    if (!enchantment_transfer::valid(state, capacity(owner)))
        return false;
    // The item must be the one physical inventory instance. Detached memory
    // copies and duplicate IDs never act as additional equipment sources.
    int instances = 0;
    bool exact = false;
    for (const auto& candidate : owner.inv)
        if (candidate.defined() && item_id(candidate) == item_id(item))
        {
            ++instances;
            exact |= &candidate == &item;
        }
    return exact && instances == 1;
}

int enchantment_bonus(const player& owner, const item_def& item)
{
    if (owned_item(owner, item))
        for (const auto& entry : load(owner).threads)
            if (entry.target == item_id(item)
                && entry.magic.kind == enchantment_transfer::effect_kind::enchantment)
                return enchantment_transfer::contribution(entry.magic, native_item_enchantment(item));
    return 0;
}

int item_bonus(const player& owner, const item_def& item, artefact_prop_type prop)
{
    if (!owned_item(owner, item))
        return 0;
    const auto state = load(owner);
    for (const auto& entry : state.threads)
        if (entry.target == item_id(item) && entry.magic.kind == enchantment_transfer::effect_kind::property
            && entry.magic.type == prop)
            return enchantment_transfer::contribution(entry.magic, native_value(item, prop))
                + script_property(owner, item, prop);
    return script_property(owner, item, prop);
}

int bonus(const player& owner, artefact_prop_type prop)
{
    if (!active(owner))
        return 0;
    int result = 0;
    for (const auto& entry : owner.equipment.items)
        if (!entry.melded && !entry.is_overflow
            && (prop != ARTP_REGENERATION || entry.attuned))
        {
            result += item_bonus(owner, owner.inv[entry.item], prop);
        }
    if (const auto* talisman = owner.active_talisman())
        if (owner.form == owner.default_form)
            result += item_bonus(owner, *talisman, prop);
    return result;
}

void refresh()
{
    static bool refreshing = false;
    if (refreshing)
        return;
    unwind_var<bool> guard(refreshing, true);
    // Refresh borrowed scripts separately; ordinary equip side effects only run
    // on an actual equip transition.
    you.equipment.update();
    for (auto* item : you.equipment.get_forced_removal_list(true))
        if (item->defined() && item_is_equipped(*item))
            unequip_item(*item);
    invalidate_agrid(true);
    sync_scripts();
    notify_stat_change();
    calc_hp();
    const int previous_mp = you.props.exists("vellum_applied_mp")
        ? you.props["vellum_applied_mp"].get_int() : 0;
    const int current_mp = bonus(you, ARTP_MAGICAL_POWER);
    if (previous_mp > current_mp && you.uses_magic_reserve())
        pay_mp(previous_mp - current_mp);
    you.props["vellum_applied_mp"] = current_mp;
    calc_mp();
    you.redraw_armour_class = you.redraw_evasion = true;
    you.redraw_status_lights = you.wield_change = true;
    env.invis_knowledge.clear();
    const bool flight = you.equip_flight() > 0;
    if (flight && !you.attribute[ATTR_PERM_FLIGHT])
    {
        float_player();
        you.attribute[ATTR_PERM_FLIGHT] = 1;
    }
    else if (!flight && you.attribute[ATTR_PERM_FLIGHT])
        land_player();
}

void reapply_depletion(item_def& item)
{
    if (item.props.exists("vellum_plus_depleted"))
        item.plus = 0;
    if (!is_artefact(item) || !item.props.exists(depletion_key))
        return;
    const auto& rows = item.props[depletion_key].get_vector();
    for (const auto& value : rows)
    {
        const int prop = value.get_int();
        if (prop >= 0 && prop < ART_PROPERTIES
            && native_artefact_property(item, static_cast<artefact_prop_type>(prop)) != 0)
        {
            artefact_set_property(item, static_cast<artefact_prop_type>(prop), 0);
        }
    }
}

void on_destroyed(const item_def& item)
{
    const int id = item_id(item);
    if (!id)
        return;
    const auto destroy = [&](player& owner) {
        auto state = load(owner);
        if (enchantment_transfer::valid(state, maximum_capacity)
            && enchantment_transfer::destroy_target(state, id))
            save(owner, state);
    };
    if (!party::is_enabled())
        destroy(you);
    else
        for (int slot = 0; slot < party::player_count(); ++slot)
            destroy(party::get_player(slot));
}

std::string item_description(const player& owner, const item_def& item)
{
    std::string result;
    const int id = item_id(item);
    if (!id)
        return result;
    const auto state = load(owner);
    for (const auto& entry : state.threads)
        if (entry.target == id)
        {
            result += make_stringf("\nVellum: %s (%d capacity), %s. Only its owner can use this thread; consuming or destroying the item destroys it.",
                label(entry.magic).c_str(), entry.weight,
                active(owner) ? "active while equipped" : "dormant without Vellum's favour");
        }
    if (item.props.exists(depletion_key))
        result += "\nUnwoven: extracted enchantments stay depleted. Suppressed drawbacks reserve capacity and return without their owner's favour.";
    return result;
}

std::string summary(const player& owner)
{
    const auto state = load(owner);
    if (!enchantment_transfer::valid(state, maximum_capacity))
        return "Binding data needs repair; no threads are active.";
    return make_stringf("Bindings: %d/%d capacity. %s",
        enchantment_transfer::used(state), capacity(owner),
        active(owner) ? "One thread per property; borrowed powers require your equipped item."
                      : "Borrowed enchantments are dormant.");
}
}

namespace vellum
{
void record_drawback(item_def& item, int thread, enchantment_transfer::effect magic)
{
    if (!item.props.exists("vellum_drawbacks"))
        item.props["vellum_drawbacks"].new_vector(SV_HASH);
    CrawlHashTable row;
    row["owner"] = static_cast<int>(you.mid);
    row["thread"] = thread;
    row["property"] = static_cast<int>(magic.type);
    row["value"] = magic.value;
    item.props["vellum_drawbacks"].get_vector().push_back(CrawlStoreValue(row));
}

int restored_drawback(const item_def& item, artefact_prop_type prop)
{
    if (!item.props.exists("vellum_drawbacks"))
        return 0;
    for (const auto& value : item.props["vellum_drawbacks"].get_vector())
    {
        const auto& row = value.get_table();
        if (row["property"].get_int() != prop)
            continue;
        const auto suppressed = [&](const player& owner) {
            if (static_cast<int>(owner.mid) != row["owner"].get_int() || !active(owner))
                return false;
            bool carried_here = false;
            for (const auto& physical : owner.inv)
                carried_here |= &physical == &item;
            if (!carried_here)
                return false;
            const auto state = load(owner);
            const auto* thread = enchantment_transfer::find(state, row["thread"].get_int());
            return enchantment_transfer::valid(state, capacity(owner)) && thread
                && thread->target >= 0 && thread->source == item_id(item);
        };
        if (!party::is_enabled())
            return suppressed(you) ? 0 : row["value"].get_int();
        for (int slot = 0; slot < party::player_count(); ++slot)
            if (suppressed(party::get_player(slot)))
                return 0;
        return row["value"].get_int();
    }
    return 0;
}
}
