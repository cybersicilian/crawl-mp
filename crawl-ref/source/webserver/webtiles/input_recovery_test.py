"""Recovery uses exact native evidence and never timeout-based unlocks."""
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles.activity_pump import ActivityPump


class InputRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.clock = 0.0
        self.streams = SimpleNamespace(native_ready=True)
        self.probe, self.restore, self.events = Mock(), Mock(), []
        self.pump = ActivityPump(SimpleNamespace(multiplayer=True, views={}), self.streams,
                                 lambda: {0, 1, 2}, Mock(), now=lambda: self.clock,
                                 probe=self.probe, restore_prompt=self.restore, diagnostic=self.events.append)
        self.request = self.pump.start_manual(0)

    def test_probe_is_delayed_and_rate_limited_without_replaying_commands(self):
        self.clock = 4.9
        self.pump.tick()
        self.probe.assert_not_called()
        self.clock = 5.0
        self.pump.tick()
        self.pump.tick()
        self.probe.assert_called_once_with(self.request)
        self.assertTrue(self.pump.inflight)
        self.assertFalse(self.streams.native_ready)
        self.pump.send.assert_not_called()
        self.clock = 10.0
        self.pump.tick()
        self.assertEqual(self.probe.call_count, 2)
        self.assertEqual(len(self.events), 1, 'An unanswered probe does not spam logs')

    def test_unanswered_probes_warn_once_and_never_release_the_engine(self):
        for instant in (5, 10, 15, 20, 25):
            self.clock = instant
            self.pump.tick()
        self.assertEqual([event['event'] for event in self.events],
                         ['awaiting_native_status', 'native_unresponsive'])
        self.assertEqual(self.probe.call_count, 5)
        self.assertTrue(self.pump.inflight)
        self.assertFalse(self.streams.native_ready)
        self.pump.recover(dict(activity_id=self.request, state='busy', owner=0))
        self.assertEqual(self.pump.unanswered_probes, 0)

    def test_matching_completion_heals_a_lost_ack_and_dispatches_peer_once(self):
        peer = Mock(side_effect=lambda: self.pump.start_manual(1))
        self.pump.queue_input(peer, 1)
        self.pump.recover(dict(activity_id=self.request, state="complete", owner=0))
        peer.assert_called_once()
        self.assertEqual(self.pump.owner, 1)
        self.assertEqual(self.pump.recovery_counts['completed'], 1)
        self.pump.recover(dict(activity_id=self.request, state="complete", owner=0))
        peer.assert_called_once()
        self.assertEqual(self.pump.owner, 1)

    def test_busy_unknown_and_invalid_status_never_unlock_or_replay(self):
        callback = Mock()
        self.pump.queue_input(callback, 1)
        for state in ('busy', 'unknown', 'garbage', None):
            self.clock += 50
            self.pump.recover(dict(activity_id=self.request, state=state, owner=0))
            self.pump.tick()
            self.assertTrue(self.pump.inflight)
            self.assertEqual(self.pump.owner, 0)
            self.assertFalse(self.streams.native_ready)
        callback.assert_not_called()
        self.assertEqual(self.pump.recovery_counts['unresolved'], 1)

    def test_old_future_and_boolean_tokens_cannot_release_current_owner(self):
        for token in (0, self.request + 1, True, None, str(self.request)):
            self.pump.recover(dict(activity_id=token, state='complete', owner=0))
            self.assertTrue(self.pump.inflight)
        self.pump.recover(dict(activity_id=self.request, state='complete'))
        self.assertFalse(self.pump.inflight)

    def test_native_prompt_repairs_owner_and_delivers_only_its_buffered_reply(self):
        peer, reply = Mock(), Mock()
        self.pump.queue_input(peer, 0)
        self.pump.queue_input(reply, 2)
        self.pump.recover(dict(activity_id=self.request, state='prompt', owner=2))
        self.assertEqual(self.pump.owner, 2)
        self.assertTrue(self.pump.inflight)
        self.assertTrue(self.pump.prompt)
        self.assertFalse(self.streams.native_ready)
        reply.assert_called_once()
        peer.assert_not_called()
        self.restore.assert_called_once()
        self.pump.recover(dict(activity_id=self.request, state='prompt', owner=2))
        self.restore.assert_called_once()

    def test_malformed_prompt_owner_cannot_change_ownership(self):
        for owner in (None, -1, 4, True, '2'):
            self.pump.recover(dict(activity_id=self.request, state='prompt', owner=owner))
            self.assertEqual(self.pump.owner, 0)
            self.assertFalse(self.pump.prompt)
        self.restore.assert_not_called()

    def test_starting_a_new_command_restarts_its_probe_deadline(self):
        self.clock = 20
        self.pump.recover(dict(activity_id=self.request, state='complete'))
        self.pump.start_manual(2)
        self.pump.tick()
        self.probe.assert_not_called()
        self.clock = 25
        self.pump.tick()
        self.probe.assert_called_once_with(self.request + 1)

    def test_stale_native_status_cannot_reopen_an_idle_prompt(self):
        self.pump.command_boundary(self.request)
        self.pump.recover(dict(activity_id=self.request, state='prompt', owner=2))
        self.assertFalse(self.pump.inflight)
        self.assertIsNone(self.pump.owner)
        self.restore.assert_not_called()


class DisconnectedPromptRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.clock = 0.0
        self.connected = {0}
        self.cancel = Mock(return_value=True)
        self.streams = SimpleNamespace(native_ready=True)
        self.pump = ActivityPump(SimpleNamespace(multiplayer=True, views={}), self.streams,
            lambda: self.connected, Mock(), now=lambda: self.clock, probe=Mock(),
            cancel_prompt=self.cancel, prompt_grace=3)
        self.request = self.pump.start_manual(1)
        self.pump.prompt_boundary()
        self.pump.tick()

    def status(self, **fields):
        self.pump.recover(dict(activity_id=self.request, state="prompt", owner=1,
                               input_mode=7, **fields))

    def test_grace_and_fresh_native_evidence_cancel_without_unlocking(self):
        peer = Mock()
        self.pump.queue_input(peer, 0)
        self.clock = 2.99
        self.status()
        self.cancel.assert_not_called()
        self.clock = 3
        self.status()
        self.cancel.assert_called_once_with(1, self.request, 7)
        self.assertTrue(self.pump.inflight)
        self.assertFalse(self.streams.native_ready)
        peer.assert_not_called()
        self.pump.recover(dict(activity_id=self.request, state="complete", owner=1))
        peer.assert_called_once()

    def test_timeouts_busy_unknown_and_stale_status_never_cancel(self):
        for instant in (5, 10, 20):
            self.clock = instant
            self.pump.tick()
        for state in ("busy", "unknown"):
            self.pump.recover(dict(activity_id=self.request, state=state, owner=1))
        for token in (0, True, self.request + 1):
            self.pump.recover(dict(activity_id=token, state="prompt", owner=1, input_mode=7))
        self.cancel.assert_not_called()
        self.assertTrue(self.pump.inflight)

    def test_reconnect_or_another_tab_preserves_prompt_and_restarts_grace(self):
        self.clock = 2
        self.connected.add(1)
        self.pump.tick()
        self.clock = 10
        self.status()
        self.cancel.assert_not_called()
        self.connected.remove(1)
        self.pump.tick()
        self.clock = 12.9
        self.status()
        self.cancel.assert_not_called()
        self.clock = 13
        self.status()
        self.cancel.assert_called_once_with(1, self.request, 7)

    def test_native_owner_change_starts_its_own_absence_period(self):
        self.clock = 5
        self.pump.recover(dict(activity_id=self.request, state="prompt", owner=0, input_mode=1))
        self.connected.clear()
        self.pump.tick()
        self.clock = 7.9
        self.pump.recover(dict(activity_id=self.request, state="prompt", owner=0, input_mode=1))
        self.cancel.assert_not_called()
        self.clock = 8
        self.pump.recover(dict(activity_id=self.request, state="prompt", owner=0, input_mode=1))
        self.cancel.assert_called_once_with(0, self.request, 1)

    def test_nested_prompt_retries_are_rate_limited_and_keep_the_same_token(self):
        self.clock = 3
        self.status()
        self.clock = 3.1
        self.status()
        self.cancel.assert_called_once()
        self.clock = 8
        self.status()
        self.assertEqual(self.cancel.call_count, 2)
        self.assertEqual(self.cancel.call_args.args, (1, self.request, 7))
        self.assertEqual(self.pump.recovery_counts["abandoned_prompts"], 2)
        self.assertTrue(self.pump.inflight)


if __name__ == '__main__':
    unittest.main()
