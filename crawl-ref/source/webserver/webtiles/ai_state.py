"""Convert native observations into explicit semantic facts for System One.

Arithmetic and local path finding stay in code. The model judges which of the
offered actions best serves the party using those facts and native rules.
"""
from collections import deque


DIRECTIONS = {"west": (-1, 0), "south": (0, 1), "north": (0, -1), "east": (1, 0),
              "northwest": (-1, -1), "southwest": (-1, 1), "northeast": (1, -1), "southeast": (1, 1)}


def direction(dx, dy):
    return ("north" if dy < 0 else "south" if dy > 0 else "") + ("west" if dx < 0 else "east" if dx > 0 else "") or "here"


def path_step(rows, start, target, allowed_steps, blocked=()):
    """First offered move along a known safe path toward a target or map edge.

    The target may be outside the local window. Return no step if every
    reachable cell is at least as far away as the starting cell, or if already
    adjacent. Unknown tiles and marked hazards are never path evidence.
    """
    distance = lambda cell: max(abs(cell[0] - target[0]), abs(cell[1] - target[1]))
    if distance(start) <= 1:
        return None
    queue = deque([(start, None)])
    seen = {start} | set(blocked)
    best, result = distance(start), None
    while queue:
        cell, first = queue.popleft()
        if distance(cell) < best:
            best, result = distance(cell), first
            if best <= 1:
                break
        for name, (dx, dy) in DIRECTIONS.items():
            if first is None and name not in allowed_steps:
                continue
            point = cell[0] + dx, cell[1] + dy
            x, y = point
            if (point in seen or not 0 <= y < len(rows) or not 0 <= x < len(rows[y])
                    or rows[y][x] not in ".+<>"):
                continue
            seen.add(point)
            queue.append((point, first or name))
    return result


def facts(observation):
    hp, maximum = observation.get("hp", 0), observation.get("hp_max", 0)
    health = "unknown" if not maximum else "critical" if hp * 4 <= maximum else "hurt" if hp * 2 <= maximum else "injured" if hp < maximum else "full"
    hostiles = [m for m in observation.get("creatures", []) if m.get("hostile")]
    nearest = min(hostiles, key=lambda m: max(abs(m["dx"]), abs(m["dy"])), default=None)
    result = dict(health=health, visible_hostile_count=len(hostiles),
                  adjacent_hostiles=sum(max(abs(m["dx"]), abs(m["dy"])) <= 1 for m in hostiles))
    if nearest:
        result["nearest_hostile"] = dict(name=nearest["name"], direction=direction(nearest["dx"], nearest["dy"]),
                                         distance=max(abs(nearest["dx"]), abs(nearest["dy"])))
    leader = next((p for p in observation.get("party", []) if p.get("slot") == 0), None)
    if leader and all(key in observation for key in ("x", "y")):
        same = leader.get("floor") == observation.get("floor")
        result["leader_on_same_floor"] = same
        if same:
            dx, dy = leader["x"] - observation["x"], leader["y"] - observation["y"]
            result["leader_direction"] = direction(dx, dy)
            result["leader_distance"] = max(abs(dx), abs(dy))
            allowed = {key[5:] for key in observation.get("actions", {}) if key.startswith("step_")}
            blocked = [(8 + m["dx"], 8 + m["dy"]) for m in observation.get("creatures", [])]
            result["suggested_follow_step"] = path_step(observation.get("terrain", []), (8, 8), (8 + dx, 8 + dy), allowed, blocked)
    return result


def action_options(observation, tactical):
    result = dict(observation.get("actions", {}))
    suggested = "step_" + str(tactical.get("suggested_follow_step"))
    if suggested in result:
        result[suggested] += "; first step along the known safe route toward the party leader"
    return result
