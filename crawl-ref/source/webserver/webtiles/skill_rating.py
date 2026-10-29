"""Deterministic Elo replay for participants facing reusable challenges.

This core knows nothing about game records, accounts or web requests. Ratings
are relative to a challenge pool; an expected result is a model prediction,
not a calibrated probability until validated on held-out outcomes.
"""
from dataclasses import dataclass, field
import math


@dataclass(frozen=True)
class RatedResult:
    key: str
    participant: str
    challenge: str
    started: str
    ended: str
    won: bool


@dataclass
class Rating:
    value: float = 1500.0
    games: int = 0
    wins: int = 0
    last_change: float = 0.0
    history: list = field(default_factory=list)


def expected_result(participant, challenge, scale=400.0):
    difference = max(-20.0, min(20.0, (challenge - participant) / scale))
    return 1.0 / (1.0 + math.pow(10.0, difference))


def replay(results, initial=1500.0, provisional_games=20):
    """One update per unique result, in completion order, with stable tie order.

    Start-time ratings are captured before processing a result ending at the
    same instant. They can be used as historical covariates without reading
    the result or another game that finished after the start of this one.
    Challenge and participant receive opposite updates (K=32, then 16).
    """
    participants, challenges, before_start, events = {}, {}, {}, []
    unique = {result.key: result for result in results}
    for result in unique.values():
        events.append((result.started, 0, result.key, result))
        events.append((result.ended, 1, result.key, result))
    for _when, kind, key, result in sorted(events):
        participant = participants.setdefault(result.participant, Rating(initial))
        challenge = challenges.setdefault(result.challenge, Rating(initial))
        if kind == 0:
            before_start[key] = participant.value
            continue
        expected = expected_result(participant.value, challenge.value)
        k = 32.0 if participant.games < provisional_games else 16.0
        change = k * (float(result.won) - expected)
        participant.value += change
        challenge.value -= change
        participant.games += 1
        participant.wins += int(result.won)
        participant.last_change = change
        challenge.games += 1
        challenge.wins += int(not result.won)
        participant.history.append({"key": key, "when": result.ended,
                                    "rating": round(participant.value, 2),
                                    "change": round(change, 2), "expected": expected,
                                    "won": result.won, "challenge": result.challenge})
    return participants, challenges, before_start
