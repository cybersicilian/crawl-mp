import copy
import unittest
import json
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.map_snapshot import MapSnapshot
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.tile_presence import TilePresence


class MapSnapshotTest(unittest.TestCase):
    def test_replacements_remove_entities_and_tile_decoration_on_reconnect(self):
        snapshot = MapSnapshot()
        initial = dict(msg="map", clear=True, vgrdc=dict(x=4, y=5), cells=[
            dict(x=4, y=5, reset=True, mon=dict(id=9, name="orc"),
                 t=dict(bg=10, cloud=44, ov=[5], bloody=True))])
        snapshot.update(initial, "D:1")
        old = snapshot.packet()
        snapshot.update(dict(msg="map", cells=[dict(x=4, y=5, reset=True, t=dict(bg=11))]), "D:1")
        current = snapshot.packet()
        self.assertEqual(current["cells"], [dict(x=4, y=5, reset=True, t=dict(bg=11))])
        self.assertEqual(current["vgrdc"], dict(x=4, y=5))
        self.assertEqual(old["cells"], initial["cells"], "Previously delivered snapshots stay immutable")
        self.assertTrue(current["clear"])

    def test_compressed_legacy_deltas_keep_independent_cells_and_default_removal(self):
        snapshot = MapSnapshot()
        snapshot.update(dict(cells=[dict(x=3, y=8, t=dict(bg=1)), dict(t=dict(bg=2))]), "D:1")
        snapshot.update(dict(cells=[dict(x=4, y=8, t=dict(fg=9), mon=dict(id=7, name="orc"))]), "D:1")
        snapshot.update(dict(cells=[dict(x=4, y=8, t=dict(fg=0), mon=None)]), "D:1")
        self.assertEqual(snapshot.cells[(3, 8)]["t"], dict(bg=1))
        self.assertEqual(snapshot.cells[(4, 8)]["t"], dict(bg=2, fg=0))
        self.assertIsNone(snapshot.cells[(4, 8)]["mon"])

    def test_floor_or_bulk_reset_cannot_restore_previous_floor_cells(self):
        snapshot = MapSnapshot()
        snapshot.update(dict(cells=[dict(x=5, y=5)]), "D:1")
        snapshot.update(dict(cells=[dict(x=6, y=6)]), "D:2")
        self.assertEqual(set(snapshot.cells), {(6, 6)})
        snapshot.update(dict(clear=True, cells=[]), "D:2")
        self.assertEqual(snapshot.packet()["cells"], [])

    def test_idle_delta_reuses_cells_without_materializing_a_full_floor(self):
        snapshot = MapSnapshot()
        snapshot.update(dict(cells=[dict(x=x, y=1, reset=True) for x in range(80)]), "D:1")
        unchanged = snapshot.cells[(40, 1)]
        snapshot.update(dict(view_seq=2, cells=[dict(x=1, y=1, reset=True, f=2)]), "D:1")
        self.assertIsNone(snapshot._packet)
        self.assertIs(snapshot.cells[(40, 1)], unchanged)
        self.assertEqual(len(snapshot.packet()["cells"]), 80)

    def test_ingested_values_are_shared_without_copying_and_inputs_stay_immutable(self):
        snapshot = MapSnapshot()
        first = dict(vgrdc=dict(x=1, y=1), cells=[dict(x=4, y=5, reset=True, t=dict(bg=1, ov=[5]),
                                                       mon=dict(id=9, name="orc"))])
        second = dict(cells=[dict(x=4, y=5, t=dict(fg=2), mon=dict(id=9, hp=3))])
        retained = copy.deepcopy((first, second))
        snapshot.update(first, "D:1")
        self.assertIs(snapshot.cells[(4, 5)]["t"]["ov"], first["cells"][0]["t"]["ov"])
        self.assertIs(snapshot.metadata["vgrdc"], first["vgrdc"])
        old_cell = snapshot.cells[(4, 5)]
        snapshot.update(second, "D:1")
        self.assertEqual(snapshot.cells[(4, 5)]["t"], dict(bg=1, ov=[5], fg=2))
        self.assertEqual(snapshot.cells[(4, 5)]["mon"], dict(id=9, name="orc", hp=3))
        self.assertEqual(old_cell["t"], dict(bg=1, ov=[5]), "Merging rebuilds a cell; it never edits one")
        self.assertEqual((first, second), retained)


class StreamDeltaTest(unittest.TestCase):
    def test_same_floor_full_refresh_preserves_existing_camera_but_reattach_gets_center(self):
        streams = PlayerStreams(PartyControl("Host", {"Host": 0}), TilePresence())
        host = SimpleNamespace(username="Host", id=1, append_message=Mock(), send_message=Mock())
        for sequence in (1, 2):
            streams.ingest(dict(slot=0, floor="D:1", view=True,
                payload=dict(msg="map", clear=True, view_seq=sequence,
                             vgrdc=dict(x=4, y=5), cells=[])), [host], True)
        self.assertIn("vgrdc", json.loads(host.append_message.call_args_list[0].args[0]))
        self.assertNotIn("vgrdc", json.loads(host.append_message.call_args_list[1].args[0]))
        streams.restore(host)
        self.assertEqual(json.loads(host.append_message.call_args.args[0])["vgrdc"], dict(x=4, y=5))

    def test_reconnect_restores_only_its_owner_and_retains_center_after_delta(self):
        control = PartyControl("Host", {"Host": 0, "Guest": 1})
        streams = PlayerStreams(control, TilePresence())
        host = SimpleNamespace(username="Host", id=1, append_message=Mock(), send_message=Mock())
        guest = SimpleNamespace(username="Guest", id=2, append_message=Mock(), send_message=Mock())

        def ingest(slot, floor, **fields):
            streams.ingest(dict(slot=slot, floor=floor, view=True, payload=dict(msg="map", **fields)),
                           [host, guest], True)

        ingest(0, "D:1", clear=True, vgrdc=dict(x=4, y=4),
               cells=[dict(x=5, y=4, reset=True, mon=dict(id=1))])
        ingest(1, "D:2", clear=True, vgrdc=dict(x=7, y=8),
               cells=[dict(x=5, y=4, reset=True, mon=dict(id=2))])
        ingest(0, "D:1", view_seq=2, cells=[dict(x=5, y=4, reset=True, f=1)])
        reconnect = SimpleNamespace(username="Host", id=3, append_message=Mock(), send_message=Mock())
        streams.restore(reconnect)
        packet = json.loads(reconnect.append_message.call_args.args[0])
        self.assertTrue(packet["clear"])
        self.assertEqual(packet["floor"], "D:1")
        self.assertEqual(packet["vgrdc"], dict(x=4, y=4))
        self.assertEqual(packet["cells"], [dict(x=5, y=4, reset=True, f=1)])
        self.assertEqual(host.personal_center, ("D:1", 4, 4))
        self.assertEqual(len(guest.append_message.call_args_list), 1)


if __name__ == "__main__":
    unittest.main()
