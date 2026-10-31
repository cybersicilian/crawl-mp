"""Matched observational contrasts, independent of the stats record format.

One observation per independent unit. Controls are matched within a stratum.
Win ranges use Wilson bounds propagated conservatively through the contrast;
they are descriptive uncertainty ranges, not multiple-testing significance
claims. Score ranges use variance of the matched means. Neither identifies a
causal effect or corrects unmeasured selection bias.
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Observation:
    unit: str
    owner: str
    stratum: tuple
    features: frozenset
    won: bool
    score: float | None = None


def wilson(wins, total, z=1.96):
    if not total:
        return None
    p = wins / total
    denominator = 1.0 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    radius = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator
    return max(0.0, centre - radius), min(1.0, centre + radius)


def _mean(values):
    return sum(values) / len(values)


def _variance_of_mean(values):
    if len(values) < 2:
        return None
    mean = _mean(values)
    return sum((value - mean) ** 2 for value in values) / (len(values) - 1) / len(values)


def contrast(observations, feature, other=None, min_games=5, min_owners=3):
    """A vs not-A, or the four-cell interaction (AB-A)-(B-neither).

    Only strata containing every cell contribute. Weights are the exposed
    population (A, or AB). Each unit appears once, even when replays repeat.
    Missing scores never become zero. Every score contrast uses its own
    complete strata and reports its own denominators.
    """
    groups = {}
    for observation in observations:
        groups[observation.unit] = observation
    strata = {}
    cells_count = 4 if other else 2
    coefficients = (1, -1, -1, 1) if other else (1, -1)
    for observation in groups.values():
        a = feature in observation.features
        b = other in observation.features if other else False
        cell = (0 if a and b else 1 if a else 2 if b else 3) if other else (0 if a else 1)
        cells = strata.setdefault(observation.stratum, [[] for _ in range(cells_count)])
        cells[cell].append(observation)
    matched = [cells for cells in strata.values() if all(cells)]
    pooled = [[o for cells in matched for o in cells[index]] for index in range(cells_count)]
    counts = [len(cell) for cell in pooled]
    owners = [len({o.owner for o in cell}) for cell in pooled]
    eligible = all(n >= min_games for n in counts) and all(n >= min_owners for n in owners)
    result = {"status": "estimated" if eligible else "insufficient_data",
              "observed_exposed": sum(feature in o.features and (not other or other in o.features)
                                      for o in groups.values()),
              "counts": counts, "owners": owners, "strata": len(matched),
              "win_delta_pp": None, "win_range_pp": None,
              "score_delta": None, "score_range": None, "score_counts": [0] * cells_count,
              "score_status": "insufficient_data", "exposed_win_pct": None,
              "baseline_win_pct": None, "interaction": bool(other)}
    if not eligible:
        return result
    total_weight = sum(len(cells[0]) for cells in matched)
    delta = lower = upper = exposed = baseline = 0.0
    for cells in matched:
        weight = len(cells[0]) / total_weight
        probabilities = [sum(o.won for o in cell) / len(cell) for cell in cells]
        bounds = [wilson(sum(o.won for o in cell), len(cell)) for cell in cells]
        exposed += weight * probabilities[0]
        baseline += weight * probabilities[1]
        delta += weight * sum(c * p for c, p in zip(coefficients, probabilities))
        lower += weight * sum(c * bounds[i][0 if c > 0 else 1] for i, c in enumerate(coefficients))
        upper += weight * sum(c * bounds[i][1 if c > 0 else 0] for i, c in enumerate(coefficients))
    result.update(win_delta_pp=round(100 * delta, 2),
                  win_range_pp=[round(100 * lower, 2), round(100 * upper, 2)],
                  exposed_win_pct=round(100 * exposed, 2), baseline_win_pct=round(100 * baseline, 2))
    scored = [[[o for o in cell if isinstance(o.score, (int, float)) and
                math.isfinite(o.score)] for cell in cells] for cells in matched]
    scored = [cells for cells in scored if all(len(cell) >= 2 for cell in cells)]
    result["score_counts"] = [sum(len(cells[i]) for cells in scored) for i in range(cells_count)]
    if not scored or not all(n >= min_games for n in result["score_counts"]) or not all(
            len({o.owner for cells in scored for o in cells[i]}) >= min_owners for i in range(cells_count)):
        return result
    total_weight = sum(len(cells[0]) for cells in scored)
    score_delta = variance = 0.0
    for cells in scored:
        weight = len(cells[0]) / total_weight
        values = [[o.score for o in cell] for cell in cells]
        score_delta += weight * sum(c * _mean(v) for c, v in zip(coefficients, values))
        variance += weight * weight * sum(_variance_of_mean(v) for v in values)
    radius = 1.96 * math.sqrt(variance)
    result.update(score_status="estimated", score_delta=round(score_delta, 2),
                  score_range=[round(score_delta - radius, 2), round(score_delta + radius, 2)])
    return result
