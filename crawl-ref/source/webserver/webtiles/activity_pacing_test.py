"""Clock-driven contracts for cancellable native work and independent owners."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.activity_pump import ActivityPump


class NativeWorkPacingTest(unittest.TestCase):
    def make_pump(self, combat=False, activity="assimilating"):
        clock = [10.0]
        worker = dict(slot=0, activity=activity, alive=True, can_act=True,
                      turns=0, aut_clock=0, region_id=0, region_combat=combat)
        peer = dict(slot=1, activity="", alive=True, can_act=True,
                    turns=0, aut_clock=0, region_id=0, region_combat=combat)
        state = dict(members=[worker, peer])
        control = SimpleNamespace(multiplayer=True, state=state,
                                  views={0: state, 1: state})
        streams = SimpleNamespace(native_ready=True)
        send = Mock(return_value=True)
        pump = ActivityPump(control, streams, lambda: {0, 1}, send,
                            now=lambda: clock[0])
        pump.note_party_state(state)
        worker.update(turns=1, aut_clock=10)
        pump.note_party_state(state)
        return SimpleNamespace(pump=pump, clock=clock, worker=worker,
                               peer=peer, state=state, send=send, streams=streams)

    def test_real_owner_turn_preserves_safe_finite_work_deadline(self):
        run = self.make_pump()
        self.assertEqual(run.pump.cooldown_duration[0], 100)
        self.assertEqual(run.pump.cooldown_until[0], 10.25)
        self.assertFalse(run.pump.check_smart_fast_forward(0))
        self.assertEqual(run.pump.cooldown_until[0], 10.25)
        self.assertTrue(run.pump.should_buffer_action(0))
        run.pump.tick()
        run.send.assert_not_called()

    def test_finite_work_dispatches_at_deadline_with_one_native_request(self):
        run = self.make_pump()
        run.clock[0] = 10.099
        run.pump.tick()
        run.send.assert_not_called()
        run.clock[0] = 10.25
        run.pump.tick()
        run.send.assert_called_once_with(0)
        request = run.pump.request_id
        self.assertTrue(run.pump.inflight)
        self.assertFalse(run.streams.native_ready)
        self.assertEqual(run.pump.owner, 0)
        run.pump.tick()
        run.pump.command_boundary(request - 1)
        run.pump.tick()
        run.send.assert_called_once_with(0)
        self.assertTrue(run.pump.inflight)

    def test_combat_finite_work_paces_twenty_ms_per_aut(self):
        run = self.make_pump(combat=True)
        self.assertEqual(run.pump.cooldown_duration[0], 200)
        self.assertEqual(run.pump.cooldown_until[0], 10.5)
        run.clock[0] = 10.199
        run.pump.tick()
        run.send.assert_not_called()
        run.clock[0] = 10.5
        run.pump.tick()
        run.send.assert_called_once_with(0)

    def test_known_run_intents_fast_forward_but_unknown_native_work_is_paced(self):
        for mode in ("", "explore", "travel", "rest", "yield"):
            with self.subTest(mode=mode):
                run = self.make_pump(activity=mode)
                self.assertEqual(run.pump.cooldown_until[0], 0.0)
        for mode in ("assimilating", "working", "future_native_task"):
            with self.subTest(mode=mode):
                run = self.make_pump(activity=mode)
                self.assertEqual(run.pump.cooldown_until[0], 10.25)
                run.pump.tick()
                run.send.assert_not_called()

    def test_fair_scan_dispatches_another_ready_owner_during_work_cooldown(self):
        run = self.make_pump()
        run.peer["activity"] = "yield"
        run.pump.tick()
        run.send.assert_called_once_with(1)
        self.assertEqual(run.pump.previous, 1)
        self.assertEqual(run.pump.owner, 1)
        self.assertEqual(run.pump.cooldown_until[0], 10.25)

    def test_peer_manual_action_and_cancellation_do_not_wait_for_work_deadline(self):
        run = self.make_pump()
        manual = Mock(side_effect=lambda: run.pump.start_manual(1))
        run.pump.queue_action(1, "move", manual)
        run.pump.tick()
        manual.assert_called_once()
        run.send.assert_not_called()
        self.assertEqual(run.pump.owner, 1)
        self.assertEqual(run.pump.cooldown_until[0], 10.25)

        stopped = self.make_pump()
        stopped.pump.cancel(0)
        stopped.pump.tick()
        stopped.send.assert_called_once_with(0, cancel=True)
        self.assertEqual(stopped.clock[0], 10.0)
        self.assertFalse(stopped.pump.cancellations)
        self.assertTrue(stopped.pump.inflight)

    def test_all_ready_peer_fast_forward_does_not_erase_finite_work_deadline(self):
        run = self.make_pump(combat=True)
        run.peer["activity"] = "yield"
        run.pump.cooldown_until[1] = 10.5
        self.assertTrue(run.pump.check_smart_fast_forward(1))
        self.assertEqual(run.pump.cooldown_until[1], 0.0)
        self.assertEqual(run.pump.cooldown_until[0], 10.5)
        self.assertFalse(run.pump.check_smart_fast_forward(0))
        self.assertEqual(run.pump.cooldown_until[0], 10.5)


if __name__ == "__main__":
    unittest.main()
