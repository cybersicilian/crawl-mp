#pragma once

#include <functional>

// An enhancement belongs to one explicit activation. It is passed down to the
// native effect, never installed as a player skill override or global buff.
struct evocation
{
    int damage_percent = 100;
    int duration_percent = 100;
    int application_percent = 100;
    int ward_bonus = 0;
    int revival_hp_bonus = 0;
    int revival_hp_cap = 55;
    bool externally_funded = false;
    int skill_bonus = 0;
    std::function<bool()> payment;
    mutable bool committed = false;

    bool commit() const
    {
        if (committed)
            return true;
        if (payment && !payment())
            return false;
        committed = true;
        return true;
    }
    int damage(int value) const { return value * damage_percent / 100; }
    int duration(int value) const { return value * duration_percent / 100; }
};
