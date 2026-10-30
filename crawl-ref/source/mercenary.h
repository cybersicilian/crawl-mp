#pragma once

#include "monster-type.h"

struct item_def;
class monster;

namespace mercenary
{
// Contracts are shop stock, not portable items. Their role is stored in the
// item properties so shop saves retain the exact offer and its price.
bool is_contract(const item_def& item);
bool valid_role(monster_type type);
void make_contract(item_def& item, monster_type type);
monster_type random_role();
int contract_value(const item_def& item);
bool recruit(const item_def& contract);

// Call only once the active member has been placed on a loaded level. A
// failed placement leaves the pending marker intact for a later retry.
bool ensure_starter_companion();
}
