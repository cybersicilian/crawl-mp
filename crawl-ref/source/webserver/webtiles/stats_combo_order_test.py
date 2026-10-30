"""Combo axes reflect filtered outcomes while keeping cell alignment."""
import unittest

from webtiles.stats_reference import Reference
from webtiles.stats_views import _Ctx, section_combos


class ComboOrderTests(unittest.TestCase):
    def setUp(self):
        self.ref = Reference({
            "species": [{"key": k, "name": k.title()} for k in ("alpha", "beta", "gamma")],
            "jobs": [{"key": k, "name": k.title()} for k in ("archer", "mage", "warrior")],
            "combos": [{"species": s, "job": j} for s, j in
                       (("alpha", "archer"), ("beta", "mage"), ("beta", "warrior"), ("gamma", "mage"))],
        })

    def grid(self, games):
        return section_combos(_Ctx(self.ref, games, {}), None)["grid"]

    @staticmethod
    def game(species, job, outcome):
        return {"species_key": species, "job_key": job, "species": species.title(), "job": job.title(),
                "outcome": outcome, "xl": 1, "score": 0}

    def test_weighted_history_and_cells(self):
        games = [self.game("alpha", "archer", "dead") for _ in range(2)]
        games += [self.game("beta", "mage", "won")]
        grid = self.grid(games)
        self.assertEqual([row["species"]["key"] for row in grid["rows"]], ["beta", "alpha", "gamma"])
        self.assertEqual([job["key"] for job in grid["jobs"]], ["mage", "archer", "warrior"])
        self.assertEqual((grid["rows"][0]["cells"][0]["games"], grid["rows"][0]["cells"][0]["wins"]), (1, 1))
        self.assertFalse(grid["rows"][0]["cells"][1]["legal"])

    def test_empty_history_prefers_more_offered_pairs_and_stable_names(self):
        grid = self.grid([])
        self.assertEqual([row["species"]["key"] for row in grid["rows"]], ["beta", "alpha", "gamma"])
        self.assertEqual([job["key"] for job in grid["jobs"]], ["mage", "archer", "warrior"])


if __name__ == "__main__":
    unittest.main()
