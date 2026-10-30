#pragma once

#include <vector>

struct item_def;

// Item-backed storage. Transfers change the bag only; callers must stage the
// bag and commit both sides only after the destination accepts the item.
namespace bag
{
bool is_bag(const item_def& item);
int capacity(const item_def& item);
int used(const item_def& item);
std::vector<item_def> contents(const item_def& item);
// The returned pointer is invalidated by subsequent transfers on the bag.
item_def* at(item_def& container, int index);
bool store(item_def& container, const item_def& source, int quantity,
           int* stored_index = nullptr);
bool take(item_def& container, int index, int quantity, item_def& result);
}
