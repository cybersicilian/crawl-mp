#include "AppHdr.h"

#include "game-modifiers.h"
#include "player.h"

namespace game_modifiers
{
    const char *const RUNE_LOCKS_DISABLED_KEY = "game_modifiers_no_rune_locks";
    const char *const TRAPS_KEY = "game_modifiers_traps";
    const char *const SHARED_FATE_KEY = "game_modifiers_shared_fate";

    bool shared_fate(const player& p)
    {
        return p.props.exists(SHARED_FATE_KEY)
               && p.props[SHARED_FATE_KEY].get_bool();
    }

    bool rune_locks_disabled(const player& p)
    {
        return p.props.exists(RUNE_LOCKS_DISABLED_KEY)
               && p.props[RUNE_LOCKS_DISABLED_KEY].get_bool();
    }

    traps trap_mode(const player& p)
    {
        if (!p.props.exists(TRAPS_KEY))
            return traps::normal;
        const int value = p.props[TRAPS_KEY].get_int();
        if (value < static_cast<int>(traps::normal)
            || value > static_cast<int>(traps::random_only))
            return traps::normal;
        return static_cast<traps>(value);
    }

    const char *trap_mode_name(traps mode)
    {
        switch (mode)
        {
        case traps::normal: return "normal";
        case traps::none: return "none";
        case traps::floor_only: return "floor";
        case traps::random_only: return "random";
        }
        return "normal";
    }

    bool floor_traps_enabled(const player& p)
    {
        const auto mode = trap_mode(p);
        return mode == traps::normal || mode == traps::floor_only;
    }

    bool random_traps_enabled(const player& p)
    {
        const auto mode = trap_mode(p);
        return mode == traps::normal || mode == traps::random_only;
    }

    void set_campaign(player& p, bool no_rune_locks, traps mode, bool shared_fate)
    {
        p.props[RUNE_LOCKS_DISABLED_KEY] = no_rune_locks;
        p.props[TRAPS_KEY] = static_cast<int>(mode);
        p.props[SHARED_FATE_KEY] = shared_fate;
    }
}
