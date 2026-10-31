"""Analytical contracts: no terminal leakage, no invented data, stable ratings."""
import json
import unittest

from webtiles import stats
from webtiles.outcome_effects import Observation, contrast, wilson
from webtiles.skill_rating import RatedResult, expected_result, replay
from webtiles.stats_analysis import Analysis
from webtiles.stats_test import Fixture, REFERENCE, snapshot
from webtiles import stats_test as fixtures
from tornado.testing import AsyncHTTPTestCase


def game(index=0, **changes):
    row = {"id": "run-" + str(index), "name": "Hero", "account": "Player" + str(index % 3),
           "account_id": "p" + str(index % 3), "game_id": "game-" + str(index), "hero_id": "hero-" + str(index),
           "species_key": "minotaur", "species": "Minotaur", "job_key": "fighter", "job": "Fighter",
           "god_key": "trog", "god": "Trog", "version": "v1", "party_size": 1, "mode": "solo",
           "start_ts": "2026-01-01T00:00:00Z", "end_ts": "2026-01-02T00:00:00Z",
           "when": "2026-01-02T00:00:00Z", "outcome": "won", "wizmode": False, "score": 100,
           "observations": []}
    row.update(changes)
    return row


def landmark(**changes):
    observation = json.loads(snapshot())
    observation.update({"stage": "1", "version": "v1", "updated": "2026-01-01T01:00:00Z",
                        "xl": 3, "equipment": [], "actions": {}, "kills": {}, "spells_known": []})
    observation.update(changes)
    return observation


class EffectCoreTests(unittest.TestCase):
    def observations(self):
        rows = []
        # Four cells: 80%, 40%, 30%, 20%; interaction is +30 percentage points.
        for cell, (features, wins, score) in enumerate([
                ({"a", "b"}, 8, 800), ({"a"}, 4, 400), ({"b"}, 3, 300), (set(), 2, 200)]):
            for index in range(10):
                rows.append(Observation("%d:%d" % (cell, index), str(index % 3), ("v1",),
                                        frozenset(features), index < wins, score))
        return rows

    def test_known_interaction_and_score_contrast(self):
        result = contrast(self.observations(), "a", "b")
        self.assertEqual(result["counts"], [10, 10, 10, 10])
        self.assertEqual(result["win_delta_pp"], 30)
        self.assertEqual(result["score_delta"], 300)
        self.assertLess(result["win_range_pp"][0], 30)
        self.assertGreater(result["win_range_pp"][1], 30)

    def test_plain_effect_and_duplicate_replay(self):
        observations = self.observations()
        result = contrast(observations, "a")
        self.assertEqual(result["win_delta_pp"], 35)
        self.assertEqual(result, contrast(observations + observations, "a"))

    def test_missing_scores_do_not_become_zero(self):
        observations = [Observation(o.unit, o.owner, o.stratum, o.features, o.won, None)
                        for o in self.observations()]
        result = contrast(observations, "a")
        self.assertEqual(result["status"], "estimated")
        self.assertIsNone(result["score_delta"])
        self.assertEqual(result["score_counts"], [0, 0])

    def test_no_pooling_unmatched_rules(self):
        observations = [Observation(o.unit, o.owner, ("old" if "a" in o.features else "new",),
                                    o.features, o.won, o.score) for o in self.observations()]
        result = contrast(observations, "a")
        self.assertEqual(result["status"], "insufficient_data")
        self.assertIsNone(result["win_delta_pp"])

    def test_single_owner_and_missing_cell_are_unknown(self):
        single = [Observation(o.unit, "one", o.stratum, o.features, o.won, o.score)
                  for o in self.observations()]
        self.assertIsNone(contrast(single, "a")["win_delta_pp"])
        self.assertIsNone(contrast(self.observations()[:30], "a", "b")["win_delta_pp"])

    def test_wilson_includes_uncertainty_at_boundaries(self):
        self.assertGreater(wilson(0, 10)[1], 0)
        self.assertLess(wilson(10, 10)[0], 1)
        self.assertIsNone(wilson(0, 0))

    def test_matched_comparison_avoids_simpsons_reversal(self):
        observations = []
        # Both cohorts have identical outcomes within difficulty; exposure is
        # common in easy strata, rare in hard ones. Raw rates are misleading.
        for stratum, wins in (("easy", 8), ("hard", 2)):
            for exposed, copies in ((True, 9 if stratum == "easy" else 1),
                                    (False, 1 if stratum == "easy" else 9)):
                for index in range(10 * copies):
                    observations.append(Observation(str((stratum, exposed, index)), str(index % 3),
                        (stratum,), frozenset({"a"} if exposed else set()), index % 10 < wins, 1))
        self.assertEqual(contrast(observations, "a")["win_delta_pp"], 0)


