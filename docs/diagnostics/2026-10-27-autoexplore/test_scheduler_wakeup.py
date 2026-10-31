"""Targeted regression against either the production or local server contract."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles.activity_pump import ActivityPump
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.process_handler import CrawlProcessHandlerBase
from webtiles.tile_presence import TilePresence


class SchedulerWakeupTest(unittest.TestCase):
    def setUp(self):
        self.clients = [SimpleNamespace(username=name, id=slot,
            append_message=Mock(), send_message=Mock()) for slot, name in enumerate(('Host', 'Peer'))]
        control = PartyControl('Host', {'Host': 0, 'Peer': 1})
        control.views = {slot: dict(floor='D:1', members=[dict(
            slot=slot, alive=True, activity='explore', can_act=True)]) for slot in range(2)}
        streams = PlayerStreams(control, TilePresence())
        streams.native_ready = True
        self.pump = ActivityPump(control, streams, lambda: {0, 1}, Mock(return_value=True))
        self.game = SimpleNamespace(party_control=control, player_streams=streams,
            activity_pump=self.pump, _receivers=self.clients, ai_party=None)

    def complete(self, token, view=False):
        CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
            msg='party_packet', slot=0, floor='D:1', view=view,
            payload=dict(msg='party_activity_ready', activity_id=token))), True)

    def test_exact_completion_wakes_next_owner_without_another_timer_tick(self):
        self.pump.tick()
        with patch('webtiles.process_handler.IOLoop.current') as current:
            self.complete(self.pump.request_id)
            current.return_value.add_callback.assert_called_once_with(self.pump.tick)
            self.assertEqual(self.pump.send.call_count, 1, 'No recursive native dispatch')
            current.return_value.add_callback.call_args.args[0]()
            self.pump.send.assert_called_with(1)
            self.assertEqual(self.pump.owner, 1)
            self.pump.tick()
            self.assertEqual(self.pump.send.call_count, 2, 'One native action in flight')

    def test_queued_stop_precedes_the_next_automatic_step(self):
        self.pump.tick()
        with patch('webtiles.process_handler.IOLoop.current') as current:
            self.complete(self.pump.request_id)
            self.pump.cancel(1)
            current.return_value.add_callback.call_args.args[0]()
            self.pump.send.assert_called_with(1, cancel=True)

    def test_projected_stale_and_invalid_completions_never_wake_or_unlock(self):
        request = self.pump.start_manual(0)
        with patch('webtiles.process_handler.IOLoop.current') as current:
            for token, view in ((request, True), (request - 1, False),
                                (True, False), ('1', False), (1.0, False)):
                self.complete(token, view)
                self.assertEqual(self.pump.owner, 0)
                self.assertTrue(self.pump.inflight)
            current.return_value.add_callback.assert_not_called()

    def test_no_remaining_activity_does_not_start_more_native_work(self):
        self.pump.tick()
        with patch('webtiles.process_handler.IOLoop.current') as current:
            self.complete(self.pump.request_id)
            for view in self.pump.control.views.values():
                view['members'][0]['activity'] = ''
            current.return_value.add_callback.call_args.args[0]()
            self.assertEqual(self.pump.send.call_count, 1)

    def test_duplicate_and_untracked_completions_do_not_unlock_an_idle_engine(self):
        request = self.pump.start_manual(0)
        self.pump.command_boundary(request)
        self.pump.streams.native_ready = False
        with patch('webtiles.process_handler.IOLoop.current') as current:
            self.complete(request)
            self.complete(None)
            self.assertFalse(self.pump.streams.native_ready)
            current.return_value.add_callback.assert_not_called()


if __name__ == '__main__':
    unittest.main()
