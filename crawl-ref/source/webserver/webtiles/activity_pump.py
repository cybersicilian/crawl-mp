"""Fair, paced automation using native intent and command boundaries.

No client timer or current actor determines ownership. Native safety, costs,
completion and floor initiative remain authoritative for every single step.
"""


import time
from typing import Callable, NamedTuple, Optional


class BufferedInput(NamedTuple):
    slot: Optional[int]
    callback: Callable[[], None]
    requires_alive: bool = True


class ActivityPump:
    # This is a readiness poll, not an animation or combat cooldown. A single
    # in-flight native command still bounds work and round-robin owns dispatch.
    tick_interval_ms = 50

    def __init__(self, control, streams, connected_slots, send, now=time.monotonic,
                 probe=None, restore_prompt=None, diagnostic=None,
                 cancel_prompt=None, prompt_grace=30.0):
        self.control = control
        self.streams = streams
        self.connected_slots = connected_slots
        self.send = send
        self._now = now
        self.previous = -1
        self.cancellations = set()
        self.inflight = False
        self.inputs = []
        self.request_id = 0
        self.manual = False
        self.owner = None
        self.prompt = False
        self.cooldown_until = {}
        self.cooldown_duration = {}
        self.queued_action = {}
        self.action_tail = {}
        self.dispatching = None
        self.last_aut_clock = {}
        self.last_turns = {}
        self.probe = probe
        self.restore_prompt = restore_prompt
        self.diagnostic = diagnostic
        self.cancel_prompt = cancel_prompt
        self.prompt_grace = max(0.0, prompt_grace)
        self.prompt_disconnected_at = None
        self.last_prompt_cancel_at = None
        self.started_at = None
        self.last_probe_at = None
        self.last_status = None
        self.reported_stall = False
        self.unanswered_probes = 0
        self.reported_unresponsive = False
        self.probe_interval = 5.0
        self.recovery_counts = dict(probes=0, completed=0, prompts=0, unresolved=0, abandoned_prompts=0)

    def _hold_request(self, slot, manual):
        self.inflight = True
        self.manual = manual
        self.owner = slot
        self.prompt = False
        self.streams.native_ready = False
        self.started_at = self._now()
        self.last_probe_at = None
        self.last_status = None
        self.reported_stall = False
        self.unanswered_probes = 0
        self.reported_unresponsive = False
        self.prompt_disconnected_at = None
        self.last_prompt_cancel_at = None

    def _note_prompt_presence(self):
        if not self.inflight or not self.prompt or self.owner in self.connected_slots():
            self.prompt_disconnected_at = None
            self.last_prompt_cancel_at = None
        elif self.prompt_disconnected_at is None:
            self.prompt_disconnected_at = self._now()

    def _cancel_abandoned_prompt(self, status):
        self._note_prompt_presence()
        if (self.cancel_prompt is None or self.prompt_disconnected_at is None
                or self._now() - self.prompt_disconnected_at < self.prompt_grace
                or self.last_prompt_cancel_at is not None
                and self._now() - self.last_prompt_cancel_at < self.probe_interval):
            return
        # Called only for a fresh native prompt status with the exact token.
        # Sending cancellation retains ownership until native proves completion.
        if self.cancel_prompt(self.owner, self.request_id, status.get("input_mode")):
            self.last_prompt_cancel_at = self._now()
            self.recovery_counts["abandoned_prompts"] += 1
            self._diagnose("disconnected_prompt_cancelled", status)

    def _diagnose(self, event, status=None):
        if self.diagnostic:
            record = dict(event=event, activity_id=self.request_id, owner=self.owner,
                          prompt=self.prompt, queued_inputs=len(self.inputs),
                          age_seconds=round(self._now() - self.started_at, 1))
            if status:
                record["native"] = {key: status.get(key) for key in
                                    ("state", "owner", "pending_activity_id", "input_mode")}
            self.diagnostic(record)

    def check_stalled_request(self):
        if not self.inflight or self.probe is None or self.started_at is None:
            return
        previous = self.last_probe_at if self.last_probe_at is not None else self.started_at
        if self._now() - previous < self.probe_interval:
            return
        self.last_probe_at = self._now()
        if not self.reported_stall:
            self._diagnose("awaiting_native_status")
            self.reported_stall = True
        if self.unanswered_probes >= 2 and not self.reported_unresponsive:
            self._diagnose("native_unresponsive")
            self.reported_unresponsive = True
        self.recovery_counts["probes"] += 1
        self.unanswered_probes += 1
        self.probe(self.request_id)

    def recover(self, status):
        # A timeout only requests evidence. Only an exact native completion
        # can release a command; a busy/unknown engine retains ownership.
        request = status.get("activity_id")
        if not self.inflight or type(request) is not int or request != self.request_id:
            return
        self.unanswered_probes = 0
        self.reported_unresponsive = False
        state, owner = status.get("state"), status.get("owner")
        if state == "complete":
            self._diagnose("completion_recovered", status)
            self.recovery_counts["completed"] += 1
            self.command_boundary(request)
        elif state == "prompt" and type(owner) is int and 0 <= owner < 4:
            changed = not self.prompt or self.owner != owner
            if self.owner != owner:
                self.prompt_disconnected_at = self.last_prompt_cancel_at = None
            self.owner = owner
            self.prompt_boundary()
            if changed:
                self._diagnose("prompt_recovered", status)
                self.recovery_counts["prompts"] += 1
                if self.restore_prompt:
                    self.restore_prompt()
            self._cancel_abandoned_prompt(status)
        elif state in {"unknown", "busy"} and self.last_status != state:
            self._diagnose("native_" + state, status)
            self.recovery_counts["unresolved"] += state == "unknown"
        if self.inflight and self.request_id == request:
            self.last_status = state

    def _view(self, slot, state=None):
        if isinstance(state, dict) and state.get("members"):
            return state
        views = getattr(self.control, "views", None) or {}
        return views.get(slot) or getattr(self.control, "state", None) or {}

    def _member(self, slot, state=None):
        view = self._view(slot, state)
        return next((hero for hero in view.get("members", []) if hero.get("slot") == slot), {})

    def _region_peers(self, slot, state=None):
        view = self._view(slot, state)
        members = view.get("members", [])
        own = next((hero for hero in members if hero.get("slot") == slot), {})
        peers = []
        for hero in members:
            m_slot = hero.get("slot")
            if m_slot == slot or hero.get("alive") is False or hero.get("ghost_haunting"):
                continue
            if hero.get("on_same_level") is False:
                continue
            if own.get("region_id") is not None and hero.get("region_id") is not None:
                if hero.get("region_id") != own.get("region_id"):
                    continue
            elif "same_region" in hero and not hero.get("same_region"):
                continue
            elif own.get("place") and hero.get("place") and hero.get("place") != own.get("place"):
                continue
            peers.append(hero)
        return peers

    def check_smart_fast_forward(self, slot, state=None):
        if not getattr(self.control, "multiplayer", False):
            self.cooldown_until[slot] = 0.0
            return True
        own = self._member(slot, state)
        if own.get("region_combat") is False:
            # Safe exploration needs no animation barrier with idle peers.
            # Native eligibility and command acknowledgement still gate input.
            self.cooldown_until[slot] = 0.0
            return True
        own_ready = (slot in self.queued_action
                     or bool(own.get("activity")) or own.get("can_act") is False)
        if not own_ready:
            return False
        peers = self._region_peers(slot, state)
        if not peers:
            # An isolated region has no peer whose animation needs pacing.
            # Native can_act still gates recovery; don't add a second delay.
            self.cooldown_until[slot] = 0.0
            return True
        if all(peer.get("slot") in self.queued_action
               or bool(peer.get("activity"))
               or peer.get("can_act") is False
               for peer in peers):
            self.cooldown_until[slot] = 0.0
            for peer in peers:
                p_slot = peer.get("slot")
                if type(p_slot) is int:
                    self.cooldown_until[p_slot] = 0.0
            return True
        return False

    def _sync_views(self):
        views = getattr(self.control, "views", None) or {}
        seen = set()
        for view in list(views.values()) + ([self.control.state] if isinstance(getattr(self.control, "state", None), dict) else []):
            if not isinstance(view, dict) or id(view) in seen:
                continue
            seen.add(id(view))
            for member in view.get("members", []):
                if isinstance(member, dict):
                    self.annotate_member(member)

    def annotate_member(self, member):
        slot = member.get("slot")
        if type(slot) is not int:
            return
        now = self._now()
        remaining_s = self.cooldown_until.get(slot, 0.0) - now
        if remaining_s > 0:
            duration = self.cooldown_duration.get(slot, 0)
            member["cooldown_ms"] = duration
            member["cooldown_remaining_ms"] = int(max(1, round(remaining_s * 1000.0)))
        elif "cooldown_ms" in member or "cooldown_remaining_ms" in member:
            member["cooldown_ms"] = 0
            member["cooldown_remaining_ms"] = 0
        queued = self.queued_action.get(slot)
        inputs = sum(entry.slot == slot and entry.requires_alive for entry in self.inputs)
        if queued is not None or inputs:
            member["queued_action"] = (queued.get("label", "queued") if isinstance(queued, dict)
                                       else str(queued) if queued is not None else "input")
            member["queued_action_count"] = inputs + (1 + len(self.action_tail.get(slot, [])) if queued is not None else 0)
        elif "queued_action" in member or "queued_action_count" in member:
            member["queued_action"] = None
            member["queued_action_count"] = 0

    def note_party_state(self, state):
        if not isinstance(state, dict):
            return
        members = state.get("members", [])
        any_turn_advanced = any(
            type(m.get("slot")) is int
            and isinstance(m.get("turns"), int)
            and m.get("slot") in self.last_turns
            and m.get("turns") > self.last_turns[m.get("slot")]
            for m in members
        )
        now = self._now()
        for member in members:
            slot = member.get("slot")
            if type(slot) is not int:
                continue
            if member.get("alive") is False or member.get("ghost_haunting"):
                # Incapacitation invalidates future gameplay intentions, even
                # if revival precedes the currently owned command's completion.
                self.clear_queued_action(slot)
                self.clear_queued_input(slot, requires_alive_only=True)
            new_aut = member.get("aut_clock")
            new_turns = member.get("turns")
            old_aut = self.last_aut_clock.get(slot)
            old_turns = self.last_turns.get(slot)
            if old_aut is None and old_turns is None:
                if isinstance(new_aut, int):
                    self.last_aut_clock[slot] = new_aut
                if isinstance(new_turns, int):
                    self.last_turns[slot] = new_turns
                continue
            turn_advanced = (isinstance(new_turns, int) and isinstance(old_turns, int)
                             and new_turns > old_turns)
            aut_advanced = (isinstance(new_aut, int) and isinstance(old_aut, int)
                            and new_aut > old_aut)
            if turn_advanced or (aut_advanced and not any_turn_advanced):
                delta_aut = (max(0, new_aut - old_aut)
                             if (isinstance(new_aut, int) and isinstance(old_aut, int) and new_aut > old_aut)
                             else (member.get("last_action_aut") or 10))
                if delta_aut <= 0:
                    delta_aut = member.get("last_action_aut") or 10
                combat = member.get("region_combat", state.get("combat_locked"))
                ms_per_aut = 50 if combat else 25
                duration_ms = int(min(1400, max(100, delta_aut * ms_per_aut)))
                self.cooldown_duration[slot] = duration_ms
                self.cooldown_until[slot] = now + duration_ms / 1000.0
            if isinstance(new_aut, int):
                self.last_aut_clock[slot] = new_aut
            if isinstance(new_turns, int):
                self.last_turns[slot] = new_turns
        for member in members:
            slot = member.get("slot")
            if type(slot) is int:
                self.check_smart_fast_forward(slot, state)
                self.annotate_member(member)

    def should_buffer_action(self, slot):
        if not getattr(self.control, "multiplayer", False) or not self.streams.native_ready:
            return False
        own = self._member(slot)
        if own.get("alive") is False or own.get("ghost_haunting"):
            return False
        if slot in self.queued_action and self.dispatching != slot:
            return True
        if own.get("can_act") is False:
            return True
        return self._now() < self.cooldown_until.get(slot, 0.0)

    def queue_action(self, slot, label, callback):
        entry = {"label": label or "queued", "callback": callback}
        if slot in self.queued_action:
            tail = self.action_tail.setdefault(slot, [])
            if len(tail) >= 31:
                return False
            tail.append(entry)
        else:
            self.queued_action[slot] = entry
        self.check_smart_fast_forward(slot)
        self._sync_views()
        return True

    def clear_queued_action(self, slot):
        removed = self.queued_action.pop(slot, None)
        self.action_tail.pop(slot, None)
        self._sync_views()
        return removed is not None

    def start_manual(self, slot):
        if self.inflight or not self.streams.native_ready:
            return None
        self.request_id += 1
        self._hold_request(slot, True)
        return self.request_id

    def input_eligible(self, slot):
        own = self._member(slot)
        return own.get("alive") is not False and not own.get("ghost_haunting")

    def queue_input(self, callback, slot=None, requires_alive=True):
        if requires_alive and not self.input_eligible(slot):
            return False
        if sum(entry.slot == slot for entry in self.inputs) >= 32:
            return False
        self.inputs.append(BufferedInput(slot, callback, requires_alive))
        self._sync_views()
        return True

    def clear_queued_input(self, slot, requires_alive_only=False):
        previous = len(self.inputs)
        self.inputs = [entry for entry in self.inputs if entry.slot != slot
                       or requires_alive_only and not entry.requires_alive]
        self._sync_views()
        return len(self.inputs) != previous

    def _next_input(self, after):
        index = 0
        if type(after) is int and 0 <= after < 4:
            # Preserve each actor's key order while giving other waiting actors
            # a command boundary between commands from a buffered burst.
            for offset in range(1, 5):
                slot = (after + offset) % 4
                candidate = next((i for i, entry in enumerate(self.inputs) if entry.slot == slot), None)
                if candidate is not None:
                    index = candidate
                    break
        entry = self.inputs.pop(index)
        self._sync_views()
        return entry

    def prompt_boundary(self):
        self.prompt = True
        # A prompt belongs to the original command, including automated work.
        # Retain that token and deliver only its owner's buffered responses.
        while self.inflight:
            index = next((i for i, entry in enumerate(self.inputs)
                          if entry.slot == self.owner), None)
            if index is None:
                break
            entry = self.inputs.pop(index)
            self._sync_views()
            entry.callback()

    def command_boundary(self, request_id=None):
        if request_id is not None and (type(request_id) is not int or not self.inflight):
            return False
        if self.inflight and request_id != self.request_id:
            return False
        if request_id is not None and request_id != self.request_id:
            return False
        completed_owner = self.owner
        self.inflight = False
        self.manual = False
        self.owner = None
        self.prompt = False
        self.started_at = None
        self.last_probe_at = None
        self.prompt_disconnected_at = None
        self.last_prompt_cancel_at = None
        # The exact native completion token also proves COMMAND readiness.
        # Rejected actions can complete without a separate input_mode packet.
        self.streams.native_ready = True
        # Local rejections/cancellations may consume no native command. Drain
        # those callbacks until one actually takes ownership of the engine.
        while self.inputs and not self.inflight and self.streams.native_ready:
            entry = self._next_input(completed_owner)
            completed_owner = entry.slot
            if entry.requires_alive and not self.input_eligible(entry.slot):
                continue
            entry.callback()
        # A pending personal view may have been deferred while the native
        # command still owned its completion token. The view adapter also
        # defers it if a queued command above has taken ownership in turn.
        flush_requests = getattr(self.streams, "flush_requests", None)
        if flush_requests:
            flush_requests()
        return True

    def cancel(self, slot):
        self.cancellations.add(slot)
        self.clear_queued_action(slot)
        self.clear_queued_input(slot, requires_alive_only=True)

    def tick(self):
        self._note_prompt_presence()
        self.check_stalled_request()
        if not self.control.multiplayer or not self.streams.native_ready or self.inflight:
            return
        if self.cancellations:
            slot = min(self.cancellations)
            self.request_id += 1
            if self.send(slot, cancel=True):
                self.cancellations.remove(slot)
                self._hold_request(slot, False)
            return
        if self.queued_action:
            for offset in range(1, 5):
                slot = (self.previous + offset) % 4
                if slot not in self.queued_action:
                    continue
                self.check_smart_fast_forward(slot)
                own = self._member(slot)
                if slot not in self.connected_slots() or own.get("alive") is False or own.get("ghost_haunting"):
                    self.clear_queued_action(slot)
                    continue
                if own.get("can_act") is False:
                    continue
                if self._now() < self.cooldown_until.get(slot, 0.0):
                    continue
                entry = self.queued_action.pop(slot)
                tail = self.action_tail.get(slot, [])
                if tail:
                    self.queued_action[slot] = tail.pop(0)
                if not tail:
                    self.action_tail.pop(slot, None)
                self._sync_views()
                self.previous = slot
                callback = entry.get("callback") if isinstance(entry, dict) else entry
                if callable(callback):
                    self.dispatching = slot
                    try:
                        callback()
                    finally:
                        self.dispatching = None
                elif self.send:
                    self.request_id += 1
                    if self.send(slot):
                        self._hold_request(slot, True)
                return
        connected = self.connected_slots()
        for offset in range(1, 5):
            slot = (self.previous + offset) % 4
            view = self.control.views.get(slot, {})
            own = next((hero for hero in view.get("members", []) if hero["slot"] == slot), {})
            if (slot not in connected or not own.get("activity") or not own.get("alive")
                    or own.get("can_act") is False):
                continue
            self.request_id += 1
            if self.send(slot):
                self.previous = slot
                # At most one request awaits the next real COMMAND boundary.
                self._hold_request(slot, False)
            return
