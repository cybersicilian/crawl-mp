"""Expedition-owned presentation, independent of account graphics preferences."""
import json

MODES = ("overhead", "first_person")


def normalize(value):
    return value if value in MODES else "overhead"


def from_party(party):
    if not isinstance(party, dict):
        return "overhead"
    room = party.get("room")
    return normalize(room.get("presentation", party.get("presentation")) if isinstance(room, dict)
                     else party.get("presentation"))


def for_process(process):
    value = getattr(process, "presentation", None)
    if value not in MODES:
        room = getattr(process, "lobby_room", None)
        if isinstance(room, dict):
            value = normalize(room.get("presentation"))
        elif getattr(process, "record_id", None):
            from webtiles import game_library
            game = game_library.get_game(process.record_id)
            value = from_party(json.loads(game["party_json"])) if game else "overhead"
        else:
            value = "overhead"
        process.presentation = value
    return value
