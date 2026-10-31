"""Small, JSON-safe metrics shared by statistics projections.

Ratios retain raw counts and distinguish no observations from an unbounded
ratio. The presentation cell can be sorted without serializing IEEE infinity.
"""


def ratio_record(numerator, denominator):
    state = "finite" if denominator else "unbounded" if numerator else "unobserved"
    value = numerator / denominator if denominator else None
    return {"numerator": numerator, "denominator": denominator, "value": value,
            "state": state, "text": "%.3g" % value if value is not None else
            "∞" if state == "unbounded" else "—",
            "sort": value if value is not None else "Infinity" if numerator else ""}


MOB_KDR_NOTE = (
    "Mob KDR = heroes slain ÷ times slain by heroes, from the monster’s perspective. "
    "∞ means it has slain heroes with no recorded deaths; — means no recorded kills or deaths. "
    "These are recorded totals, not encounter or survival odds. Your server-record filters apply."
)


def mob_record(kills, deaths):
    record = ratio_record(kills, deaths)
    record["title"] = "%d heroes slain / %d times slain by heroes" % (kills, deaths)
    return record
