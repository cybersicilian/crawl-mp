#pragma once

struct item_def;

// Uses native stacking, charge merging, letters and inventory capacity.
// Does not remove anything from the source; the caller owns that cleanup.
bool merge_items_into_inv(item_def& item, int quantity, int& inventory_slot,
                          bool quiet);
