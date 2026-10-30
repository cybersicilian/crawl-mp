"""Lobby broadcasts reuse the chronicle summary until its files change."""
import os
import tempfile
import unittest
from unittest.mock import patch

from webtiles import chronicle


class SummaryCacheTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.base_dir = directory.name
        cache = patch.dict(chronicle._summary_cache, {}, clear=True)
        cache.start()
        self.addCleanup(cache.stop)

    def summary(self):
        return chronicle.get_chronicle_summary(limit=5, base_dir=self.base_dir)

    def assert_served_from_cache(self):
        with patch.object(chronicle, "_get_conn", side_effect=AssertionError("reopened")):
            return self.summary()

    def test_steady_state_reads_do_not_reopen_the_database(self):
        first = self.summary()
        settled = self.summary()  # the first call created the database file
        self.assertEqual(first, settled)
        self.assertEqual(self.assert_served_from_cache(), settled)

    def test_database_and_jsonl_writes_invalidate(self):
        self.summary(); self.summary()
        chronicle.record_party_comp(comp_name="Pot", host="Host", base_dir=self.base_dir)
        self.assertEqual([c["comp_name"] for c in self.summary()["party_comps"]], ["Pot"])
        with open(os.path.join(self.base_dir, chronicle.JSONL_FILENAME), "a") as events:
            events.write('{"type": "cool_item", "item_name": "Orb", "category": "orb"}\n')
        self.assertEqual([i["item_name"] for i in self.summary()["cool_items"]], ["Orb"])
        settled = self.summary()
        self.assertEqual(self.assert_served_from_cache(), settled)

    def test_callers_cannot_poison_the_cached_summary(self):
        self.summary(); self.summary()
        served = self.summary()
        served["ghosts"] = "mutated"
        self.assertEqual(self.summary()["ghosts"], [])


if __name__ == "__main__":
    unittest.main()
