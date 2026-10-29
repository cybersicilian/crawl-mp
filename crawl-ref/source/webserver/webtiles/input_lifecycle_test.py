"""Adversarial multiplayer lifecycle checks with real router and pump state."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles.activity_pump import ActivityPump
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.tile_presence import TilePresence


class InputLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.clients = [SimpleNamespace(username=name, id=slot, send_message=Mock(),
                                       append_message=Mock())
                        for slot, name in enumerate(("Host", "Peer", "Third"))]
        self.control = PartyControl("Host", {c.username: i for i, c in enumerate(self.clients)})
        self.streams = PlayerStreams(self.control, TilePresence())
        self.streams.native_ready = True
        self.control.views = {slot: dict(floor="D:1", members=[dict(slot=slot, alive=True)])
                              for slot in range(3)}
        self.pump = ActivityPump(self.control, self.streams, lambda: {0, 1, 2}, Mock())
        self.game = SimpleNamespace(username="Host", party_mode=True, party_control=self.control,
                                    player_streams=self.streams, activity_pump=self.pump,
                                    _receivers=list(self.clients), conn=Mock(open=True), process=True)
        self.game.handle_input = lambda msg, source, **bindings: CrawlProcessHandler.handle_input(self.game, msg, source, **bindings)

    def key(self, owner, keycode=46, **fields):
        self.game.handle_input(json.dumps(dict(msg="key", keycode=keycode, **fields)), self.clients[owner])

    def complete(self):
        self.pump.command_boundary(self.pump.request_id)

    def packets(self):
        return [json.loads(call.args[0]) for call in self.game.conn.send_message.call_args_list]

    def test_disconnected_input_is_discarded_while_connected_peer_progresses(self):
        self.key(0)
        self.key(1)
        self.key(2)
        self.game._receivers.remove(self.clients[1])
        self.complete()
        self.assertEqual([p["player_id"] for p in self.packets()], [0, 2])
        self.assertEqual(self.pump.owner, 2)

    def test_old_connection_cannot_replay_input_after_same_account_reconnects(self):
        self.key(0)
        self.key(1, ord("i"))
        old = self.clients[1]
        self.game._receivers.remove(old)
        self.clients[1] = SimpleNamespace(username="Peer", id=99, send_message=Mock(), append_message=Mock())
        self.game._receivers.append(self.clients[1])
        self.complete()
        self.assertEqual(len(self.packets()), 1)
        self.key(1)
        self.assertEqual(self.pump.owner, 1)

    def test_floor_change_discards_old_input_and_does_not_strand_later_peer(self):
        self.key(0)
        self.key(1, ord(">"))
        self.key(2)
        self.control.views[1]["floor"] = "D:2"
        self.complete()
        self.assertEqual([p["player_id"] for p in self.packets()], [0, 2])

    def test_changed_reservation_cannot_replay_deferred_input_as_another_hero(self):
        self.key(0)
        self.key(1)
        self.control.members["Peer"] = 2
        self.complete()
        self.assertEqual(len(self.packets()), 1)
        self.assertFalse(self.pump.inflight)

    def test_each_owner_has_a_bounded_input_queue_without_starving_peers(self):
        self.key(0)
        for _ in range(33):
            self.key(1)
        self.key(2)
        self.assertEqual(len(self.pump.inputs), 33)
        self.clients[1].send_message.assert_called_once_with("game_action_error",
            message="Input queue is full (32 commands). Escape clears it.")
        self.key(1, 27)
        self.complete()
        self.assertEqual([p["player_id"] for p in self.packets()], [0, 2])

    def test_escape_clears_hidden_and_visible_queues_before_a_peer_completes(self):
        self.key(0)
        self.key(1)
        queued = Mock()
        self.pump.queue_action(1, "wait", queued)
        self.key(1, 27)
        self.assertFalse(self.pump.inputs)
        self.assertNotIn(1, self.pump.queued_action)
        self.complete()
        self.assertFalse(self.pump.inflight)
        self.assertEqual(len(self.packets()), 1)
        queued.assert_not_called()

    def test_stop_discards_buffered_keys_without_releasing_an_owned_prompt(self):
        request = self.pump.start_manual(0)
        self.key(1)
        self.pump.prompt_boundary()
        self.game.handle_input(json.dumps(dict(msg="party_activity", action="cancel")), self.clients[1])
        self.assertFalse(self.pump.inputs)
        self.assertEqual(self.pump.owner, 0)
        self.assertEqual(self.pump.request_id, request)
        self.assertTrue(self.pump.inflight)
        self.assertEqual(self.pump.cancellations, {1})

    def test_prompt_owner_can_escape_while_clearing_future_actions(self):
        request = self.pump.start_manual(0)
        self.pump.prompt_boundary()
        self.pump.queue_action(0, "future action", Mock())
        self.key(0, 27)
        self.assertNotIn(0, self.pump.queued_action)
        self.assertEqual(self.packets()[0]["prompt_activity_id"], request)
        self.assertEqual(self.packets()[0]["keycode"], 27)
        self.assertEqual(self.pump.owner, 0)

    def test_unclaimed_spectators_cannot_fill_the_busy_queue(self):
        self.key(0)
        watcher = SimpleNamespace(username="Watcher", send_message=Mock())
        self.game.handle_input(json.dumps(dict(msg="key", keycode=46)), watcher)
        self.assertFalse(self.pump.inputs)
        watcher.send_message.assert_called_once()

    def test_forged_browser_tokens_are_replaced_and_cannot_complete_a_command(self):
        self.key(0, activity_id=900, prompt_activity_id=800)
        self.assertEqual(self.packets()[0]["activity_id"], 1)
        self.assertNotIn("prompt_activity_id", self.packets()[0])
        self.pump.command_boundary(900)
        self.assertEqual(self.pump.owner, 0)
        self.assertTrue(self.pump.inflight)

    def test_personal_command_snapshot_does_not_release_or_answer_real_prompt(self):
        request = self.pump.start_manual(0)
        self.pump.prompt_boundary()
        CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
            msg="party_packet", slot=2, floor="D:1", view=True,
            payload=dict(msg="input_mode", mode=1, activity_id=request))), True)
        self.assertEqual(self.pump.owner, 0)
        self.assertTrue(self.pump.prompt)
        self.assertFalse(self.streams.native_ready)

    def test_projected_or_noninteger_completions_cannot_release_the_current_owner(self):
        request = self.pump.start_manual(0)
        for kind in ("party_activity_ready", "party_activity_status"):
            CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
                msg="party_packet", slot=0, floor="D:1", view=True,
                payload=dict(msg=kind, activity_id=request, state="complete"))), True)
            self.assertTrue(self.pump.inflight)
        for token in (True, 1.0, "1"):
            self.pump.command_boundary(token)
            self.assertTrue(self.pump.inflight)

    def test_completion_wakes_automation_without_waiting_for_the_periodic_poll(self):
        for slot, view in self.control.views.items():
            view["members"][0].update(activity="explore", can_act=True)
        self.pump.tick()
        first = self.pump.request_id
        self.assertEqual(self.pump.owner, 0)
        with patch("webtiles.process_handler.IOLoop.current") as current:
            CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
                msg="party_packet", slot=0, floor="D:1",
                payload=dict(msg="party_activity_ready", activity_id=first))), True)
            current.return_value.add_callback.assert_called_once_with(self.pump.tick)
            self.assertEqual(self.pump.send.call_count, 1, "Never recurse inside native output")
            # A stop arriving before the callback has priority over another step.
            self.pump.cancel(1)
            callback = current.return_value.add_callback.call_args.args[0]
            callback()
            self.pump.send.assert_called_with(1, cancel=True)
            self.assertEqual(self.pump.owner, 1)
            callback()
            self.assertEqual(self.pump.send.call_count, 2, "Only one command may be in flight")

    def test_invalid_or_projected_completion_does_not_schedule_automation(self):
        request = self.pump.start_manual(0)
        with patch("webtiles.process_handler.IOLoop.current") as current:
            for token, view in ((request, True), (request + 1, False), (True, False)):
                CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
                    msg="party_packet", slot=0, floor="D:1", view=view,
                    payload=dict(msg="party_activity_ready", activity_id=token))), True)
            current.return_value.add_callback.assert_not_called()
            self.assertEqual(self.pump.owner, 0)

    def test_browser_cannot_forge_recovery_queries_or_status(self):
        self.key(0)
        for kind in ("party_activity_probe", "party_activity_status"):
            self.game.handle_input(json.dumps(dict(msg=kind, activity_id=1, state="complete")), self.clients[0])
        self.assertEqual(len(self.packets()), 1)
        self.assertTrue(self.pump.inflight)

    def test_oversized_and_malformed_input_never_enters_native_or_busy_queue(self):
        for message in (dict(msg='input', text='.' * 33), dict(msg='input', data=[-1]),
                        dict(msg='input', data=[1114112]), dict(msg='input', data=[True]),
                        dict(msg='input', text=[]), dict(msg='input', data='bad'),
                        dict(msg='key', keycode='46'), dict(msg='key', keycode=True),
                        dict(msg='key', keycode=2**40)):
            with self.subTest(message=message):
                self.game.handle_input(json.dumps(message), self.clients[0])
                self.assertFalse(self.packets())
                self.assertFalse(self.pump.inflight)
        self.key(0)
        self.game.handle_input(json.dumps(dict(msg='input', text='.' * 1000)), self.clients[1])
        self.assertFalse(self.pump.inputs)
        self.assertEqual(len(self.packets()), 1)

    def test_deferred_input_carries_server_floor_and_browser_cannot_forge_it(self):
        self.key(0, input_floor="D:99")
        self.assertNotIn("input_floor", self.packets()[0])
        self.key(1, input_floor="D:99")
        self.complete()
        self.assertEqual(self.packets()[1]["input_floor"], "D:1")

    def test_all_native_prompt_shapes_retain_automation_ownership(self):
        for payload in (dict(msg="menu"), dict(msg="ui-push"), dict(msg="init_input"),
                        dict(msg="input_mode", mode=8)):
            with self.subTest(payload=payload):
                self.pump.command_boundary(self.pump.request_id)
                request = self.pump.start_manual(1)
                self.pump.manual = False
                CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(dict(
                    msg="party_packet", slot=1, floor="D:1", view=False, payload=payload)), True)
                self.assertEqual(self.pump.owner, 1)
                self.assertEqual(self.pump.request_id, request)
                self.assertTrue(self.pump.inflight)
                self.assertTrue(self.pump.prompt)


if __name__ == "__main__":
    unittest.main()
