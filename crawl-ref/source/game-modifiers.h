#pragma once

class player;

namespace game_modifiers
{
    // Stable serialized values; a missing property means normal traps.
    enum class traps
    {
        normal = 0,
        none = 1,
        floor_only = 2,
        random_only = 3,
    };

    extern const char *const RUNE_LOCKS_DISABLED_KEY;
    extern const char *const TRAPS_KEY;

    bool rune_locks_disabled(const player& p);
    traps trap_mode(const player& p);
    const char *trap_mode_name(traps mode);
    bool floor_traps_enabled(const player& p);
    bool random_traps_enabled(const player& p);
    void set_campaign(player& p, bool no_rune_locks, traps mode);
}
