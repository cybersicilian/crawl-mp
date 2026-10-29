#include "AppHdr.h"
#include "recharge-account.h"

#include <algorithm>
#include <limits>

namespace recharge
{
int enhanced_price(int price)
{
    // The premium rounds up in whole native work units, before fixed point.
    return ((price / precision * 3 + 1) / 2) * precision;
}

int account::ready() const
{
    return price > 0 ? std::max(0, capacity - debt) / price : 0;
}

bool account::spend(bool enhanced)
{
    if (!ready())
        return false;
    debt += enhanced ? enhanced_price(price) : price;
    return true;
}

bool account::borrow()
{
    if (loan || ready() || price <= 0)
        return false;
    loan = price * 2;
    return true;
}

void account::reconfigure(int new_capacity, int new_price)
{
    const int credit = std::min(std::max(capacity - debt, 0), new_capacity);
    const int overheat = std::max(debt - capacity, 0);
    capacity = new_capacity;
    price = new_price;
    debt = capacity - credit + overheat;
}

int account::repay(int work)
{
    const int paid = std::min(loan, std::max(work, 0));
    loan -= paid;
    return std::max(0, work - paid);
}

void account::recover(int work)
{
    debt = std::max(0, debt - std::max(0, work));
}

int convert_xp(int xp, int denominator, int numerator,
               int& remainder, int& previous_denominator)
{
    denominator = std::max(1, denominator);
    if (previous_denominator > 0 && denominator != previous_denominator)
        remainder = static_cast<int>(int64_t(remainder) * denominator
                                     / previous_denominator);
    previous_denominator = denominator;
    const int64_t total = int64_t(std::max(0, xp)) * precision * numerator
                          + remainder;
    remainder = total % denominator;
    return static_cast<int>(std::min<int64_t>(total / denominator,
                                             std::numeric_limits<int>::max()));
}
}
