#pragma once

#include <string>
#include <vector>
#include "artefact-prop-type.h"
#include "object-class-type.h"

// Exclusive, conserved property attachments. Inventory, religion and UI belong
// to adapters. Target 0 is the archive; target -1 is a destroyed thread.
namespace enchantment_transfer
{
enum class effect_kind { property, unique_power, enchantment };
struct effect
{
    artefact_prop_type type = ARTP_NUM_PROPERTIES;
    int value = 0;
    effect_kind kind = effect_kind::property;
    object_class_type brand_class = OBJ_WEAPONS;
};
bool same_kind(effect first, effect second);
bool drawback(effect magic);
struct thread
{
    int id = 0;
    int source = 0;
    int target = 0;
    effect magic;
    int weight = 0;
};
struct ledger
{
    int revision = 0;
    int next_id = 1;
    int vessel = 0;
    int masterwork = 0;
    bool starter_claimed = false;
    std::vector<thread> threads;
};
const thread* find(const ledger& state, int id);
int used(const ledger& state);
int on_item(const ledger& state, int item);
bool valid(const ledger& state, int capacity);
int extract(ledger& state, int source, effect magic, int weight);
std::string binding_reason(const ledger& state, int id, int target,
                           int native_value, int capacity, int replace = 0);
bool bind(ledger& state, int id, int target, int native_value,
          int capacity, int replace = 0);
bool archive(ledger& state, int id);
bool sever(ledger& state, int id);
bool destroy_target(ledger& state, int target);
int contribution(effect magic, int native_value);
}
