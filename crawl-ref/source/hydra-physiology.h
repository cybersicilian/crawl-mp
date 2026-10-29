#pragma once

class player;

namespace hydra
{
    // A signed loss permits temporary extra heads from regrowth. The property
    // belongs to the individual player and is serialized with their props.
    extern const char *const HEAD_LOSS_KEY;
    extern const char *const HEAD_RECOVERY_KEY;

    int heads_for_level(int experience_level, int net_head_loss = 0);
    bool has_native_heads(const player& p);
    int heads(const player& p);
    int primary_bites(int head_count);
    int amulet_slots(int head_count);

    // These operate on the current player; party callers must establish that
    // player's context first, as they do for ordinary equipment changes.
    bool change_heads(int amount);
    void on_level_change();
    void recover_on_experience(unsigned int experience);
}
