import unittest

from webtiles.ai_state import action_options, facts, path_step


class StateTests(unittest.TestCase):
    def test_path_detours_around_known_wall_and_avoids_hazards(self):
        rows = ["#########", "#.......#", "#..#!...#", "#.......#", "#########"]
        self.assertEqual(path_step(rows, (2, 2), (7, 2), {"north", "west"}), "north")

    def test_no_path_through_unknown_or_into_occupied_cells(self):
        rows = ["#####", "#.?.#", "#####"]
        self.assertIsNone(path_step(rows, (1, 1), (4, 1), {"east"}))
        rows = ["#####", "#...#", "#####"]
        self.assertIsNone(path_step(rows, (1, 1), (4, 1), {"east"}, blocked=[(2, 1)]))

    def test_already_adjacent_and_no_native_step_offer(self):
        rows = ["....."]
        self.assertIsNone(path_step(rows, (0, 0), (1, 0), {"east"}))
        self.assertIsNone(path_step(rows, (0, 0), (4, 0), set()))

    def test_semantic_facts_and_candidate_explanation(self):
        observation = dict(hp=3, hp_max=16, x=10, y=10, floor="D:1", terrain=["." * 17] * 17,
            actions=dict(step_east="Move east"),
            creatures=[dict(name="orc", hostile=True, dx=-1, dy=0)],
            party=[dict(slot=0, floor="D:1", x=14, y=10)])
        tactical = facts(observation)
        self.assertEqual(tactical["health"], "critical")
        self.assertEqual(tactical["adjacent_hostiles"], 1)
        self.assertEqual(tactical["nearest_hostile"]["direction"], "west")
        self.assertEqual(tactical["suggested_follow_step"], "east")
        self.assertIn("safe route", action_options(observation, tactical)["step_east"])

    def test_other_floor_has_no_invented_route(self):
        observation = dict(hp=8, hp_max=8, x=1, y=1, floor="D:1", party=[dict(slot=0, floor="D:2")])
        self.assertEqual(facts(observation)["health"], "full")
        self.assertNotIn("suggested_follow_step", facts(observation))


if __name__ == "__main__":
    unittest.main()
