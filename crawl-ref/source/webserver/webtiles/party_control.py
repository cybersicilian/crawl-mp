"""Connection identity is independent of the engine's currently acting hero.

The existing member map reserves heroes across reconnects. Multiplayer players
stay with their reserved heroes; solo owner selection is acknowledged by the
engine. Ordinary turn changes never select a different hero for a connection.
"""


class PartyControl:
    def __init__(self, owner, members):
        self.owner = (owner or "").casefold()
        self.members = members
        self.owner_slot = 0
        self.state = None
        self.views = {}
        self.ai_slots = set()
        self.ai_status = {}

    @staticmethod
    def identity(source):
        if source is None:
            return None
        username = getattr(source, "username", None)
        session_id = getattr(source, "id", None)
        return username or ("Player-%d" % session_id if session_id is not None else None)

    def is_owner(self, source):
        return bool(source and getattr(source, "username", None)
                    and source.username.casefold() == self.owner)

    def reservation(self, source):
        identity = self.identity(source)
        return next((slot for name, slot in self.members.items()
                     if identity and name.casefold() == identity.casefold()), None)

    @property
    def multiplayer(self):
        # Reservations survive disconnects, so leaving or reconnecting cannot
        # temporarily give the host control of somebody else's character.
        return bool(self.ai_slots) or any(name.casefold() != self.owner for name in self.members)

    def selected(self, source):
        if self.is_owner(source) and not self.multiplayer:
            return self.owner_slot
        return self.reservation(source)

    def occupied(self, slot, source):
        identity = self.identity(source)
        return slot in self.ai_slots or any(value == slot and name.casefold() != (identity or "").casefold()
                   for name, value in self.members.items())

    def claim(self, source, requested=None):
        identity = self.identity(source)
        if identity is None:
            raise ValueError("Join the expedition before claiming a hero.")
        existing = self.reservation(source)
        if requested is not None and (type(requested) is not int or not 0 <= requested < 4):
            raise ValueError("Choose a valid party hero (P1 to P4).")
        if existing is not None:
            if requested is not None and requested != existing:
                raise ValueError("You already control P%d." % (existing + 1))
            return existing
        if self.state and self.state.get("multiplayer_protocol") == 1:
            count = self.state.get("player_count", len(self.state.get("members", [])))
            reserved_count = len(self.members) + len(self.ai_slots)
            if count > reserved_count + 1:
                raise ValueError("This saved solo party has unclaimed companions. Start a human-only expedition to play multiplayer.")
            # Reserved joins can be queued before the native count is
            # acknowledged. They already belong to humans, so remain seats.
            count = max(count, reserved_count)
            available = [slot for slot in range(1, count + (count == reserved_count))
                         if slot < 4 and not self.occupied(slot, source)]
            if not available:
                raise ValueError("Every party hero is already claimed.")
            target = available[0]
            if requested is not None and requested != target:
                raise ValueError("Choose the next available human player seat (P%d)." % (target + 1))
            self.members[identity] = target
            return target
        available = [slot for slot in range(1, 4)
                     if not self.occupied(slot, source)
                     and (self.multiplayer or slot != self.owner_slot)]
        if requested is not None:
            if requested not in available:
                raise ValueError("That hero is already controlled by another player.")
            slot = requested
        elif available:
            slot = available[0]
        else:
            raise ValueError("Every party hero is already claimed.")
        self.members[identity] = slot
        return slot

    def controllable(self, source):
        if not self.state or self.selected(source) is None:
            return []
        return [member["slot"] for member in self.state.get("members", [])
                if member["slot"] == self.selected(source)
                or (self.is_owner(source) and not self.multiplayer
                    and not self.occupied(member["slot"], source))]

    def next_slot(self, source):
        available = set(self.controllable(source))
        alive = {member["slot"] for member in (self.state or {}).get("members", [])
                 if member.get("alive") and not member.get("ghost_haunting")}
        current = self.selected(source)
        return next(((current + offset) % 4 for offset in range(1, 5)
                     if (current + offset) % 4 in available & alive), current)

    def acknowledge(self, slot):
        if (not self.multiplayer and type(slot) is int and 0 <= slot < 4
                and not any(value == slot and name.casefold() != self.owner
                            for name, value in self.members.items())):
            self.owner_slot = slot

    def snapshot(self, source):
        selected = self.selected(source)
        state = self.views.get(selected if selected is not None else 0, self.state)
        state = dict(state)
        if self.multiplayer:
            state["members"] = [dict(member, floor_items=[], floor_items_known=False, trade_targets=[])
                                if member["slot"] != selected else member
                                for member in state.get("members", [])]
        state["members"] = [dict(member, ai=self.ai_status.get(member["slot"]))
                            for member in state.get("members", [])]
        return dict(state, controlled_slot=selected, ai_manage=self.is_owner(source),
                    controllable_slots=self.controllable(source))
