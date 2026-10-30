#include "AppHdr.h"

#include "bag.h"

#include "item-def.h"
#include "item-prop-enum.h"
#include "items.h"
#include "store.h"

namespace bag
{
namespace
{
constexpr const char* contents_key = "bag_contents";

const CrawlVector* stored_items(const item_def& container)
{
    if (!container.props.exists(contents_key))
        return nullptr;
    const CrawlStoreValue& value = container.props[contents_key];
    if (value.get_type() != SV_VEC || value.get_vector().get_type() != SV_ITEM)
        return nullptr;
    return &value.get_vector();
}

bool valid_contents(const item_def& container)
{
    const CrawlVector* items = stored_items(container);
    if (!items)
        return !container.props.exists(contents_key);
    if (static_cast<int>(items->size()) > capacity(container))
        return false;
    for (const auto& value : *items)
        if (value.get_type() != SV_ITEM || !value.get_item().defined()
            || value.get_item().quantity <= 0 || is_bag(value.get_item()))
            return false;
    return true;
}
}

bool is_bag(const item_def& item)
{
    return capacity(item) > 0;
}

int capacity(const item_def& item)
{
    if (!item.defined() || item.base_type != OBJ_MISCELLANY)
        return 0;
    switch (item.sub_type)
    {
    case MISC_POUCH: return 4;
    case MISC_SATCHEL: return 8;
    case MISC_BAG_OF_PLENTY: return 12;
    default: return 0;
    }
}

int used(const item_def& item)
{
    const CrawlVector* items = stored_items(item);
    return items ? static_cast<int>(items->size()) : 0;
}

std::vector<item_def> contents(const item_def& item)
{
    std::vector<item_def> result;
    if (!is_bag(item) || !valid_contents(item))
        return result;
    const CrawlVector* items = stored_items(item);
    if (items)
        for (const auto& value : *items)
            result.push_back(value.get_item());
    return result;
}

item_def* at(item_def& container, int index)
{
    if (!is_bag(container) || !valid_contents(container)
        || !container.props.exists(contents_key) || index < 0)
    {
        return nullptr;
    }
    CrawlVector& items = container.props[contents_key].get_vector();
    if (index >= static_cast<int>(items.size()))
        return nullptr;
    return &items[index].get_item();
}

bool store(item_def& container, const item_def& source, int quantity,
           int* stored_index)
{
    if (!is_bag(container) || !valid_contents(container) || !source.defined()
        || is_bag(source) || quantity <= 0 || quantity > source.quantity)
    {
        return false;
    }

    item_def portion = source;
    portion.quantity = quantity;
    // Splitting leaves the original stack in place; a second copy must not
    // carry its persistent item identity. It can receive a new ID on demand.
    if (quantity < source.quantity)
        portion.props.erase(ITEM_UNIQUE_ID);
    // A stored item is neither a floor item nor an inventory index. Its
    // original physical link must never be interpreted after a transfer.
    portion.pos = coord_def(-3, -3);
    portion.link = NON_ITEM;
    portion.slot = 0;

    item_def staged = container;
    CrawlVector& items = staged.props.exists(contents_key)
                         ? staged.props[contents_key].get_vector()
                         : staged.props[contents_key].new_vector(SV_ITEM);
    int index = 0;
    for (auto& value : items)
    {
        item_def& existing = value.get_item();
        if (items_stack(existing, portion))
        {
            if (existing.inscription.empty())
                existing.inscription = portion.inscription;
            existing.quantity += quantity;
            container = staged;
            if (stored_index)
                *stored_index = index;
            return true;
        }
        ++index;
    }
    if (static_cast<int>(items.size()) >= capacity(container))
        return false;
    items.push_back(portion);
    container = staged;
    if (stored_index)
        *stored_index = index;
    return true;
}

bool take(item_def& container, int index, int quantity, item_def& result)
{
    if (!is_bag(container) || !valid_contents(container)
        || !container.props.exists(contents_key) || index < 0)
    {
        return false;
    }
    item_def staged = container;
    CrawlVector& items = staged.props[contents_key].get_vector();
    if (index >= static_cast<int>(items.size()))
        return false;
    item_def& stored = items[index].get_item();
    if (quantity <= 0 || quantity > stored.quantity)
        return false;
    item_def portion = stored;
    portion.quantity = quantity;
    if (quantity < stored.quantity)
        portion.props.erase(ITEM_UNIQUE_ID);
    if (quantity == stored.quantity)
        items.erase(index);
    else
        stored.quantity -= quantity;
    container = staged;
    result = portion;
    return true;
}
}
