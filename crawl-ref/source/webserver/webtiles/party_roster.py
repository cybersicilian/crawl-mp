"""Server-owned launch membership; seats and native indices are separate."""


def occupied(slot):
    return slot.get("state") == "player" and bool(slot.get("username"))


def launch_slots(room):
    slots = room.get("slots", [])
    if not slots:
        return []
    multiplayer = sum(occupied(slot) for slot in slots) > 1 or any(slot.get("state") == "ai" for slot in slots)
    return [slot for index, slot in enumerate(slots)
            if index == 0 or occupied(slot)
            or slot.get("state") == "ai"
            or (not multiplayer and slot.get("state") == "companion")]


def describe(room):
    result = dict(room)
    active = launch_slots(room)
    result["launch_slots"] = [slot["slot"] for slot in active]
    result["multiplayer"] = sum(occupied(slot) for slot in active) > 1 or any(slot.get("state") == "ai" for slot in active)
    return result