class EloCoreTests(unittest.TestCase):
    def result(self, key="one", won=True, **changes):
        fields = {"key": key, "participant": "player", "challenge": "dungeon",
                  "started": "2026-01-01", "ended": "2026-01-02", "won": won}
        fields.update(changes)
        return RatedResult(**fields)

    def test_equal_ratings_gain_or_lose_sixteen(self):
        participants, challenges, _before = replay([self.result()])
        self.assertEqual(participants["player"].value, 1516)
        self.assertEqual(challenges["dungeon"].value, 1484)
        self.assertEqual(replay([self.result(won=False)])[0]["player"].value, 1484)

    def test_upset_has_more_weight(self):
        self.assertLess(expected_result(1300, 1700), expected_result(1700, 1300))
        self.assertAlmostEqual(expected_result(1500, 1500), 0.5)

    def test_replay_deduplicates_and_is_order_independent(self):
        a = self.result()
        b = self.result("two", False, started="2026-02-01", ended="2026-02-02")
        self.assertEqual(replay([a, b]), replay([b, a, a]))

    def test_pre_run_covariate_cannot_see_later_outcomes(self):
        a = self.result()
        concurrent = self.result("two", False, started="2026-01-01", ended="2026-01-03")
        participants, _, before = replay([a, concurrent])
        self.assertEqual(before, {"one": 1500, "two": 1500})
        self.assertEqual(len(participants["player"].history), 2)
        later = self.result("three", started="2026-01-02", ended="2026-01-04")
        # Starting exactly at completion does not consume that completion.
        self.assertEqual(replay([a, later])[2]["three"], 1500)


class AdapterTests(unittest.TestCase):
    def model(self, games):
        return Analysis(games, stats.Reference(REFERENCE, "fixture"))

    def test_final_equipment_and_fatal_enemy_never_predict(self):
        model = self.model([game(equipment=[{"name": "+9 war axe"}], killer_key="wolf", outcome="dead")])
        self.assertEqual(model.observations("1"), [])
        self.assertEqual(len(model.observations("start")), 1)

    def test_pre_result_item_use_enemy_and_melded_equipment(self):
        model = self.model([game(observations=[landmark(
            equipment=[{"name": "+1 war axe", "base_key": "war_axe", "melded": True}],
            actions={"quaff": {"curing": 1}}, kills={"hobgoblin": 2})])])
        features = model.observations("1")[0].features
        self.assertIn("items:potions.curing~quaff", features)
        self.assertIn("monsters:hobgoblin", features)
        self.assertNotIn("items:weapons.war_axe", features)

    def test_final_wrong_version_and_late_landmarks_are_excluded(self):
        for observation in (landmark(final=True), landmark(downed=True), landmark(version="other"),
                            landmark(updated="2026-01-03T00:00:00Z")):
            self.assertEqual(self.model([game(observations=[observation])]).observations("1"), [])

    def test_party_updates_once_and_waits_for_full_terminal_party(self):
        first = game(0, party_size=2, mode="party", outcome="dead")
        second = game(1, id="second", account="Player0", account_id="p0", game_id=first["game_id"],
                      party_size=2, mode="party", outcome="alive", end_ts=None)
        self.assertEqual(self.model([first, second]).ratings, {})
        second.update(outcome="won", end_ts="2026-01-03T00:00:00Z")
        model = self.model([first, second])
        self.assertEqual(model.ratings["id:p0"].games, 1)
        self.assertEqual(model.ratings["id:p0"].wins, 1)
        self.assertEqual(model.runs[0]["score"], 200)
        self.assertEqual(self.model([first]).ratings, {})

    def test_wizard_and_qa_and_missing_dates_excluded(self):
        for changes in ({"wizmode": True}, {"account": "DesignQAexample"}, {"start_ts": None},
                        {"end_ts": "2025-01-01"}, {"version": ""}):
            self.assertEqual(self.model([game(**changes)]).ratings, {})

    def test_legacy_name_reconciles_to_known_account(self):
        legacy = game(1, account="PLAYER0", account_id="")
        model = self.model([game(0), legacy])
        self.assertEqual(set(model.ratings), {"id:p0"})
        self.assertEqual(model.ratings["id:p0"].games, 2)

    def test_effect_filters_do_not_change_global_elo(self):
        model = self.model([game(index, outcome="dead" if index % 2 else "won") for index in range(30)])
        before = {key: value.value for key, value in model.ratings.items()}
        model.effect("species:minotaur", units=frozenset([model.runs[0]["key"]]))
        self.assertEqual(before, {key: value.value for key, value in model.ratings.items()})

    def test_start_only_history_supports_class_species_interactions(self):
        model = self.model([game()])
        result = model.effect("species:minotaur", other="jobs:fighter")
        self.assertEqual(result["stage"], "start")
        self.assertEqual(result["observed_exposed"], 1)

    def test_missing_exposure_fields_are_not_negative_controls(self):
        games = []
        for index in range(10):
            observation = landmark(actions={"quaff": {"curing": 1}} if index < 5 else {})
            if index >= 5:
                observation.pop("actions")
            games.append(game(index, observations=[observation], outcome="won" if index < 5 else "dead"))
        result = self.model(games).effect("items:potions.curing")
        self.assertEqual(result["observed_exposed"], 5)
        self.assertIsNone(result["win_delta_pp"])


