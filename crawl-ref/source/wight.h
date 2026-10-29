#pragma once

#include <string>

class actor;
struct item_def;

namespace wight
{
bool buried(const item_def& item);
bool owns_curse(const item_def& item);
int weapon_bonus(const item_def& item);
std::string burial_reason(const item_def* item);
bool bury(item_def& item);
bool release(item_def& item);
void drain_target(actor& target);
}
