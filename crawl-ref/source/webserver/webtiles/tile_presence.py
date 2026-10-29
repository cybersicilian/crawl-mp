"""Transient, connection-scoped tile pointers within a floor.

The caller supplies authorized identity metadata and recipients. Presence never
reaches the game engine or survives a map reset. Generations reject delayed
coordinates from the previous map; short leases bound missed disconnects.
"""
import time


class TilePresence:
    lease_seconds = 6
    interval_seconds = 0.04

    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.generation = 0
        self.pointers = {}

    def reset(self, receivers):
        self.generation += 1
        self.pointers.clear()
        for receiver in receivers:
            receiver.send_message("party_hover_reset", generation=self.generation)

    def sync(self, receiver):
        receiver.send_message("party_hover_reset", generation=self.generation)
        now = self.clock()
        for identity, (updated, packet) in self.pointers.items():
            if (identity != receiver.id and now - updated < self.lease_seconds
                    and (not packet.get("floor")
                         or packet["floor"] == getattr(receiver, "party_view_floor", None))):
                receiver.send_message("party_hover", **packet)

    def remove(self, source, receivers):
        identity = source.id
        previous = self.pointers.pop(identity, None)
        if previous is not None:
            packet = dict(id=identity, active=False, generation=self.generation)
            if previous[1].get("floor"):
                packet["floor"] = previous[1]["floor"]
            self._broadcast(source, receivers, packet)

    @staticmethod
    def _broadcast(source, receivers, packet):
        for receiver in receivers:
            if (receiver is not source and (not packet.get("floor")
                    or packet["floor"] == getattr(receiver, "party_view_floor", None))):
                receiver.send_message("party_hover", **packet)

    def update(self, source, data, metadata, receivers):
        if metadata.get("floor") and data.get("floor") != metadata["floor"]:
            return
        if type(data.get("generation")) is not int or data["generation"] != self.generation:
            return
        if data.get("active") is False:
            self.remove(source, receivers)
            return
        x, y = data.get("x"), data.get("y")
        if any(type(value) is not int or abs(value) > 256 for value in (x, y)):
            return
        now = self.clock()
        previous = self.pointers.get(source.id)
        if previous and now - previous[0] < self.interval_seconds:
            return
        packet = dict(metadata, id=source.id, x=x, y=y, active=True,
                      generation=self.generation)
        self.pointers[source.id] = (now, packet)
        self._broadcast(source, receivers, packet)