class RetentionTests(Fixture, unittest.TestCase):
    def test_replays_cache_migration_and_retains_earliest_band(self):
        store = self.make_rcs()
        store.ingest()
        observations = next(g for g in store.games() if g["name"] == "Hero")["observations"]
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]["xl"], 2)
        conn = store.connect()
        conn.execute("DELETE FROM landmarks")
        conn.execute("DELETE FROM meta WHERE key = 'landmarks_v1'")
        conn.commit()
        conn.close()
        store.ingest()
        hero = next(g for g in store.games() if g["name"] == "Hero")
        self.assertEqual(hero["observations"][0]["xl"], 2)

    def test_late_older_landmark_invalidates_merged_cache(self):
        store = self.make_rcs()
        store.ingest()
        store.games()
        with open(self.root / "stats_events.jsonl", "a") as stream:
            stream.write(snapshot(time="2026-10-16T17:05:00Z", turns=100, xl=1) + "\n")
        self.assertTrue(store.ingest())
        hero = next(g for g in store.games() if g["name"] == "Hero")
        self.assertEqual(hero["observations"][0]["xl"], 1)
        self.assertEqual(hero["xl"], 5)  # Final xlog, independent of the earlier landmark.
        self.assertEqual(hero["outcome"], "dead")

    def test_terminal_and_wizard_snapshots_are_not_landmarks(self):
        store = self.make_rcs()
        with open(self.root / "stats_events.jsonl", "a") as stream:
            stream.write(snapshot(final=True, outcome="dead", xl=8) + "\n")
            stream.write(snapshot(wizard=True, xl=12) + "\n")
        store.ingest()
        conn = store.connect()
        rows = conn.execute("SELECT stage FROM landmarks").fetchall()
        conn.close()
        self.assertEqual([r["stage"] for r in rows], ["1"])


class AnalysisHTTPTests(Fixture, AsyncHTTPTestCase):
    get_app = fixtures.HTTPTests.get_app

    def data(self, path):
        response = self.fetch(path)
        self.assertEqual(response.code, 200, path)
        return json.loads(response.body)

    def test_global_rating_is_invariant_to_scope(self):
        all_rows = self.data("/api/stats/ratings")["tables"][0]["rows"]
        filtered = self.data("/api/stats/ratings?account=Rogue&mode=solo")["tables"][0]["rows"]
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0], next(row for row in all_rows if row["account"]["text"] == "Rogue") |
                         {"account": filtered[0]["account"]})
        profile = self.data("/api/stats/players/Rogue?since=2099-01-01")["tables"]
        self.assertEqual(profile[0]["rows"][0]["elo"], filtered[0]["elo"])
        self.assertEqual(len(profile[1]["rows"]), 1)

    def test_unknown_features_have_null_estimates_and_pairs_are_addressable(self):
        for path in ("/api/stats/impacts/items:weapons.war_axe",
                     "/api/stats/impacts/monsters:wolf",
                     "/api/stats/impacts/species:minotaur::jobs:fighter"):
            result = self.data(path)
            self.assertIsNone(result["impact"]["win_delta_pp"])
            self.assertIsNone(result["impact"]["score_delta"])
        self.assertEqual(self.fetch("/stats/impacts/missing:feature").code, 404)
        self.assertEqual(self.fetch("/stats/impacts/species:minotaur::species:minotaur").code, 404)

    def test_arbitrary_pair_lookup_preserves_filters_and_has_bounded_payload(self):
        result = self.data("/api/stats/impacts?q=curing&compare=species:minotaur&stage=10&mode=solo&lookup=1")
        self.assertLessEqual(len(result["feature_matches"]), 30)
        self.assertEqual(result["tables"], [])
        match = result["feature_matches"][0]
        self.assertIn("species%3Aminotaur%3A%3Aitems%3Apotions.curing", match["href"])
        self.assertTrue(match["href"].endswith("?mode=solo&stage=10"))
        self.assertEqual(self.fetch(match["href"]).code, 200)
        ordinary = self.data("/api/stats/impacts?q=curing&compare=species:minotaur&stage=10")
        self.assertEqual(len(ordinary["tables"][0]["rows"]), 1)
        self.assertTrue(ordinary["tables"][0]["rows"][0]["estimate"]["interaction"])

    def test_progressive_form_and_export_preserve_comparison(self):
        body = self.fetch("/stats/impacts?q=curing&compare=species:minotaur&stage=10").body.decode()
        self.assertIn('data-impact-search', body)
        self.assertIn('name="compare" value="species:minotaur"', body)
        self.assertIn('q=curing&amp;compare=species%3Aminotaur', body)
        self.assertIn('stats_stage', body)
        unsafe = self.fetch("/api/stats/impacts?q=%3Cscript%3E&lookup=1").body.decode()
        self.assertNotIn("<script>", unsafe)
        self.assertEqual(stats.parse_filters({"stage": "malformed"})["stage"], "1")


if __name__ == "__main__":
    unittest.main()
