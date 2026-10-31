"""Observable no-op suppression, complete reconnects, and recipient isolation."""
import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.tile_presence import TilePresence


class StreamPerformanceTest(unittest.TestCase):
    def setUp(self):
        self.control = PartyControl("Host", {"Host": 0, "Guest": 1})
        self.streams = PlayerStreams(self.control, TilePresence())
        self.host, self.guest = self.client("Host"), self.client("Guest")
        self.clients = [self.host, self.guest]

    @staticmethod
    def client(name):
        return SimpleNamespace(username=name, id=name, append_message=Mock(), send_message=Mock())

    def ingest(self, payload, slot=0, floor="D:1"):
        self.streams.ingest(dict(slot=slot, floor=floor, view=True, payload=payload), self.clients, False)

    @staticmethod
    def packets(client):
        return [json.loads(call.args[0]) for call in client.append_message.call_args_list]

    def test_idle_map_sequences_do_not_repaint_and_reconnect_stays_complete(self):
        initial = dict(msg="map", clear=True, view_seq=1, cells=[dict(x=2, y=3, reset=True, f=1)],
                       vgrdc=dict(x=2, y=3), player_on_level=True, invis_mon_desc="unseen")
        self.ingest(initial)
        self.host.append_message.reset_mock()
        for sequence in range(2, 12):
            self.ingest(dict(initial, clear=False, view_seq=sequence, cells=[],
                             view_work=dict(los=250, cells=300, sent=0)))
        self.host.append_message.assert_not_called()
        reconnect = self.client("Host")
        self.streams.restore(reconnect)
        restored = self.packets(reconnect)[0]
        self.assertEqual(restored["view_seq"], 11)
        self.assertTrue(restored["clear"])
        self.assertEqual(restored["cells"], initial["cells"])
        self.assertEqual(restored["vgrdc"], initial["vgrdc"])
        self.guest.append_message.assert_not_called()

    def test_empty_maps_still_send_camera_floor_visibility_and_bulk_resets(self):
        packet = dict(msg="map", cells=[], vgrdc=dict(x=2, y=3), invis_mon_desc="unseen")
        self.ingest(packet)
        self.ingest(dict(packet, view_seq=2))
        self.ingest(dict(packet, vgrdc=dict(x=3, y=3)))
        self.ingest(dict(packet, vgrdc=dict(x=3, y=3), invis_mon_desc="invisible orc"))
        self.ingest(dict(packet, clear=True))
        self.ingest(packet, floor="D:2")
        self.assertEqual(len(self.packets(self.host)), 5)
        self.assertEqual(self.packets(self.host)[1]["vgrdc"], dict(x=3, y=3))
        self.assertEqual(self.packets(self.host)[-1]["floor"], "D:2")

    def test_player_updates_are_personal_sparse_and_complete_on_reattach(self):
        initial = dict(msg="player", name="Host", hp=20, time=10, time_last_input=0,
                       inv={"0": dict(name="sword", quantity=1), "1": dict(name="potion", quantity=2)})
        retained = copy.deepcopy(initial)
        self.ingest(initial)
        self.ingest(dict(initial, time=20, time_last_input=10))
        self.ingest(dict(msg="player", hp=19, inv={"1": dict(quantity=1)}))
        self.assertEqual(self.packets(self.host)[1], dict(msg="player", time=20, time_last_input=10))
        self.assertEqual(self.packets(self.host)[2],
                         dict(msg="player", hp=19, inv={"1": dict(name="potion", quantity=1)}))
        self.guest.append_message.assert_not_called()
        self.assertEqual(initial, retained)
        self.streams.restore(self.host)
        self.assertEqual(self.packets(self.host)[-1], dict(initial, hp=19, time=20, time_last_input=10,
            inv={"0": initial["inv"]["0"], "1": dict(name="potion", quantity=1)}))
        self.ingest(initial, floor="D:2")
        self.assertEqual(self.packets(self.host)[-1], initial, "A floor change resets the player baseline")

    def test_new_native_stream_does_not_reuse_old_player_baseline(self):
        packet = dict(msg="player", hp=20, inv={"0": dict(quantity=1)})
        self.ingest(packet)
        self.streams = PlayerStreams(self.control, TilePresence())
        self.ingest(packet)
        self.assertEqual(self.packets(self.host), [packet, packet])

    def test_player_type_changes_are_not_mistaken_for_equal_values(self):
        self.ingest(dict(msg="player", wizard=False))
        self.ingest(dict(msg="player", wizard=0))
        self.assertEqual(type(self.packets(self.host)[-1]["wizard"]), int)
        self.assertEqual(len(self.packets(self.host)), 2)


if __name__ == "__main__":
    unittest.main()
