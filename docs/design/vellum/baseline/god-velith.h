#pragma once

#include <string>
#include "enchantment-transfer.h"
#include "spl-cast.h"

class player;
struct item_def;
struct JsonNode;

namespace velith
{
constexpr int maximum_capacity = 6;
enum class operation { starter, extract, bind, archive, sever, masterwork };
struct request
{
    operation action = operation::extract;
    int source = 0;
    int target = 0;
    int thread = 0;
    int replace = 0;
    enchantment_transfer::effect magic;
    bool vessel = false;
};
struct quote
{
    request work;
    int owner = 0;
    int revision = 0;
    int cost = 0;
    int turns = 5;
    std::string blocked;
    std::string fingerprint;
};
bool active(const player& owner);
int rank(const player& owner);
int capacity(const player& owner);
int price(enchantment_transfer::effect magic);
int minimum_rank(artefact_prop_type prop);
std::string label(enchantment_transfer::effect magic);
enchantment_transfer::ledger load(const player& owner);
void save(player& owner, const enchantment_transfer::ledger& state);
int item_id(const item_def& item);
item_def* carried(int id);
int native_value(const item_def& item, artefact_prop_type prop);
std::string source_reason(const item_def& item, enchantment_transfer::effect magic);
std::string recipient_reason(const item_def& item, enchantment_transfer::effect magic,
                             bool vessel = false);
quote preview(const request& work);
bool commit(const quote& prepared);
spret begin(const quote& prepared);
spret invoke(int source_slot = -1);
int item_bonus(const player& owner, const item_def& item, artefact_prop_type prop);
int bonus(const player& owner, artefact_prop_type prop);
void refresh();
void on_destroyed(const item_def& item);
void reapply_depletion(item_def& item);
std::string item_description(const player& owner, const item_def& item);
std::string summary(const player& owner);
}
