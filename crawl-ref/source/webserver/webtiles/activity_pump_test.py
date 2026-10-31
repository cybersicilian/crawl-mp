import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.activity_pump import ActivityPump


class ActivityPumpTest(unittest.TestCase):
    def setUp(self):
        self.control = SimpleNamespace(multiplayer=True, views={})
        self.streams = SimpleNamespace(native_ready=True)
        self.connected = {0, 1, 2, 3}
        self.send = Mock(return_value=True)
        self.pump = ActivityPump(self.control, self.streams, lambda: self.connected, self.send)
        for slot, mode in enumerate(["explore", "rest", "yield", "yield"]):
            self.control.views[slot] = dict(floor="D:%d" % (slot // 2 + 1),
                members=[dict(slot=slot, activity=mode, alive=True, can_act=True)])

    def test_four_players_take_round_robin_steps_across_floors(self):
        for _ in range(12):
            self.streams.native_ready = True
            self.pump.command_boundary(self.pump.request_id)
            self.pump.tick()
        self.assertEqual([call.args[0] for call in self.send.call_args_list], [0, 1, 2, 3] * 3)

    def test_one_in_flight_and_native_prompt_blocks_automation(self):
        self.pump.tick()
        self.pump.tick()
        self.send.assert_called_once_with(0)
        self.assertFalse(self.streams.native_ready)

    def test_recovering_downed_disconnected_and_completed_tasks_are_skipped(self):
        self.control.views[0]["members"][0]["can_act"] = False
        self.control.views[1]["members"][0]["alive"] = False
        self.connected.remove(2)
        self.pump.tick()
        self.send.assert_called_once_with(3)
        self.control.views[3]["members"][0]["activity"] = ""
        self.streams.native_ready = True
        self.pump.tick()
        self.send.assert_called_once()

    def test_solo_and_failed_delivery_do_not_consume_readiness(self):
        self.control.multiplayer = False
        self.pump.tick()
        self.send.assert_not_called()
        self.control.multiplayer = True
        self.send.return_value = False
        self.pump.tick()
        self.assertTrue(self.streams.native_ready)

    def test_manual_buffer_is_ordered_bounded_and_cancellable(self):
        delivered = []
        for index in range(32):
            self.assertTrue(self.pump.queue_action(0, str(index), lambda i=index: delivered.append(i)))
        self.assertFalse(self.pump.queue_action(0, "overflow", Mock()))
        self.assertEqual(self.control.views[0]["members"][0]["queued_action_count"], 32)
        for _ in range(3):
            self.pump.tick()
        self.assertEqual(delivered, [0, 1, 2])
        self.assertTrue(self.pump.clear_queued_action(0))
        self.assertNotIn(0, self.pump.action_tail)
        self.assertEqual(self.control.views[0]["members"][0]["queued_action_count"], 0)

    def test_independent_queued_manual_action_does_not_wait_for_animation(self):
        own = self.control.views[0]["members"][0]
        own.update(activity="", region_id=0, region_combat=False)
        self.control.views[0]["members"].append(dict(slot=1, alive=True, region_id=1, can_act=True))
        self.pump.cooldown_until[0] = self.pump._now() + 1
        callback = Mock()
        self.pump.queue_action(0, "move", callback)
        self.pump.tick()
        callback.assert_called_once()

    def test_safe_exploration_has_no_presentation_wait_for_idle_regional_peers(self):
        self.pump._now = lambda: 10.0
        own = dict(slot=0, alive=True, activity="", can_act=True, turns=0,
                   aut_clock=0, region_id=0, region_combat=False)
        peer = dict(slot=1, alive=True, activity="", can_act=True, region_id=0)
        state = dict(members=[own, peer])
        self.control.views = {0: state}
        self.pump.note_party_state(state)
        own.update(turns=1, aut_clock=10)
        self.pump.note_party_state(state)
        self.assertEqual(self.pump.cooldown_until[0], 0.0)
        self.assertFalse(self.pump.should_buffer_action(0))
        self.assertEqual(peer.get("activity"), "")
        self.send.assert_not_called()

    def test_combat_or_unknown_safety_keeps_pacing_and_native_recovery_still_gates(self):
        self.pump._now = lambda: 10.0
        own = dict(slot=0, alive=True, activity="", can_act=True, region_id=0)
        peer = dict(slot=1, alive=True, activity="", can_act=True, region_id=0)
        self.control.views = {0: dict(members=[own, peer])}
        for combat in (True, None):
            own["region_combat"] = combat
            self.pump.cooldown_until[0] = 10.5
            self.assertFalse(self.pump.check_smart_fast_forward(0))
            self.assertTrue(self.pump.should_buffer_action(0))
        own.update(region_combat=False, can_act=False)
        self.pump.check_smart_fast_forward(0)
        self.assertTrue(self.pump.should_buffer_action(0))
        self.pump.queue_action(0, "move", Mock())
        self.pump.tick()
        self.send.assert_not_called()

    def test_disconnected_queued_actions_are_discarded(self):
        callback = Mock()
        self.pump.queue_action(0, "move", callback)
        self.connected.remove(0)
        self.pump.tick()
        callback.assert_not_called()
        self.assertNotIn(0, self.pump.queued_action)

    def test_peer_activity_never_substitutes_for_own_native_intent(self):
        self.control.views = {0: dict(members=[dict(slot=1, activity="yield", alive=True)])}
        self.pump.tick()
        self.send.assert_not_called()

    def test_stop_during_peer_prompt_is_retained_and_precedes_any_more_steps(self):
        self.streams.native_ready = False
        self.pump.cancel(2)
        self.pump.tick()
        self.send.assert_not_called()
        self.streams.native_ready = True
        self.pump.tick()
        self.send.assert_called_once_with(2, cancel=True)
        self.assertFalse(self.pump.cancellations)

    def test_manual_input_wins_next_boundary_without_being_dropped_or_starved(self):
        self.pump.tick()
        self.assertTrue(self.pump.inflight)
        manual = Mock(side_effect=lambda: self.pump.start_manual(1))
        self.pump.queue_input(manual)
        self.streams.native_ready = True
        self.pump.command_boundary(self.pump.request_id)
        manual.assert_called_once()
        self.pump.tick()
        self.send.assert_called_once_with(0)
        self.assertTrue(self.pump.inflight)

    def test_old_command_packets_cannot_acknowledge_a_new_step(self):
        self.pump.tick()
        manual = Mock()
        self.pump.queue_input(manual)
        self.streams.native_ready = True
        self.pump.command_boundary()
        self.pump.command_boundary(self.pump.request_id - 1)
        self.pump.tick()
        manual.assert_not_called()
        self.send.assert_called_once_with(0)
        self.pump.command_boundary(self.pump.request_id)
        manual.assert_called_once()

    def test_exact_completion_restores_readiness_without_an_input_mode_packet(self):
        request = self.pump.start_manual(2)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(request)
        self.assertTrue(self.streams.native_ready)
        self.assertFalse(self.pump.inflight)
        self.assertIsNotNone(self.pump.start_manual(3))
        self.pump.command_boundary(request)
        self.assertFalse(self.streams.native_ready)
        self.assertEqual(self.pump.owner, 3)

    def test_local_noops_do_not_strand_later_buffered_input(self):
        request = self.pump.start_manual(0)
        ignored, movement, later = Mock(), Mock(), Mock()
        movement.side_effect = lambda: self.pump.start_manual(1)
        for callback in (ignored, movement, later):
            self.pump.queue_input(callback)
        self.pump.command_boundary(request)
        ignored.assert_called_once()
        movement.assert_called_once()
        later.assert_not_called()
        self.assertEqual(self.pump.owner, 1)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(self.pump.request_id)
        later.assert_called_once()

    def test_prompt_drains_only_its_owners_buffered_responses(self):
        request = self.pump.start_manual(1)
        peer, response, suffix = Mock(), Mock(), Mock()
        self.pump.queue_input(peer, 0)
        self.pump.queue_input(response, 1)
        self.pump.queue_input(suffix, 1)
        self.pump.prompt_boundary()
        response.assert_called_once()
        suffix.assert_called_once()
        peer.assert_not_called()
        self.assertEqual(self.pump.request_id, request)
        self.assertTrue(self.pump.inflight)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(request)
        peer.assert_called_once()

    def test_stale_completion_cannot_drain_idle_input_or_restore_readiness(self):
        request = self.pump.start_manual(0)
        self.pump.command_boundary(request)
        self.streams.native_ready = False
        callback = Mock()
        self.pump.queue_input(callback)
        self.pump.command_boundary(request - 1)
        callback.assert_not_called()
        self.assertFalse(self.streams.native_ready)

    def test_exact_completion_restores_readiness_without_an_input_mode_packet(self):
        request = self.pump.start_manual(2)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(request)
        self.assertTrue(self.streams.native_ready)
        self.assertFalse(self.pump.inflight)
        self.assertIsNotNone(self.pump.start_manual(3))
        self.pump.command_boundary(request)
        self.assertFalse(self.streams.native_ready)
        self.assertEqual(self.pump.owner, 3)

    def test_exact_completion_releases_personal_view_requests_without_input_mode(self):
        self.streams._request_pending = Mock()
        request = self.pump.start_manual(0)
        self.streams._request_pending.assert_not_called()
        self.pump.command_boundary(request - 1)
        self.streams._request_pending.assert_not_called()
        self.pump.command_boundary(request)
        self.streams._request_pending.assert_called_once()
        self.assertTrue(self.streams.native_ready)

    def test_local_noops_do_not_strand_later_buffered_input(self):
        request = self.pump.start_manual(0)
        ignored, movement, later = Mock(), Mock(), Mock()
        movement.side_effect = lambda: self.pump.start_manual(1)
        for callback in (ignored, movement, later):
            self.pump.queue_input(callback)
        self.pump.command_boundary(request)
        ignored.assert_called_once()
        movement.assert_called_once()
        later.assert_not_called()
        self.assertEqual(self.pump.owner, 1)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(self.pump.request_id)
        later.assert_called_once()

    def test_prompt_drains_only_its_owners_buffered_responses(self):
        request = self.pump.start_manual(1)
        peer, response, suffix = Mock(), Mock(), Mock()
        self.pump.queue_input(peer, 0)
        self.pump.queue_input(response, 1)
        self.pump.queue_input(suffix, 1)
        self.pump.prompt_boundary()
        response.assert_called_once()
        suffix.assert_called_once()
        peer.assert_not_called()
        self.assertEqual(self.pump.request_id, request)
        self.assertTrue(self.pump.inflight)
        self.assertFalse(self.streams.native_ready)
        self.pump.command_boundary(request)
        peer.assert_called_once()

    def test_stale_completion_cannot_drain_idle_input_or_restore_readiness(self):
        request = self.pump.start_manual(0)
        self.pump.command_boundary(request)
        self.streams.native_ready = False
        callback = Mock()
        self.pump.queue_input(callback)
        self.pump.command_boundary(request - 1)
        callback.assert_not_called()
        self.assertFalse(self.streams.native_ready)

    def test_buffered_manual_command_holds_automation_until_its_own_completion(self):
        request_id = self.pump.start_manual(2)
        self.assertIsNotNone(request_id)
        self.assertTrue(self.pump.manual)
        self.assertEqual(self.pump.owner, 2)
        self.streams.native_ready = True
        self.pump.tick()
        self.pump.command_boundary(request_id - 1)
        self.send.assert_not_called()
        self.assertIsNone(self.pump.start_manual(3))
        self.pump.command_boundary(request_id)
        self.pump.tick()
        self.send.assert_called_once_with(0)

    def test_long_work_rotates_with_peer_activity_at_native_boundaries(self):
        for slot, mode in enumerate(["assimilating", "working", "", ""]):
            self.control.views[slot]["members"][0]["activity"] = mode
        for _ in range(8):
            self.streams.native_ready = True
            self.pump.command_boundary(self.pump.request_id)
            self.pump.tick()
        self.assertEqual([call.args[0] for call in self.send.call_args_list],
                         [0, 1] * 4)

    def test_assimilation_yields_to_a_peers_manual_command(self):
        for slot in range(4):
            self.control.views[slot]["members"][0]["activity"] = (
                "assimilating" if slot == 0 else "")
        self.pump.tick()
        work_request = self.pump.request_id
        manual = Mock(side_effect=lambda: self.pump.start_manual(1))
        self.pump.queue_input(manual)
        self.streams.native_ready = True
        self.pump.command_boundary(work_request)
        manual.assert_called_once()
        self.assertEqual(self.pump.owner, 1)
        self.pump.tick()
        self.send.assert_called_once_with(0)
        self.pump.command_boundary(work_request)  # A stale acknowledgement.
        self.assertEqual(self.pump.owner, 1)
        self.streams.native_ready = True
        self.pump.command_boundary(self.pump.request_id)
        self.pump.tick()
        self.assertEqual([call.args[0] for call in self.send.call_args_list], [0, 0])
