"""Native player patches: retain a complete cache and send changed readings.

Player fields replace values, except inventory, which merges by slot and then
by item field in the existing browser client. Neither operation mutates input.
"""
from webtiles.state_transport import changed_fields


def merge_player(previous, update):
    state = dict(previous, **update)
    if "inv" in update:
        inventory = dict(previous.get("inv", {}))
        for slot, item in update["inv"].items():
            inventory[slot] = dict(inventory.get(slot, {}), **item)
        state["inv"] = inventory
    return state


def player_update(previous, current):
    update = changed_fields(previous, current)
    # This marker chooses the client's spectator-clock path. Keep it beside
    # time even when the marker itself did not change (e.g. a slower hero).
    if "time" in update and "time_last_input" in current:
        update["time_last_input"] = current["time_last_input"]
    if "inv" in update:
        inventory = changed_fields(previous.get("inv", {}), current["inv"])
        if inventory:
            update["inv"] = inventory
        else:
            del update["inv"]
    return dict(update, msg="player") if update else None
