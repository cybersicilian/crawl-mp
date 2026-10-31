"""Final result precedence without losing snapshots, identity or observations."""
import collections
import json
import unittest

from webtiles.stats_merge import merge_games
from webtiles.stats_parse import dedup_key, parse_xlog_line, snapshot_game, xlog_game
from webtiles.stats_reference import Reference
from webtiles.stats_test import REFERENCE, XLOG_SNAP, snapshot


class ResultPrecedenceTests(unittest.TestCase):
    def merge(self, sources):
        rows = [{"source": source, "dedup": dedup_key(game["name"], game.get("start_ts")),
                 "row_json": json.dumps(game)} for source, game in sources]
        return merge_games(rows, [], {}, {}, Reference(REFERENCE, "fixture"))

    def live(self, **changes):
        return snapshot_game(json.loads(snapshot(**changes)))

    def result(self, **changes):
        fields = parse_xlog_line(XLOG_SNAP)
        fields.update(changes)
        return xlog_game(fields)

    def test_completed_outcomes_override_live_snapshots(self):
        for ktyp, outcome in (("mon", "dead"), ("winning", "won"),
                              ("quitting", "quit"), ("leaving", "left")):
            with self.subTest(ktyp=ktyp):
                observation = {"stage": "1", "xl": 3}
                live = self.live(observations=[observation])
                game, = self.merge([("snapshot", live), ("xlog", self.result(ktyp=ktyp))])
                self.assertEqual(game["outcome"], outcome)
                self.assertEqual((game["score"], game["turns"], game["xl"]), (500, 900, 5))
                self.assertEqual(game["when"], "2026-10-16T18:00:00Z")
                self.assertEqual((game["game_id"], game["hero_id"]), ("g-1", "h-1"))
                self.assertEqual(game["party_size"], 2)
                self.assertEqual(game["kills"], live["kills"])
                self.assertEqual(game["actions"], live["actions"])
                self.assertEqual(game["observations"], [observation])

    def test_live_snapshot_keeps_its_latest_details_after_result(self):
        live = self.live(time="2026-10-16T19:00:00Z", xl=3, turns=400)
        game, = self.merge([("snapshot", live), ("xlog", self.result())])
        self.assertEqual(game["outcome"], "dead")
        self.assertEqual(game["score"], 500)
        self.assertEqual(game["updated"], "2026-10-16T18:00:00Z")
        self.assertEqual(game["equipment"], live["equipment"])

    def test_final_snapshot_keeps_priority_and_zero_score(self):
        final = self.live(final=True, outcome="won", score=0, xl=7, turns=1000,
                          time="2026-10-16T18:01:00Z")
        game, = self.merge([("xlog", self.result()), ("snapshot", final)])
        self.assertEqual((game["outcome"], game["score"], game["xl"]), ("won", 0, 7))
        self.assertEqual(game["when"], "2026-10-16T18:01:00Z")

    def test_unfinished_run_and_other_run_with_same_name_stay_separate(self):
        ongoing = self.live(game_id="g-2", hero_id="h-2", start="20261016190000",
                            time="2026-10-16T19:01:00Z", score=None)
        games = self.merge([("snapshot", ongoing), ("snapshot", self.live()),
                            ("xlog", self.result())])
        self.assertEqual(collections.Counter(g["outcome"] for g in games), {"alive": 1, "dead": 1})
        alive = next(g for g in games if g["outcome"] == "alive")
        self.assertEqual(alive["game_id"], "g-2")
        self.assertIsNone(alive["score"])

    def test_wizard_marker_survives_final_result(self):
        game, = self.merge([("snapshot", self.live(wizard=True)), ("xlog", self.result())])
        self.assertTrue(game["wizmode"])


if __name__ == "__main__":
    unittest.main()
