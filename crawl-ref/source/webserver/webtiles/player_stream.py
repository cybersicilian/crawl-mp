"""Recipient-owned native streams, scoped by character and floor.

Native projection is the information boundary. This adapter routes it and
maintains reconnect baselines; it never derives visibility from browser data.
"""
import json

from webtiles.state_transport import append_snapshot, changed_fields
from webtiles.map_snapshot import MapSnapshot
from webtiles.player_update import merge_player, player_update


class PlayerStreams:
    shared = {"version", "options", "set_option", "layout"}
    projected = {"map", "player", "party_state", "record_identity"}
    global_member_fields = {"hp", "hp_max", "mp", "mp_max", "xl_cap", "alive", "ghost_haunting", "zot_clock", "bribe_fund", "banes"}
    # These facts require the recipient's loaded floor. Off-floor native
    # snapshots deliberately report false danger/readiness and compare regions
    # with their own viewer, so they cannot replace a local teammate's facts.
    local_member_fields = {"region_id", "region_aut_clock", "region_combat",
                           "same_region", "can_act", "aut_lead"}
    public_member_fields = {"slot", "name", "species", "job", "place", "pos", "turns",
                            "hp", "hp_max", "mp", "mp_max", "xl", "xl_cap", "alive", "ghost_haunting", "gold", "activity", "bribe_fund", "banes",
                            "aut_clock", "aut_lead", "last_action_aut", "region_id", "region_aut_clock",
                            "region_combat", "same_region", "can_act", "move_delay_aut", "atk_aut",
                            "cooldown_ms", "cooldown_remaining_ms", "queued_action", "queued_action_count", "zot_clock"}

    # Shared bootstrap packets, in the order a reattaching client replays them.
    bootstrap_order = ("version", "options", "layout")

    def __init__(self, control, presence, request_view=None):
        self.control = control
        self.presence = presence
        self.cached = {}
        self.maps = {}
        self.bootstrap = {}
        self.request_view = request_view
        self.pending = set()
        self.requested = set()
        self.native_ready = False

    def request(self, receiver):
        slot = self.slot(receiver)
        self.pending.add(slot)
        self.requested.discard(slot)
        self.flush_requests()

    def note_mode(self, packet):
        if packet.get("msg") == "input_mode":
            self.native_ready = packet.get("mode") == 1  # Native COMMAND mode.
            if not self.native_ready:
                self.requested.clear()
            self.flush_requests()

    def flush_requests(self):
        if self.native_ready and self.request_view:
            for slot in sorted(self.pending - self.requested):
                if self.request_view(slot):
                    self.requested.add(slot)

    def remember_shared(self, packet):
        if packet.get("msg") in {"version", "options", "layout"}:
            self.bootstrap[packet["msg"]] = packet

    def attach(self, receiver):
        receiver.personal_stream = self
        receiver.personal_packets = {}
        receiver.personal_center = None
        receiver.personal_map_metadata = {}
        receiver.party_view_floor = None
        receiver.last_party_snapshot = None

    def _share_expedition_facts(self, packet, source_slot, receivers, send):
        for slot, previous in list(self.control.views.items()):
            if slot == source_slot or previous.get("floor") == packet.get("floor"):
                continue
            view = dict(previous)
            for key in ("gold", "friendly_fire", "player_count", "max_players", "global_time"):
                if key in packet:
                    view[key] = packet[key]
            members = {member["slot"]: dict(member) for member in previous.get("members", [])}
            refresh_floor = False
            for update in packet.get("members", []):
                target = update["slot"]
                member = members.setdefault(target, dict(slot=target))
                was_here = member.get("place") == view.get("floor")
                is_here = update.get("place", member.get("place")) == view.get("floor")
                # Downing/revival changes sight and the teammate's proxy even
                # when no hero changes floors. Ask native for the affected
                # personal projection instead of retaining stale perception.
                if (target == slot or was_here or is_here) and any(
                        key in member and key in update and member[key] != update[key]
                        for key in ("alive", "ghost_haunting")):
                    refresh_floor = True
                if target == slot:
                    # Global deadlines can affect this hero while their floor is
                    # unloaded. Keep their spatial and private projection intact.
                    member.update({key: value for key, value in update.items()
                                   if key in self.global_member_fields})
                    continue
                member.update({key: value for key, value in update.items()
                               if key in self.public_member_fields
                               and not (is_here and key in self.local_member_fields)})
                member["on_same_level"] = member.get("place") == view.get("floor")
                if not member["on_same_level"]:
                    if "same_region" in member:
                        member["same_region"] = False
                    if "can_act" in member:
                        member["can_act"] = False
                refresh_floor = refresh_floor or (was_here != member["on_same_level"])
            for member in members.values():
                if "gold" in view:
                    member["gold"] = view["gold"]
                if member["slot"] == slot:
                    member["trade_targets"] = [target for target in member.get("trade_targets", [])
                        if members.get(target, {}).get("place") == view.get("floor")]
            view["members"] = [members[key] for key in sorted(members)]
            self.control.views[slot] = view
            self.cached.setdefault(slot, {})["party_state"] = (view, view.get("floor"))
            clock_update = None
            if type(view.get("global_time")) is int:
                # Native time is expedition-wide, even when no new personal map
                # projection is needed. Merge only into this hero's own cache.
                previous_player = self.cached[slot].get("player", ({"msg": "player"}, view.get("floor")))
                clock_update = dict(previous_player[0], time=view["global_time"])
                if "time_last_input" in previous_player[0] and "time" in previous_player[0]:
                    clock_update["time_last_input"] += view["global_time"] - previous_player[0]["time"]
                clock_update.update({key: value for key, value in members.get(slot, {}).items()
                                     if key in {"hp", "hp_max", "mp", "mp_max"}})
                self.cached[slot]["player"] = (clock_update, previous_player[1])
            if refresh_floor:
                self.pending.add(slot)
                self.requested.discard(slot)
            for receiver in receivers:
                if self.slot(receiver) == slot:
                    if clock_update is not None:
                        self.deliver(receiver, clock_update, view.get("floor"), send)
                    append_snapshot(receiver, self.control, self.control.snapshot(receiver), send)
        self.flush_requests()

    def slot(self, receiver):
        selected = self.control.selected(receiver)
        # Spectating follows the host's permitted view, never union vision.
        return selected if selected is not None else 0

    def deliver(self, receiver, packet, floor, send, receivers=(), encoded=None):
        if getattr(receiver, "personal_stream", None) is not self:
            self.attach(receiver)
        kind = packet.get("msg")
        if kind == "party_state":
            slot = self.slot(receiver)
            self.control.views[slot] = packet
            append_snapshot(receiver, self.control, self.control.snapshot(receiver), send)
            return
        if kind in {"map", "player", "record_identity"}:
            previous = getattr(receiver, "personal_packets", {})
            prior = previous.get(kind)
            baseline = (floor, packet)
            if kind != "player" and prior == baseline:
                return
            # Native projections are immutable after ingestion. Share their
            # baseline between same-character sessions without copying maps.
            previous[kind] = baseline
            receiver.personal_packets = previous
            if kind == "player" and prior is not None and prior[0] == floor:
                packet = player_update(prior[1], packet)
                if packet is None:
                    return
        if kind == "map":
            packet = dict(packet)
            # Sequence/work counters describe native projection, not a visual
            # change. Empty projections must not repaint every idle teammate.
            metadata = {key: value for key, value in packet.items()
                        if key not in {"cells", "clear", "view_seq", "view_work"}}
            same_floor = getattr(receiver, "party_view_floor", None) == floor
            old_metadata = receiver.personal_map_metadata if same_floor else {}
            metadata_changed = bool(changed_fields(old_metadata, metadata))
            receiver.personal_map_metadata = dict(old_metadata, **metadata)
            if same_floor and not packet.get("clear") and not packet.get("cells") and not metadata_changed:
                return
            if "vgrdc" in packet:
                center = (floor, packet["vgrdc"].get("x"), packet["vgrdc"].get("y"))
                if getattr(receiver, "personal_center", None) == center:
                    packet.pop("vgrdc", None)
                receiver.personal_center = center
            if getattr(receiver, "party_view_floor", None) != floor:
                self.presence.remove(receiver, receivers)
                receiver.party_view_floor = floor
                self.presence.sync(receiver)
        if encoded is not None and kind == "map":
            # One native projection reaches every same-character session.
            # Serialize it once per camera variant, not once per receiver.
            variant = "vgrdc" in packet
            text = encoded.get(variant)
            if text is None:
                text = encoded[variant] = json.dumps(packet, separators=(",", ":"))
        else:
            text = json.dumps(packet, separators=(",", ":"))
        receiver.append_message(text, send)

    def ingest(self, envelope, receivers, send):
        slot, payload = envelope.get("slot"), envelope.get("payload")
        if type(slot) is not int or not 0 <= slot < 4 or not isinstance(payload, dict):
            return
        kind, floor = payload.get("msg"), envelope.get("floor")
        if envelope.get("view") is not True:
            self.note_mode(payload)
        elif kind == "map":
            self.pending.discard(slot)
            self.requested.discard(slot)
        if kind in {"map", "party_state"}:
            payload = dict(payload, floor=floor)
        if kind in self.shared:
            self.remember_shared(payload)
            for receiver in receivers:
                receiver.append_message(json.dumps(payload), send)
            return
        if kind in self.projected and envelope.get("view") is not True:
            return
        if kind == "msgs":
            # Native text can be deferred until after the acting context has
            # changed. Its owner is captured when the message is created.
            for receiver in receivers:
                target = self.slot(receiver)
                messages = [dict((key, value) for key, value in entry.items() if key != "recipient")
                            for entry in payload.get("messages", [])
                            if entry.get("recipient", slot) == target]
                packet = dict(payload) if target == slot else dict(msg="msgs")
                packet["messages"] = messages
                if messages or any(key in packet for key in ("more", "rollback")):
                    receiver.append_message(json.dumps(packet, separators=(",", ":")), send)
            return
        if kind == "party_state":
            self.control.state = payload
            self.control.views[slot] = payload
            self._share_expedition_facts(payload, slot, receivers, send)
        if kind in self.projected or kind in {"input_mode", "ui_state"}:
            if kind == "player":
                previous = self.cached.get(slot, {}).get(kind)
                payload = merge_player(previous[0] if previous is not None and previous[1] == floor else {}, payload)
            self.cached.setdefault(slot, {})[kind] = (payload, floor)
        if kind == "map":
            self.maps.setdefault(slot, MapSnapshot()).update(payload, floor)
        encoded = {}
        for receiver in receivers:
            if self.slot(receiver) == slot:
                self.deliver(receiver, payload, floor, send, receivers, encoded)

    def restore(self, receiver):
        self.attach(receiver)
        # Layout must precede the first map so its render can satisfy client
        # readiness. Every game-client attachment needs complete baselines,
        # including another attachment to the same native process.
        for kind in self.bootstrap_order:
            if kind in self.bootstrap:
                receiver.append_message(json.dumps(self.bootstrap[kind]), True)
        slot = self.slot(receiver)
        for payload, floor in self.cached.get(slot, {}).values():
            if payload.get("msg") == "map":
                payload = self.maps[slot].packet()
            self.deliver(receiver, payload, floor, True)
