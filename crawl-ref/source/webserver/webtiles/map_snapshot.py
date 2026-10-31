"""Incremental cell storage with a lazy, complete reconnect baseline.

Coordinates may use the native x+1/y shorthand. A reset cell is self-contained;
legacy cells merge their tile/monster fields. Input packets remain immutable:
their values are shared, never copied, and a changed cell is always rebuilt.
"""


class MapSnapshot:
    def __init__(self):
        self.floor = None
        self.cells = {}
        self.metadata = {}
        self._packet = None

    def update(self, packet, floor):
        if packet.get("clear") or self.floor != floor:
            self.cells.clear()
            self.metadata.clear()
        self.floor = floor
        self._packet = None
        self.metadata.update({key: value for key, value in packet.items()
                              if key not in {"cells", "clear"}})
        x, y = 0, 0
        for delta in packet.get("cells", []):
            if delta is None:
                continue
            x, y = delta.get("x", x + 1), delta.get("y", y)
            key = (x, y)
            cell = {} if delta.get("reset") else dict(self.cells.get(key, {}))
            for field, value in delta.items():
                if field in {"t", "mon"} and isinstance(value, dict):
                    # A different monster id starts a new identity.
                    old = cell.get(field) or {}
                    if field == "mon" and value.get("id", old.get("id")) != old.get("id"):
                        old = {}
                    cell[field] = dict(old, **value)
                else:
                    cell[field] = value
            cell.update(x=x, y=y)
            self.cells[key] = cell

    def packet(self):
        if self._packet is None:
            self._packet = dict(self.metadata, msg="map", floor=self.floor, clear=True,
                                cells=[self.cells[key] for key in sorted(self.cells)])
        return self._packet
