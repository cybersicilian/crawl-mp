#pragma once

class monster;
struct item_def;

namespace mercenary
{
// Inventory and owner arguments always refer to the active party member.
bool can_receive_item(const monster& hire, const item_def& item);
bool give_item(monster& hire, int inventory_slot);
bool can_give_item();
bool prompt_gift();

// Rebuilds a witch's personal spell list from a newly equipped magical staff.
// Unsupported staves leave the previous spell list unchanged.
bool refresh_witch_spells(monster& hire, const item_def& staff);
}
