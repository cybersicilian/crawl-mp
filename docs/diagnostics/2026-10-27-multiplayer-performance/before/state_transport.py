"""Ordered, connection-scoped JSON state deltas; full frames reset the baseline.

Paths are arrays of object keys or array indices. Arrays of a different length
are replaced atomically. Null values and deleted keys remain distinct.
"""
import json


def equal_json(left, right):
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(equal_json(left[key], right[key]) for key in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(equal_json(a, b) for a, b in zip(left, right))
    return left == right


def changes(previous, current, path=()):
    if equal_json(previous, current):
        return []
    if isinstance(previous, dict) and isinstance(current, dict):
        result = [[list(path + (key,))] for key in previous if key not in current]
        for key, value in current.items():
            if key not in previous:
                result.append([list(path + (key,)), value])
            else:
                result.extend(changes(previous[key], value, path + (key,)))
        return result
    if isinstance(previous, list) and isinstance(current, list) and len(previous) == len(current):
        return [change for index, value in enumerate(current)
                for change in changes(previous[index], value, path + (index,))]
    return [[list(path), current]]


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class StateEncoder:
    def __init__(self, channel):
        self.channel = channel
        self.previous = None
        self.revision = 0

    def frame(self, state):
        revision = self.revision + 1
        full = {"msg": "state_frame", "channel": self.channel, "revision": revision, "state": state}
        if self.previous is None:
            packet = encode(full)
        else:
            packet = encode({"msg": "state_frame", "channel": self.channel, "revision": revision,
                             "base": self.revision, "changes": changes(self.previous, state)})
            # Small deltas avoid serializing the entire state. Large changes
            # compare actual sizes and retain the cheaper representation.
            if len(packet) > 1024:
                complete = encode(full)
                if len(complete) <= len(packet):
                    packet = complete
        self.previous = state
        self.revision = revision
        return packet


def append_snapshot(receiver, identity, snapshot, send):
    previous = getattr(receiver, "last_party_snapshot", None)
    if previous is not None and previous[0] is identity and equal_json(previous[1], snapshot):
        return
    if getattr(receiver, "state_deltas", False) is True:
        if previous is None or previous[0] is not identity:
            receiver.state_encoder = StateEncoder(snapshot["msg"])
        packet = receiver.state_encoder.frame(snapshot)
    else:
        packet = encode(snapshot)
    receiver.append_message(packet, send)
    receiver.last_party_snapshot = (identity, snapshot)
