#include "AppHdr.h"

#include "hydra-physiology.h"
#include "item-name.h"
#include "message.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "transform.h"
#ifdef USE_TILE
#include "tiledoll.h"
#endif

namespace hydra
{
    const char *const HEAD_LOSS_KEY = "hydra_net_head_loss";
    const char *const HEAD_RECOVERY_KEY = "hydra_head_recovery_xp";

    int heads_for_level(int experience_level, int net_head_loss)
    {
        return max(1, min(27, experience_level - net_head_loss));
    }

    bool has_native_heads(const player& p)
    {
        return p.species == SP_HYDRA
               && (p.form == p.default_form || p.form == transformation::statue);
    }

    int heads(const player& p)
    {
        if (!has_native_heads(p))
            return 1;
        const int loss = p.props.exists(HEAD_LOSS_KEY)
                         ? p.props[HEAD_LOSS_KEY].get_int() : 0;
        return heads_for_level(p.experience_level, loss);
    }

    int primary_bites(int head_count)
    {
        return (max(1, min(27, head_count)) + 2) / 3;
    }

    int amulet_slots(int head_count)
    {
        return primary_bites(head_count);
    }

    bool change_heads(int amount)
    {
        if (!has_native_heads(you) || !amount)
            return false;
        const int old_heads = heads(you);
        const int new_heads = max(1, min(27, old_heads + amount));
        if (old_heads == new_heads)
            return false;

        const int net_loss = you.experience_level - new_heads;
        you.props[HEAD_LOSS_KEY] = net_loss;
        if (net_loss)
            you.props[HEAD_RECOVERY_KEY] = 30 + random2(30);
        else
            you.props.erase(HEAD_RECOVERY_KEY);

        if (new_heads < old_heads)
        {
            const vector<item_def*> to_remove = you.equipment.get_forced_removal_list();
            for (item_def* item : to_remove)
            {
                mprf("%s falls away as a neck disappears.",
                     item->name(DESC_YOUR).c_str());
                unequip_item(*item, false, false, false);
            }
        }
        you.equipment.update();
        you.redraw_title = true;
        you.redraw_status_lights = true;
#ifdef USE_TILE
        init_player_doll();
#endif
        return true;
    }

    void on_level_change()
    {
        if (you.species != SP_HYDRA)
            return;
        if (you.props.exists(HEAD_LOSS_KEY))
        {
            int& loss = you.props[HEAD_LOSS_KEY].get_int();
            loss = max(loss, you.experience_level - 27);
            if (!loss)
                you.props.erase(HEAD_RECOVERY_KEY);
        }
        you.equipment.update();
#ifdef USE_TILE
        init_player_doll();
#endif
    }

    void recover_on_experience(unsigned int experience)
    {
        if (!experience || !has_native_heads(you)
            || you.form == transformation::statue
            || !you.props.exists(HEAD_LOSS_KEY)
            || !you.props.exists(HEAD_RECOVERY_KEY))
        {
            return;
        }
        const int loss = you.props[HEAD_LOSS_KEY].get_int();
        if (!loss)
            return;
        int& remaining = you.props[HEAD_RECOVERY_KEY].get_int();
        if (experience < static_cast<unsigned int>(max(remaining, 0)))
        {
            remaining -= static_cast<int>(experience);
            return;
        }
        if (change_heads(loss > 0 ? 1 : -1))
            mpr(loss > 0 ? "A lost head grows back." : "An extra head recedes.");
    }
}
