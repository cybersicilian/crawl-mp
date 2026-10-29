#pragma once

#include <cstdint>

// Pure accounting, in fixed-point work. Persistence and XP entitlement belong
// to the caller. No item, player, god or UI dependency is required.
namespace recharge
{
constexpr int precision = 1000;

struct account
{
    int capacity = 0;
    int price = 0;
    int debt = 0;
    int loan = 0;

    int ready() const;
    bool spend(bool enhanced);
    bool borrow();
    void reconfigure(int new_capacity, int new_price);
    // Returns work left after loan repayment; it is not also applied to debt.
    int repay(int work);
    void recover(int work);
};

int enhanced_price(int ordinary_price);
// Carry preserves packet-independent conversion at a fixed rate. On a rate
// change, retain the already earned fractional work in the new denominator.
int convert_xp(int xp, int denominator, int numerator,
               int& remainder, int& previous_denominator);
}
