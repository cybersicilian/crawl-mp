"""Validation for client-supplied party room fields (GHSA-6cg2-m5w8-7j7g).

Rooms are re-sent to every lobby socket on each change, and every broadcast
normalises every slot. A non-string or unknown value stored in a room used to
raise inside that broadcast and stop lobby updates for everyone. Values are
therefore checked where they are written, and anything else is dropped.
"""
from webtiles import starting_weapons

# The seasonings the engine understands (party.cc, "seasoning=...").
SEASONINGS = ("fast_boil", "shared_ladle", "heavy_pebbles", "soul_tether", "chaotic_ladle")
TRAITS = ("none", "mummy", "zombie", "ghost")
MAX_CHOICE = 40


def _text(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if 0 < len(value) <= MAX_CHOICE else None


def species(value):
    """A known species name, or None."""
    value = _text(value)
    if value is None:
        return None
    key = "Djinni" if value == "Djinn" else value
    return value if key in starting_weapons.WEAPONS else None


def job(value):
    """A background known for some species, or None."""
    value = _text(value)
    if value is None:
        return None
    return value if any(value in jobs for jobs in starting_weapons.WEAPONS.values()) else None


def weapon(value):
    """A weapon name (checked against the species/job by normalize_slot), or None."""
    if value == "":
        return ""
    return _text(value)


def trait(value):
    return value if isinstance(value, str) and value in TRAITS else None


def seasonings(value):
    """The known seasonings in the list, without duplicates, or None for a non-list."""
    if not isinstance(value, list):
        return None
    out = []
    for item in value:
        if isinstance(item, str) and item in SEASONINGS and item not in out:
            out.append(item)
    return out
