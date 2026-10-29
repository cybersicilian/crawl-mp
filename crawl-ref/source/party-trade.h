#pragma once

#include <string>

namespace party
{
// Empty means available. Visibility belongs to the giver, not shared vision.
std::string trade_block_reason(int giver_slot, int recipient_slot);
std::string transfer_item(int recipient_slot, int inventory_slot, int quantity);
}
