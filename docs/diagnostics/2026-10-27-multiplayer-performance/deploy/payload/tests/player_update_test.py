import copy
import unittest

from webtiles.player_update import merge_player, player_update
from webtiles.state_transport import changed_fields


class PlayerUpdateTest(unittest.TestCase):
    def test_movement_retains_inventory_without_resending_it(self):
        previous = dict(msg="player", name="Hero", time=10, pos=dict(x=2, y=3),
                        inv={"0": dict(name="sword", quantity=1), "1": dict(name="potion", quantity=2)})
        current = dict(previous, time=20, pos=dict(x=3, y=3))
        self.assertEqual(player_update(previous, current),
                         dict(msg="player", time=20, pos=dict(x=3, y=3)))
        self.assertIsNone(player_update(previous, copy.deepcopy(previous)))

    def test_inventory_merges_slots_and_item_fields_without_mutation(self):
        previous = dict(msg="player", time=20, inv={"0": dict(name="sword", quantity=1),
                                                  "1": dict(name="potion", quantity=2)})
        retained = copy.deepcopy(previous)
        update = dict(msg="player", hp=19, inv={"1": dict(quantity=1)})
        current = merge_player(previous, update)
        self.assertEqual(current["time"], 20)
        self.assertEqual(current["inv"]["1"], dict(name="potion", quantity=1))
        self.assertEqual(player_update(previous, current),
                         dict(msg="player", hp=19, inv={"1": dict(name="potion", quantity=1)}))
        self.assertEqual(previous, retained)
        self.assertEqual(update, dict(msg="player", hp=19, inv={"1": dict(quantity=1)}))

    def test_removal_status_clear_and_type_changes_are_sent(self):
        previous = dict(msg="player", status=[dict(text="poisoned")], wizard=False,
                        inv={"0": dict(quantity=1, name="potion")})
        current = merge_player(previous, dict(status=[], wizard=0, inv={"0": dict(quantity=0)}))
        delta = player_update(previous, current)
        self.assertEqual(delta["status"], [])
        self.assertEqual(type(delta["wizard"]), int)
        self.assertEqual(delta["inv"]["0"]["quantity"], 0)
        self.assertEqual(changed_fields({"optional": 1}, {"optional": None}), {"optional": None})

    def test_clock_marker_keeps_native_client_timing_semantics(self):
        previous = dict(msg="player", time=20, time_last_input=10)
        self.assertEqual(player_update(previous, dict(previous, time=30)),
                         dict(msg="player", time=30, time_last_input=10))


if __name__ == "__main__":
    unittest.main()
