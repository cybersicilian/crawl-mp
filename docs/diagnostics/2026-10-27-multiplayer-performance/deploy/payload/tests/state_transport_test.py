import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.state_transport import append_snapshot, changes, StateEncoder


class StateTransportTest(unittest.TestCase):
    def test_null_and_removal_are_distinct(self):
        self.assertEqual(changes({"a": 1, "b": 2}, {"b": None}), [[["a"]], [["b"], None]])

    def test_types_and_arrays(self):
        self.assertEqual(changes(True, 1), [[[], 1]])
        self.assertEqual(changes({"a": [True]}, {"a": [1]}), [[["a", 0], 1]])
        self.assertEqual(changes([1, 2], [1]), [[[], [1]]])
        self.assertEqual(changes([{"x": 1}], [{"x": 2}]), [[[0, "x"], 2]])

    def test_large_changes_use_full_frames(self):
        encoder = StateEncoder("example")
        encoder.frame({"msg": "example", "values": list(range(1000))})
        packet = json.loads(encoder.frame({"msg": "example", "values": list(range(1000, 2000))}))
        self.assertIn("state", packet)
        self.assertEqual(packet["revision"], 2)

    def test_legacy_clients_remain_full_and_suppress_identical_state(self):
        client = SimpleNamespace(append_message=Mock())
        identity = object()
        state = {"msg": "party_state", "members": [{"hp": 10}]}
        for _ in range(3):
            append_snapshot(client, identity, state, False)
        client.append_message.assert_called_once()
        self.assertEqual(json.loads(client.append_message.call_args.args[0]), state)

    def test_each_client_and_game_has_an_independent_baseline(self):
        clients = [SimpleNamespace(state_deltas=True, append_message=Mock()) for _ in range(2)]
        identity = object()
        state = {"msg": "party_state", "members": [{"hp": 10}]}
        for slot, client in enumerate(clients):
            append_snapshot(client, identity, dict(state, controlled_slot=slot), True)
        append_snapshot(clients[0], identity, dict(state, controlled_slot=1), True)
        packet = json.loads(clients[0].append_message.call_args.args[0])
        self.assertEqual(packet["changes"], [[["controlled_slot"], 1]])
        self.assertEqual(clients[1].state_encoder.revision, 1)
        append_snapshot(clients[0], object(), state, True)
        self.assertIn("state", json.loads(clients[0].append_message.call_args.args[0]))
        clients[0].last_party_snapshot = None
        append_snapshot(clients[0], identity, state, True)
        self.assertEqual(json.loads(clients[0].append_message.call_args.args[0])["revision"], 1)
