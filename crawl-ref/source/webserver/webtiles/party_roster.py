"""Server-owned launch membership; seats and native indices are separate."""


def occupied(slot):
    return slot.get("state") == "player" and bool(slot.get("username"))


def reservation(room, username):
    """An authenticated account occupies at most one seat in a room."""
    identity = (username or "").casefold()
    return next((slot for slot in room.get("slots", [])
                 if identity and slot.get("username", "").casefold() == identity), None)


def other_room(rooms, room, username):
    """Find an account's conflicting room without changing either roster."""
    identity = (username or "").casefold()
    return next((candidate for candidate in rooms if candidate is not room and identity
                 and (candidate.get("host", "").casefold() == identity
                      or reservation(candidate, username) is not None)), None)


def claimable(slot):
    return (slot.get("slot") in (1, 2, 3)
            and slot.get("state") in {"open", "companion", "player"}
            and not slot.get("username"))


def launch_slots(room):
    slots = room.get("slots", [])
    if not slots:
        return []
    multiplayer = room.get("resume_multiplayer") is True or sum(occupied(slot) for slot in slots) > 1 or any(slot.get("state") == "ai" for slot in slots)
    return [slot for index, slot in enumerate(slots)
            if index == 0 or occupied(slot)
            or slot.get("state") == "ai"
            or (not multiplayer and slot.get("state") == "companion")]


def describe(room):
    result = dict(room)
    active = launch_slots(room)
    result["launch_slots"] = [slot["slot"] for slot in active]
    result["available_slots"] = [slot["slot"] for slot in room.get("slots", []) if claimable(slot)]
    result["multiplayer"] = room.get("resume_multiplayer") is True or sum(occupied(slot) for slot in active) > 1 or any(slot.get("state") == "ai" for slot in active)
    return result
