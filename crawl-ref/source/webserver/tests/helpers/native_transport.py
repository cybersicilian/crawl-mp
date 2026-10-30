"""Deterministically delay one real completion at the server transport seam."""


class NativeCompletionHold:
    def __init__(self, probe, activity_id):
        self.probe = probe
        self.activity_id = activity_id
        self.held = []
        self.previous = None

    def __enter__(self):
        self.previous = self.probe.packet_callback
        self.probe.packet_callback = self.accept
        return self

    def accept(self, packet):
        payload = packet.get("payload", packet)
        if (packet.get("view") is not True and payload.get("msg") == "party_activity_ready"
                and payload.get("activity_id") == self.activity_id):
            self.held.append(packet)
        else:
            self.previous(packet)

    def release(self):
        self.probe.packet_callback = self.previous
        for packet in self.held:
            self.previous(packet)
        self.held.clear()

    def __exit__(self, *error):
        self.probe.packet_callback = self.previous
