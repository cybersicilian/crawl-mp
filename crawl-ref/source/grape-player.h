#pragma once

struct item_def;

namespace grape_player
{
// The caller must select the affected player context first.
bool suppressed(const item_def& item);
bool affected();
bool suppress(item_def& item);
bool restore(item_def& item);
bool suppress_one();
bool restore_one();
void forget(item_def& item);
}
