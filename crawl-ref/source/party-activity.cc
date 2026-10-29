/** Cooperative, interruptible automation. Each tick is one native action. */
#include "AppHdr.h"
#include "party.h"

#include "delay.h"
#include "nearby-danger.h"
#include "player.h"
#include "options.h"
#include "spl-cast.h"
#include "unwind.h"
#include "travel.h"

namespace
{
// Intent is session-local, so loading a save never silently resumes waiting.
bool yielding[party::MAX_PARTY_PLAYERS] = {};
}

namespace party
{
string member_activity(int slot)
{
    if (!multiplayer_enabled() || slot < 0 || slot >= player_count())
        return "";
    const player& member = get_player(slot);
    if (is_player_downed(slot))
        return "";
    if (yielding[slot])
        return "yield";
    if (member.delay_queue.empty() || !member.delay_queue.front()->is_cooperative())
        return "";
    if (!member.delay_queue.front()->is_run())
        return member.delay_queue.front()->cooperative_activity_name();
    if (member.delay_queue.front()->is_resting())
        return "rest";
    return member.running.is_explore() ? "explore" : "travel";
}

void reset_activities()
{
    for (bool& waiting : yielding)
        waiting = false;
}

void cancel_activity()
{
    yielding[active_slot()] = false;
    if (current_delay() && current_delay()->is_cooperative())
        stop_delay(false, true);
}

bool start_yielding()
{
    if (!multiplayer_enabled() || is_player_downed(active_slot()) || !i_feel_safe(true))
        return false;
    cancel_activity();
    yielding[active_slot()] = true;
    return true;
}

void interrupt_unsafe_activities()
{
    if (!multiplayer_enabled())
        return;
    for (int slot = 0; slot < player_count(); ++slot)
    {
        if (is_player_downed(slot))
            yielding[slot] = false;
        if (!slot_is_on_current_floor(slot) || member_activity(slot).empty())
            continue;
        scoped_player_context context(slot);
        if (!i_feel_safe())
            cancel_activity();
    }
}

void step_activity()
{
    if (!multiplayer_enabled() || member_activity(active_slot()).empty())
        return;
    // Check personal danger before initiative: a recovering hero must still
    // stop yielding as soon as a threat appears, without spending a turn.
    if (!i_feel_safe())
    {
        cancel_activity();
        // Native equipment delays may refuse interruption. Let them finish
        // one owner action at a time rather than freezing their input queue.
        if (member_activity(active_slot()).empty())
            return;
    }
    if (!member_can_act(active_slot()))
        return;
    you.turn_is_over = false;
    you.time_taken = player_speed();
    you.pos_at_turn_start = you.pos();
    if (yielding[active_slot()])
    {
        you.apply_berserk_penalty = true;
        update_acrobat_status();
        you.turn_is_over = true;
    }
    else
    {
        if (!current_delay()->is_macro())
            stop_channelling_spells();
        // Peer socket input is not a keypress by the automated character.
        unwind_bool key_stop(Options.travel_key_stop, false);
        handle_delay(); // Native rest completion, explore stops and action costs.
    }
}
}
