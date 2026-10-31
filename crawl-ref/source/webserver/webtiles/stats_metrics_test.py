"""KDR semantics over real ingestion, canonical monster keys and filtered runs."""
import json
from pathlib import Path
import tempfile
import unittest

from webtiles import stats
from webtiles.stats_metrics import ratio_record
from webtiles.stats_test import REFERENCE, snapshot


class RatioTests(unittest.TestCase):
    def test_finite_zero_unbounded_and_unobserved_are_distinct_json(self):
        for kills, deaths, state, value, text in [
            (3, 12, "finite", .25, "0.25"), (0, 7, "finite", 0, "0"),
            (2, 0, "unbounded", None, "∞"), (0, 0, "unobserved", None, "—"),
            (1, 100000, "finite", .00001, "1e-05"),
        ]:
            with self.subTest(kills=kills, deaths=deaths):
                r = ratio_record(kills, deaths)
                self.assertEqual((r["state"], r["value"], r["text"]), (state, value, text))
                json.dumps(r, allow_nan=False)


class MonsterRecordTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        ref = root / "reference.json"
        ref.write_text(json.dumps(REFERENCE))
        shared = dict(final=True, outcome="dead", equipment=[], spells_known=[], actions={})
        events = [
            snapshot(**shared, name="Aster", account_id="aster", game_id="a", hero_id="a",
                     party_size=1, kills={"hobgoblins": 4}, killer="a hobgoblin"),
            snapshot(**shared, name="Birch", account_id="birch", game_id="b", hero_id="b",
                     party_size=2, kills={"hobgoblin": 6}, killer="a ribbon worm"),
            snapshot(**shared, name="Cedar", account_id="cedar", game_id="c", hero_id="c",
                     time="2026-10-18T10:00:00Z", party_size=1, kills={}, killer="a hobgoblin"),
            snapshot(**shared, name="Wizard", game_id="w", hero_id="w", wizmode=True,
                     kills={"hobgoblin": 100}, killer="a hobgoblin"),
        ]
        (root / "stats_events.jsonl").write_text("\n".join(events) + "\n")
        self.store = stats.StatsStore(str(root), binary=[], fixture_path=str(ref), ingest_interval=3600)
        self.store.ingest()

    def rows(self, **filters):
        data = stats.build_section(self.store, "monsters", filters=stats.parse_filters(filters))
        return {row["name"]["href"].split("/")[-1].split("?")[0]: row for row in data["tables"][0]["rows"]}

    def test_aliases_and_filters_use_the_same_population_for_both_counts(self):
        row = self.rows()["hobgoblin"]
        self.assertEqual((row["killed"], row["slain"], row["kdr"]["value"]), (2, 10, .2))
        row = self.rows(mode="party")["hobgoblin"]
        self.assertEqual((row["killed"], row["slain"], row["kdr"]["value"]), (0, 6, 0))
        row = self.rows(account="cedar")["hobgoblin"]
        self.assertEqual((row["killed"], row["slain"], row["kdr"]["state"]), (1, 0, "unbounded"))
        row = self.rows(since="2026-10-18")["hobgoblin"]
        self.assertEqual((row["killed"], row["slain"]), (1, 0))

    def test_reference_only_rows_survive_empty_filters_and_detail_agrees(self):
        rows = self.rows(account="Nobody")
        self.assertEqual(rows["hobgoblin"]["kdr"]["state"], "unobserved")
        self.assertFalse(rows["ribbon_worm"]["has_record"])
        detail = stats.build_section(self.store, "monsters", "hobgoblin")
        self.assertEqual(dict(detail["facts"])["Mob KDR"], "0.2")
        self.assertIn("monster’s perspective", detail["record_note"])
        json.dumps(detail, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
