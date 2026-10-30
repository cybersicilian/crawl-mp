"""Queued gameplay is fair per actor and invalidated by incapacitation."""
import json
import unittest
from unittest.mock import Mock

from webtiles import input_lifecycle_test as lifecycle
from webtiles.process_handler import CrawlProcessHandlerBase


class ActivityQueueTests(unittest.TestCase):
    def setUp(self):
        self.fixture = lifecycle.InputLifecycleTest()
        self.fixture.setUp()

    def state(self, target, alive=True, ghost=False):
        f = self.fixture
        members = [dict(slot=slot, place="D:1", alive=alive if slot == target else True,
                        ghost_haunting=ghost if slot == target else False) for slot in range(3)]
        CrawlProcessHandlerBase.handle_process_message(f.game, json.dumps(dict(
            msg="party_packet", slot=target, floor="D:1", view=True,
            payload=dict(msg="party_state", members=members))), True)

    def test_bursts_alternate_waiting_actors_and_preserve_their_key_order(self):
        f = self.fixture
        f.key(0)
        for key in "jkl":
            f.key(1, ord(key))
        for key in "mn":
            f.key(2, ord(key))
        while f.pump.inflight:
            f.complete()
        self.assertEqual([packet["player_id"] for packet in f.packets()], [0, 1, 2, 1, 2, 1])
        self.assertEqual([packet["keycode"] for packet in f.packets() if packet["player_id"] == 1], list(map(ord, "jkl")))
        self.assertEqual([packet["keycode"] for packet in f.packets() if packet["player_id"] == 2], list(map(ord, "mn")))

    def test_waiting_keys_are_visible_immediately_and_clear_without_native_completion(self):
        f = self.fixture
        f.key(0)
        f.key(1)
        f.key(1)
        own = f.control.snapshot(f.clients[1])["members"][0]
        self.assertEqual(own.get("queued_action"), "input")
        self.assertEqual(own.get("queued_action_count"), 2)
        frames = [json.loads(call.args[0]) for call in f.clients[1].append_message.call_args_list]
        self.assertTrue(any(frame["members"][0].get("queued_action_count") == 2 for frame in frames))
        f.game.handle_input(json.dumps(dict(msg="party_activity", action="cancel")), f.clients[1])
        self.assertIsNone(f.control.snapshot(f.clients[1])["members"][0].get("queued_action"))
        self.assertEqual(f.pump.owner, 0)
        self.assertTrue(f.pump.inflight)

    def test_raw_and_scheduled_actions_share_a_count_but_saves_and_inspection_do_not(self):
        f = self.fixture
        f.key(1)
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.game.handle_input(json.dumps(dict(msg="inv_item_describe", slot=0)), f.clients[0])
        f.pump.queue_action(0, "move", Mock())
        f.pump.queue_action(0, "wait", Mock())
        own = f.control.snapshot(f.clients[0])["members"][0]
        self.assertEqual(own.get("queued_action"), "move")
        self.assertEqual(own.get("queued_action_count"), 3)
        f.pump.clear_queued_action(0)
        self.assertEqual(own.get("queued_action_count"), 3)  # A prior snapshot is immutable.
        self.assertEqual(f.control.snapshot(f.clients[0])["members"][0].get("queued_action_count"), 1)
        f.pump.clear_queued_input(0, requires_alive_only=True)
        self.assertEqual(f.control.snapshot(f.clients[0])["members"][0].get("queued_action_count"), 0)
        self.assertEqual(len(f.pump.inputs), 2)

    def test_dequeue_replaces_waiting_status_before_a_prompt_response_is_dispatched(self):
        f = self.fixture
        f.key(1, ord("i"))
        f.key(1, ord("a"))
        self.assertEqual(f.control.snapshot(f.clients[1])["members"][0].get("queued_action_count"), 1)
        f.pump.prompt_boundary()
        self.assertIsNone(f.control.snapshot(f.clients[1])["members"][0].get("queued_action"))
        self.assertEqual(f.pump.owner, 1)

    def test_prompt_responses_keep_the_original_owner_until_completion(self):
        f = self.fixture
        f.key(1, ord("i"))
        request = f.pump.request_id
        f.key(2)
        f.key(1, ord("a"))
        f.pump.prompt_boundary()
        self.assertEqual([packet["player_id"] for packet in f.packets()], [1, 1])
        self.assertEqual(f.packets()[-1]["prompt_activity_id"], request)
        self.assertEqual(f.pump.owner, 1)
        f.complete()
        self.assertEqual(f.pump.owner, 2)

    def test_downing_and_revival_discard_both_gameplay_queues_without_unlocking(self):
        for alive, ghost in ((False, False), (True, True)):
            with self.subTest(alive=alive, ghost=ghost):
                self.setUp()
                f = self.fixture
                f.key(0)
                request = f.pump.request_id
                f.key(1)
                f.key(2)
                action = Mock()
                f.pump.queue_action(1, "future", action)
                self.state(1, alive, ghost)
                self.assertEqual(f.pump.owner, 0)
                self.assertEqual(f.pump.request_id, request)
                self.assertTrue(f.pump.inflight)
                self.state(1)
                f.complete()
                self.assertEqual([packet["player_id"] for packet in f.packets()], [0, 2])
                self.assertNotIn(1, f.pump.queued_action)
                action.assert_not_called()

    def test_downed_player_cannot_queue_new_gameplay_behind_another_actor(self):
        f = self.fixture
        self.state(1, ghost=True)
        f.key(0)
        f.key(1)
        self.assertFalse(f.pump.inputs)
        f.clients[1].send_message.assert_called_once_with("game_action_error",
            message="Your hero is downed. Choose an action after revival.")
        self.state(1)
        f.complete()
        self.assertEqual(len(f.packets()), 1)

    def test_downed_host_can_still_queue_a_save(self):
        f = self.fixture
        f.key(2)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.key(0)
        self.state(0, ghost=True)
        self.assertEqual(len(f.pump.inputs), 1)
        f.complete()
        self.assertEqual([packet["msg"] for packet in f.packets()], ["key", "record_save"])
        self.assertEqual(f.packets()[-1]["player_id"], 0)
        self.assertFalse(f.pump.inflight)

    def test_waiting_save_survives_a_host_floor_change(self):
        f = self.fixture
        f.key(2)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.control.views[0]["floor"] = "D:2"
        f.complete()
        self.assertEqual([packet["msg"] for packet in f.packets()], ["key", "record_save"])
        self.assertNotIn("input_floor", f.packets()[-1])

    def test_inventory_inspection_survives_incapacitation(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="inv_item_describe", slot=0)), f.clients[1])
        self.state(1, ghost=True)
        f.complete()
        self.assertEqual(f.packets()[-1]["msg"], "inv_item_describe")
        self.assertEqual(f.packets()[-1]["player_id"], 1)

    def test_clear_queue_retains_a_waiting_save(self):
        f = self.fixture
        f.key(1)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.key(0)
        f.pump.cancel(0)
        self.assertEqual(len(f.pump.inputs), 1)
        f.complete()
        self.assertEqual([packet["msg"] for packet in f.packets()], ["key", "record_save"])

    def test_escape_clears_future_gameplay_and_retains_a_waiting_save(self):
        f = self.fixture
        f.key(1)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.key(0)
        f.key(0, 27)
        self.assertEqual(len(f.pump.inputs), 1)
        f.complete()
        self.assertEqual([packet["msg"] for packet in f.packets()], ["key", "record_save"])

    def test_escape_while_only_a_save_waits_does_not_become_a_later_game_key(self):
        f = self.fixture
        f.key(1)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.key(0, 27)
        self.assertEqual(len(f.pump.inputs), 1)
        f.complete()
        self.assertEqual([packet["msg"] for packet in f.packets()], ["key", "record_save"])

    def test_save_rejection_for_another_heros_prompt_uses_save_result(self):
        f = self.fixture
        f.key(1, ord("i"))
        f.pump.prompt_boundary()
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.clients[0].send_message.assert_called_once_with("record_save_result", ok=False,
            error="Another hero is finishing an action. Your view is unchanged.")
        self.assertFalse(f.pump.inputs)
        self.assertEqual(f.pump.owner, 1)

    def test_save_rejection_for_a_full_queue_uses_save_result(self):
        f = self.fixture
        f.key(1)
        for _ in range(32):
            f.key(0)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.clients[0].send_message.assert_called_once_with("record_save_result", ok=False,
            error="Input queue is full (32 commands). Escape clears it.")
        self.assertEqual(len(f.pump.inputs), 32)

    def test_save_before_native_connection_is_ready_gets_a_result(self):
        f = self.fixture
        f.game.conn.open = False
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        f.clients[0].send_message.assert_called_once_with("record_save_result", ok=False,
            error="The expedition is still connecting. Try saving after it finishes loading.")
        self.assertFalse(f.packets())

    def test_guest_cannot_queue_or_send_an_owner_save(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[1])
        f.clients[1].send_message.assert_called_once_with("record_save_result", ok=False,
            error="Only the expedition owner can save this game.")
        self.assertFalse(f.pump.inputs)

    def test_own_prompt_save_remains_a_native_decision(self):
        f = self.fixture
        f.key(0, ord("i"))
        request = f.pump.request_id
        f.pump.prompt_boundary()
        f.game.handle_input(json.dumps(dict(msg="record_save", exit=False)), f.clients[0])
        self.assertEqual(f.packets()[-1]["msg"], "record_save")
        self.assertEqual(f.packets()[-1]["prompt_activity_id"], request)
        f.clients[0].send_message.assert_not_called()

    def test_disconnected_round_robin_candidate_does_not_delay_the_next_actor(self):
        f = self.fixture
        f.key(0)
        f.key(1)
        f.key(2)
        f.game._receivers.remove(f.clients[1])
        f.complete()
        self.assertEqual([packet["player_id"] for packet in f.packets()], [0, 2])

    def test_a_busy_input_batch_keeps_its_suffix_before_newer_keys(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="input", data=[ord("j")], text="k")), f.clients[1])
        f.key(1, ord("l"))
        self.assertEqual(f.control.snapshot(f.clients[1])["members"][0].get("queued_action_count"), 3)
        while f.pump.inflight:
            f.complete()
        self.assertEqual([packet["keycode"] for packet in f.packets() if packet["player_id"] == 1],
                         list(map(ord, "jkl")))

    def test_busy_batch_capacity_counts_keys_and_rejects_overflow_once(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="input", text="." * 32)), f.clients[1])
        f.game.handle_input(json.dumps(dict(msg="input", text="." * 2)), f.clients[1])
        self.assertEqual(len(f.pump.inputs), 32)
        f.clients[1].send_message.assert_called_once_with("game_action_error",
            message="Input queue is full (32 commands). Escape clears it.")

    def test_empty_busy_batch_does_not_create_a_phantom_queued_command(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="input", text="")), f.clients[1])
        self.assertFalse(f.pump.inputs)

    def test_escape_in_a_full_batch_still_clears_before_the_next_key(self):
        f = self.fixture
        f.key(0)
        f.game.handle_input(json.dumps(dict(msg="input", text="." * 32)), f.clients[1])
        f.game.handle_input(json.dumps(dict(msg="input", data=[27], text="j")), f.clients[1])
        self.assertEqual(len(f.pump.inputs), 1)
        while f.pump.inflight:
            f.complete()
        self.assertEqual([packet["keycode"] for packet in f.packets() if packet["player_id"] == 1], [ord("j")])
