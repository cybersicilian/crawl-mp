"""/stats ingestion, dedup, filters, reference fallback and HTTP rendering."""
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import game_library, stats
from webtiles.stats_http import StatsAPIHandler, StatsPageHandler

TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")

REFERENCE = {
    "version": "0.33-test", "generated_by": "crawl -stats-json",
    "monsters": [
        {"key": "hobgoblin", "name": "hobgoblin", "glyph": "g", "hd": 1, "hp_avg": 5, "ac": 2, "ev": 10,
         "speed": 10, "xp": 3, "attacks": [{"type": "hit", "flavour": "plain", "damage": 5}],
         "resists": {"fire": 0}, "flags": ["warm_blood"], "spells": [], "description": "A small goblin."},
        {"key": "ribbon_worm", "name": "ribbon worm", "glyph": "w", "hd": 2, "hp_avg": 9, "ac": 1, "ev": 8,
         "speed": 10, "xp": 6, "attacks": [], "resists": {}, "flags": [],
         "spells": [{"key": "magic_dart", "name": "Magic Dart", "freq": 20, "flags": []}]},
        {"key": "wolf", "name": "wolf", "glyph": "h", "hd": 4, "hp_avg": 18, "ac": 4, "ev": 15, "speed": 20},
    ],
    "items": {
        "weapons": [{"key": "war_axe", "name": "war axe", "skill": "Axes", "damage": 11, "hit": 0, "delay": 15,
                     "hands": 1}],
        "armour": [{"key": "leather_armour", "name": "leather armour", "slot": "body", "ac": 3, "ev_penalty": -4}],
        "potions": [{"key": "curing", "name": "potion of curing", "description": "Heals.", "price": 40}],
        "unrands": [{"key": "singing_sword", "name": "the Singing Sword", "base": "double sword",
                     "properties": {"rF": 1}, "description": "<b>loud</b>"}],
    },
    "spells": [{"key": "magic_dart", "name": "Magic Dart", "level": 1, "schools": ["Conjuration"],
                "range": 5, "flags": [], "description": "Zap.", "books": []}],
    "species": [
        {"key": "demonspawn", "name": "Demonspawn", "abbrev": "Ds", "str": 8, "int": 9, "dex": 8,
         "aptitudes": {"Axes": 0, "Fighting": 0}, "mutations": [], "playable": True},
        {"key": "minotaur", "name": "Minotaur", "abbrev": "Mi", "str": 12, "int": 5, "dex": 5,
         "aptitudes": {"Axes": 2, "Fighting": 2}, "mutations": [{"key": "horns", "name": "horns"}], "playable": True},
        {"key": "deep_elf", "name": "Deep Elf", "abbrev": "DE", "aptitudes": {}, "playable": True},
    ],
    "jobs": [
        {"key": "gladiator", "name": "Gladiator", "abbrev": "Gl", "skills": {"Fighting": 3},
         "equipment": ["war axe"], "playable": True},
        {"key": "fighter", "name": "Fighter", "abbrev": "Fi", "skills": {"Fighting": 3}, "playable": True},
        {"key": "conjurer", "name": "Conjurer", "abbrev": "Cj", "spells": ["magic_dart"], "playable": True},
    ],
    "combos": [{"species": "demonspawn", "job": "gladiator", "str": 14, "int": 8, "dex": 14, "hp": 16, "mp": 1},
               {"species": "minotaur", "job": "fighter", "hp": 19},
               {"species": "deep_elf", "job": "conjurer"}],
    "gods": [{"key": "trog", "name": "Trog", "description": "Berserk.", "abilities": ["Berserk"]}],
    "mutations": [{"key": "horns", "name": "horns", "levels": 3, "description": "Pointy."}],
    "skills": [{"key": "fighting", "name": "Fighting"}, {"key": "axes", "name": "Axes"}],
    "branches": [{"name": "Dungeon", "long_name": "the Dungeon", "levels": 15, "has_rune": False},
                 {"name": "Lair", "long_name": "the Lair of Beasts", "levels": 5, "has_rune": False}],
}

XLOG_DEATH = ("v=0.33-a0:vlong=0.33-a0:name=Rogue:race=Demonspawn:cls=Gladiator:xl=3:place=D::2:br=D:lvl=2:"
              "absdepth=2:sc=120:ktyp=mon:killer=a ribbon worm:start=20260916150207D:end=20260916150243D:"
              "turn=150:dur=35:kills=4:seed=111:god=Trog:piety=40")
XLOG_WIZ = ("v=0.33-a0:name=WizardHero:race=Minotaur:cls=Fighter:xl=1:place=D::1:br=D:absdepth=1:sc=0:ktyp=wizmode:"
            "start=20260916160914D:end=20260916160915D:turn=0:seed=222")
XLOG_SNAP = ("v=0.33-a0:name=Hero:race=Minotaur:cls=Fighter:xl=5:place=Lair::1:br=Lair:absdepth=9:sc=500:"
             "ktyp=mon:killer=a wolf:start=20260916170000S:end=20260916180000S:turn=900:seed=333")
XLOG_XSS = ("v=0.33-a0:name=<script>alert(1)</script>:race=Minotaur:cls=Fighter:xl=1:place=D::1:br=D:"
            "absdepth=1:sc=1:ktyp=mon:killer=a <img src=x onerror=alert(2)>:start=20260916190000S:"
            "end=20260916190100S:turn=5:seed=444")

MORGUE = """ Dungeon Crawl Stone Soup version 0.33-a0 (webtiles) character file.

Game seed: 111

120 Rogue the Chopper (level 3, -4/16 HPs)
             Began as a Demonspawn Gladiator on Oct 16, 2026.
             Slain by a ribbon worm (5 damage)
             ... on level 2 of the Dungeon.
             The game lasted 00:00:35 (150 turns).

Inventory:

Hand Weapons
 a - a +0 war axe (weapon)
Missiles
 d - 3 throwing nets (quivered)
Armour
 b - a +0 leather armour (worn)


   Skills:
 + Level 2.0 Fighting
 - Level 2.8 Axes

Dungeon Overview and Level Annotations

Branches:
Dungeon (2/15)            Lair (1/5)

Vanquished Creatures
  A hobgoblin (D:1)
  3 hobgoblins
  Sigmund (D:2)
5 creatures vanquished.

Action                     || total
---------------------------++-------
 Attack: Normal            ||     3
  Melee: War axe           ||     5
  Quaff: curing            ||     2
         potion of curing  ||     1
"""

MORGUE_ONLY = """ Dungeon Crawl Stone Soup version 0.33-a0 (webtiles) character file.

Game seed: 999

7 Lyra the Conjurer (level 2, 0/10 HPs)
             Began as a Deep Elf Conjurer on Oct 16, 2026.
             Slain by a hobgoblin
             ... on level 1 of the Dungeon.
             The game lasted 00:00:09 (40 turns).

You knew the following spells:

 Your Spells              Type           Power      Damage    Failure   Level
a - Magic Dart            Conj           100%       1d6       2%          1

Vanquished Creatures
  A wolf (D:1)
1 creature vanquished.
"""


def snapshot(**changes):
    event = {"type": "hero_snapshot", "final": False, "game_id": "g-1", "hero_id": "h-1",
             "account_id": "", "name": "Hero", "species": "Minotaur", "job": "Fighter", "slot": 0,
             "party_size": 2, "seed": "333", "version": "0.33", "start": "20261016170000",
             "time": "2026-10-16T17:30:00Z", "xl": 3, "turns": 400, "place": "D:4", "branch": "D",
             "depth": 4, "max_depth": {"D": 4}, "god": "Trog", "piety": 20, "runes": [], "score": 50,
             "outcome": "alive", "kills": {"hobgoblin": 2}, "kill_total": 2,
             "actions": {"cast": {"Magic Dart": 4}, "quaff": {"curing": 1}},
             "equipment": [{"slot": "weapon", "name": "+0 war axe", "base_key": "war_axe", "artefact": False}],
             "spells_known": ["magic_dart"], "branches_visited": ["D"]}
    event.update(changes)
    return json.dumps(event)


class Fixture(object):
    def make_rcs(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name, "rcs")
        (root / "saves").mkdir(parents=True)
        (root / "saves" / "logfile").write_text("\n".join([XLOG_DEATH, XLOG_WIZ, XLOG_SNAP, XLOG_XSS]) + "\n")
        (root / "saves" / "milestones").write_text(
            "v=0.33:name=Rogue:start=20260916150207D:time=20260916150220D:type=br.enter:br=Lair:place=Lair::1:"
            "milestone=entered Lair::1.\n"
            "v=0.33:name=Rogue:start=20260916150207D:time=20260916150230D:type=uniq:milestone=killed Sigmund.\n")
        (root / "Rogue").mkdir()
        (root / "Rogue" / "morgue-Rogue-20261016-150243.txt").write_text(MORGUE)
        (root / "Lyra").mkdir()
        (root / "Lyra" / "morgue-Lyra-20261016-120000.txt").write_text(MORGUE_ONLY)
        (root / "stats_events.jsonl").write_text("\n".join([
            snapshot(time="2026-10-16T17:30:00Z", xl=3),
            snapshot(time="2026-10-16T17:45:00Z", xl=4, place="Lair:1", branch="Lair"),
            snapshot(time="2026-10-16T17:10:00Z", xl=2),  # out-of-order older line loses
        ]) + "\n")
        fixture = Path(self.tmp.name, "stats-reference.json")
        fixture.write_text(json.dumps(REFERENCE))
        self.root = root
        self.fixture = str(fixture)
        return stats.StatsStore(str(root), binary=[], fixture_path=self.fixture, ingest_interval=0)


class ParserTests(unittest.TestCase):
    def test_xlog_escaped_colons(self):
        f = stats.parse_xlog_line("name=Bob:place=D::12:killer=a:::tmsg=x::y\n")
        self.assertEqual(f["place"], "D:12")
        self.assertEqual(f["killer"], "a:")
        self.assertEqual(f["tmsg"], "x:y")
        self.assertIsNone(stats.parse_xlog_line("   \n"))

    def test_xlog_months_are_zero_based(self):
        self.assertEqual(stats.xlog_time("20260916150207D"), "2026-10-16T15:02:07Z")
        self.assertEqual(stats.xlog_time("20261101000000S"), "2026-12-01T00:00:00Z")
        self.assertIsNone(stats.xlog_time("garbage"))
        game = stats.xlog_game(stats.parse_xlog_line(XLOG_DEATH))
        self.assertEqual((game["place"], game["branch"], game["outcome"]), ("D:2", "Dungeon", "dead"))
        self.assertFalse(game["wizmode"])
        self.assertTrue(stats.xlog_game(stats.parse_xlog_line(XLOG_WIZ))["wizmode"])

    def test_morgue(self):
        game = stats.parse_morgue(MORGUE, "/x/morgue-Rogue-20261016-150243.txt")
        self.assertEqual(game["name"], "Rogue")
        self.assertEqual(game["end_ts"], "2026-10-16T15:02:43Z")
        self.assertEqual(game["score"], 120)
        self.assertEqual(game["xl"], 3)
        self.assertEqual(game["combo_raw"], "Demonspawn Gladiator")
        self.assertEqual(game["killer"], "a ribbon worm")
        self.assertEqual(game["place"], "D:2")
        self.assertEqual(game["turns"], 150)
        self.assertEqual(game["kill_names"], {"hobgoblin": 1, "hobgoblins": 3, "Sigmund": 1})
        self.assertEqual(game["actions"]["melee"], {"War axe": 5})
        self.assertEqual(game["actions"]["quaff"], {"curing": 2, "potion of curing": 1})
        self.assertEqual(game["skills"], {"Fighting": 2.0, "Axes": 2.8})
        self.assertEqual([e["name"] for e in game["equipment"]], ["a +0 war axe", "a +0 leather armour"])
        self.assertIn("Lair", game["branches_visited"])
        only = stats.parse_morgue(MORGUE_ONLY, "morgue-Lyra-20261016-120000.txt")
        self.assertEqual(only["spells_known"], ["Magic Dart"])

    def test_reference_resolution(self):
        ref = stats.Reference(REFERENCE, "fixture")
        self.assertEqual(ref.monster_key("a ribbon worm"), "ribbon_worm")
        self.assertEqual(ref.monster_key("hobgoblins"), "hobgoblin")
        self.assertEqual(ref.monster_key("wolves"), "wolf")
        self.assertEqual(ref.species_key("Deep Elf"), "deep_elf")
        self.assertEqual(ref.match_equipment("a +0 war axe"), ("weapons", "war_axe"))
        self.assertEqual(ref.match_equipment("the +7 Singing Sword {rF+}"), ("unrands", "singing_sword"))
        self.assertEqual(ref.item_key("potions", "curing"), "curing")
        self.assertEqual(ref.branch_key("D"), "dungeon")

    @unittest.skipUnless(os.path.isfile(stats.FIXTURE_PATH), "engine fixture not generated yet")
    def test_real_engine_fixture(self):
        with open(stats.FIXTURE_PATH) as f:
            ref = stats.Reference(json.load(f), "fixture")
        self.assertGreater(len(ref.monsters), 100)
        self.assertEqual(ref.monster_key("a ribbon worm"), "ribbon_worm")
        self.assertEqual(ref.monster_key("hobgoblins"), "hobgoblin")
        self.assertEqual(ref.branch_key("D"), ref.branch_key("Dungeon"))
        self.assertIn(ref.branch_key("D"), ref.branch_by_key)
        self.assertEqual(ref.species_key("Deep Elf"), "deep_elf")
        self.assertEqual(ref.match_equipment("a +0 war axe"), ("weapons", "war_axe"))
        self.assertEqual(ref.match_equipment("a +2 ring of protection")[0], "jewellery")
        self.assertIsNotNone(ref.item_key("potions", "curing"))
        self.assertTrue(ref.combo_by_pair)
        self.assertIn(("demonspawn", "gladiator"), ref.combo_by_pair)


class StoreTests(Fixture, unittest.TestCase):
    def setUp(self):
        self.store = self.make_rcs()
        self.assertTrue(self.store.ingest())

    def games(self, **filters):
        return stats.apply_filters(self.store.games(), stats.parse_filters(filters))

    def by_name(self, games):
        return {g["name"]: g for g in games}

    def test_ingest_is_idempotent_and_incremental(self):
        before = len(self.store.games())
        self.assertFalse(self.store.ingest())
        with open(self.root / "saves" / "logfile", "a") as f:
            f.write(XLOG_DEATH.replace("name=Rogue", "name=Second") + "\n")
        self.assertTrue(self.store.ingest())
        self.assertEqual(len(self.store.games()), before + 1)
        # Re-ingesting a rebuilt cache from scratch produces the same games.
        os.remove(self.store.db_path)
        fresh = stats.StatsStore(str(self.root), binary=[], fixture_path=self.fixture, ingest_interval=0)
        fresh.ingest()
        self.assertEqual(len(fresh.games()), before + 1)

    def test_final_xlog_beats_live_snapshot_and_preserves_details(self):
        games = self.by_name(self.games(include_wizmode="1"))
        hero = games["Hero"]
        self.assertEqual(hero["source"], "snapshot")
        self.assertIn("xlog", hero["sources"])
        self.assertEqual(hero["xl"], 5)
        self.assertEqual(hero["place"], "Lair:1")
        self.assertEqual(hero["outcome"], "dead")
        self.assertEqual(hero["score"], 500)
        self.assertEqual(hero["turns"], 900)
        self.assertEqual(hero["end_ts"], "2026-10-16T18:00:00Z")
        self.assertEqual(hero["mode"], "party")
        self.assertEqual(hero["kills"], {"hobgoblin": 2})
        self.assertEqual(hero["hero_id"], "h-1")
        self.assertEqual(hero["game_id"], "g-1")
        self.assertEqual(hero["observations"][0]["xl"], 2)

    def test_morgue_enriches_xlog_and_morgue_only_counts(self):
        games = self.by_name(self.games())
        rogue = games["Rogue"]
        self.assertEqual(rogue["sources"], ["xlog", "morgue"])
        self.assertEqual(rogue["kills"]["hobgoblin"], 4)
        self.assertEqual(rogue["killer_key"], "ribbon_worm")
        self.assertIn("lair", rogue["branch_keys"])   # from milestones
        self.assertEqual(rogue["uniques"], ["Sigmund"])
        self.assertEqual(rogue["god_key"], "trog")
        lyra = games["Lyra"]
        self.assertEqual((lyra["source"], lyra["species"], lyra["job"]), ("morgue", "Deep Elf", "Conjurer"))

    def test_wizmode_excluded_by_default(self):
        self.assertNotIn("WizardHero", self.by_name(self.games()))
        self.assertIn("WizardHero", self.by_name(self.games(include_wizmode="true")))

    def test_filters(self):
        self.assertEqual(set(self.by_name(self.games(account="rogue"))), {"Rogue"})
        self.assertEqual(set(self.by_name(self.games(mode="party"))), {"Hero"})
        self.assertNotIn("Hero", self.by_name(self.games(mode="solo")))
        self.assertEqual(self.games(since="2030-01-01"), [])
        self.assertEqual(len(self.games(until="2026-10-16")), len(self.games()))
        self.assertEqual(stats.parse_filters({"since": "yesterday", "mode": "evil"})["since"], "")

    def test_sections_build(self):
        f = stats.parse_filters({})
        for section in stats.SECTIONS:
            data = stats.build_section(self.store, section, None, f)
            self.assertIsNotNone(data, section)
            json.dumps(data)
        self.assertEqual(stats.build_section(self.store, "combos", "demonspawn.gladiator", f)["title"],
                         "Demonspawn Gladiator")
        mon = stats.build_section(self.store, "monsters", "ribbon_worm", f)
        self.assertIn(["Heroes it has slain", 1], mon["facts"])
        item = stats.build_section(self.store, "items", "weapons.war_axe", f)
        self.assertIn(["Equipped at last record", 2], item["facts"])   # Rogue's morgue + Hero's snapshot
        spell = stats.build_section(self.store, "spells", "magic_dart", f)
        self.assertIn(["Times cast", 4], spell["facts"])
        self.assertIsNone(stats.build_section(self.store, "monsters", "no_such_thing", f))
        self.assertIsNone(stats.build_section(self.store, "nope", None, f))

    def test_library_rows_dedup_by_name_and_seed(self):
        base = str(self.root / "library")
        game = game_library.create_game("Host", "coop-2p-web-trunk", base_dir=base)
        events = Path(base, "events")
        events.mkdir(exist_ok=True)
        (events / (game["id"] + ".json")).write_text(json.dumps({
            "id": game["id"], "seed": "333", "turns": 10, "place": "D:1", "players": [
                {"id": "11111111-1111-4111-8111-111111111111", "name": "Hero", "species": "Minotaur",
                 "job": "Fighter", "xl": 1, "place": "D:1"},
                {"id": "22222222-2222-4222-8222-222222222222", "name": "Newbie", "species": "Deep Elf",
                 "job": "Conjurer", "xl": 1, "place": "D:1"}]}))
        game_library.ingest(game["id"], base)
        self.assertTrue(self.store.ingest())
        games = self.by_name(self.games())
        self.assertEqual(games["Hero"]["source"], "snapshot")   # library row merged, not duplicated
        self.assertEqual(games["Hero"]["game_link"], game["id"])
        self.assertEqual(games["Newbie"]["source"], "library")
        self.assertEqual(games["Newbie"]["account"], "Host")
        self.assertEqual(games["Newbie"]["mode"], "party")

    def test_reference_fallback(self):
        self.assertEqual(self.store.reference().source, "fixture")
        none = stats.StatsStore(str(self.root), binary=[], fixture_path=os.path.join(self.tmp.name, "missing.json"))
        self.assertEqual(none.reference().source, "none")
        # A cached engine dump keyed on the binary signature wins over the fixture.
        fake = Path(self.tmp.name, "crawl")
        fake.write_text("#!/bin/sh\nexit 1\n")
        fake.chmod(0o755)
        store = stats.StatsStore(str(self.root), binary=[str(fake)], fixture_path=self.fixture)
        os.makedirs(store.stats_dir, exist_ok=True)
        with open(store.reference_path, "w") as f:
            json.dump({"signature": store._binary_signature([str(fake)]), "source": "engine",
                       "data": dict(REFERENCE, version="engine-build")}, f)
        ref = store.reference()
        self.assertEqual((ref.source, ref.version), ("engine", "engine-build"))
        # Binary changed -> stale cache; fixture is served while regeneration runs.
        time.sleep(0.01)
        fake.write_text("#!/bin/sh\nexit 2\n")
        self.assertEqual(store.reference().source, "fixture")
        if store._ref_thread:
            store._ref_thread.join(10)


class HTTPTests(Fixture, AsyncHTTPTestCase):
    def get_app(self):
        self.store = self.make_rcs()
        self.store.ingest()
        self.previous_store = stats._store
        stats._store = self.store
        self.addCleanup(setattr, stats, "_store", self.previous_store)
        return tornado.web.Application([
            (r"/stats/?", StatsPageHandler), (r"/stats/([a-z]+)/?", StatsPageHandler),
            (r"/stats/([a-z]+)/([^/]+)", StatsPageHandler), (r"/api/stats/?", StatsAPIHandler),
            (r"/api/stats/([a-z]+)/?", StatsAPIHandler), (r"/api/stats/([a-z]+)/([^/]+)", StatsAPIHandler),
        ], template_path=TEMPLATE_PATH, static_path=os.path.join(os.path.dirname(TEMPLATE_PATH), "static"))

    def test_every_section_renders(self):
        for section in stats.SECTIONS:
            for prefix in ("/stats/", "/api/stats/"):
                response = self.fetch(prefix + section)
                self.assertEqual(response.code, 200, prefix + section)
        for path in ("/stats", "/stats/combos/demonspawn.gladiator", "/stats/monsters/hobgoblin",
                     "/stats/items/unrands.singing_sword", "/stats/spells/magic_dart", "/stats/gods/trog",
                     "/stats/branches/dungeon", "/stats/species/minotaur", "/stats/jobs/fighter",
                     "/stats/players/Rogue", "/stats/players/WizardHero", "/stats/skills/fighting", "/stats/mutations/horns",
                     "/stats/deaths?mode=solo&include_wizmode=1&since=2026-01-01"):
            response = self.fetch(path)
            self.assertEqual(response.code, 200, path)
        self.assertEqual(self.fetch("/stats/monsters/missing").code, 404)
        self.assertEqual(self.fetch("/stats/bogus").code, 404)
        self.assertEqual(self.fetch("/api/stats/bogus").code, 404)

    def test_output_is_escaped_and_pathless(self):
        body = self.fetch("/stats/overview?include_wizmode=1").body.decode()
        self.assertIn("&lt;script&gt;alert(1)&lt;/script&gt;", body)
        self.assertNotIn("<script>alert(1)", body)
        self.assertNotIn("<img src=x", body)
        self.assertIn('aria-sort="none"', body)
        self.assertIn('scope="col"', body)
        unrand = self.fetch("/stats/items/unrands.singing_sword").body.decode()
        self.assertNotIn("<b>loud</b>", unrand)
        api = self.fetch("/api/stats/players?include_wizmode=1").body.decode()
        self.assertNotIn(self.tmp.name, api)
        self.assertNotIn(self.tmp.name, body)
        self.assertNotIn("<script>", api)
        data = json.loads(api)
        self.assertEqual(data["section"], "players")

    def add_leaderboard_runs(self, entries):
        with open(self.root / "stats_events.jsonl", "a") as output:
            for index, entry in enumerate(entries):
                fields = dict(game_id="rank-game-%d" % index, hero_id="rank-hero-%d" % index,
                              name="RankHero%d" % index, party_size=1, final=True, outcome="dead",
                              time="2026-10-18T12:00:00Z", seed=str(9000 + index))
                fields.update(entry)
                output.write(snapshot(**fields) + "\n")
        self.store.ingest()

    def leaderboard(self, query=""):
        data = json.loads(self.fetch("/api/stats/overview" + query).body)
        return next(table for table in data["tables"] if table["id"] == "leaderboard")

    def test_leaderboard_ranks_completed_scores_and_excludes_unranked_runs(self):
        self.add_leaderboard_runs([
            {"name": "OlderWinner", "score": 9000, "outcome": "won", "time": "2026-10-17T12:00:00Z"},
            {"name": "NewerTie", "score": 9000}, {"name": "Third", "score": 8000},
            {"name": "Ongoing", "score": 99999, "outcome": "alive", "final": False},
            {"name": "Wizard", "score": 99999, "wizmode": True},
            {"name": "GameplayQA123", "score": 99999},
            {"name": "Missing", "score": None}, {"name": "Negative", "score": -1},
            {"name": "Nonfinite", "score": float("inf")}, {"name": "Boolean", "score": True},
            {"name": "TextScore", "score": "10000"}, {"name": "Zero", "score": 0},
        ])
        table = self.leaderboard("?include_wizmode=1")
        rows = table["rows"]
        self.assertEqual([r["hero"]["text"] for r in rows[:3]], ["NewerTie", "OlderWinner", "Third"])
        self.assertEqual([r["rank"] for r in rows[:3]], [1, 1, 3])
        self.assertEqual(rows[-1]["hero"]["text"], "Zero")
        names = {r["hero"]["text"] for r in rows}
        self.assertFalse(names & {"Ongoing", "Wizard", "GameplayQA123", "Missing", "Negative", "Nonfinite",
                                  "Boolean", "TextScore"})
        self.assertEqual(table["columns"][0]["key"], "rank")
        body = self.fetch("/stats").body.decode()
        self.assertLess(body.index('id="leaderboard"'), body.index('id="recent"'))
        self.assertIn("Tied scores share a rank", body)

    def test_leaderboard_uses_account_mode_and_date_filters(self):
        self.add_leaderboard_runs([
            {"name": "RankSolo", "account_id": "rank-owner", "score": 9000},
            {"name": "RankParty", "score": 8000, "party_size": 2},
            {"name": "RankOlder", "score": 7000, "time": "2026-10-17T12:00:00Z"},
        ])
        for query, expected in [
            ("?account=rank-owner", ["RankSolo"]),
            ("?mode=party", ["RankParty", "Hero"]),
            ("?mode=solo&since=2026-10-18&until=2026-10-18", ["RankSolo"]),
        ]:
            with self.subTest(query=query):
                table = self.leaderboard(query)
                self.assertEqual([r["hero"]["text"] for r in table["rows"]], expected)
                self.assertEqual(table["rows"][0]["rank"], 1)
                self.assertIn(query, table["rows"][0]["combo"]["href"])

    def test_leaderboard_limits_after_ranking_and_handles_empty_filters(self):
        self.add_leaderboard_runs([{"score": 2000 + n} for n in range(30)])
        table = self.leaderboard()
        self.assertEqual(len(table["rows"]), 25)
        self.assertEqual([r["score"] for r in table["rows"]], list(range(2029, 2004, -1)))
        self.assertIn("of 34 completed hero runs", table["note"])
        empty = self.leaderboard("?account=Nobody")
        self.assertEqual(empty["rows"], [])
        body = self.fetch("/stats?account=Nobody").body.decode()
        self.assertIn(empty["empty"], body)

    def test_leaderboard_includes_final_scores_behind_live_snapshots(self):
        table = self.leaderboard()
        hero = next(row for row in table["rows"] if row["hero"]["text"] == "Hero")
        self.assertEqual(hero["rank"], 1)
        self.assertEqual(hero["score"], 500)
        self.assertEqual(hero["xl"], 5)
        self.assertEqual(hero["turns"], 900)
        self.assertEqual(hero["outcome"], "Fallen")
        self.assertEqual(hero["when"], "2026-10-16 18:00:00 UTC")

    def test_archive_search_uses_canonical_links_and_preserves_scope(self):
        data = json.loads(self.fetch("/api/stats/search?q=magic+dart&mode=party").body)
        found = data["search"]
        self.assertGreater(found["total"], 0)
        self.assertEqual(found["results"][0]["name"], "Magic Dart")
        self.assertEqual(found["results"][0]["href"], "/stats/spells/magic_dart?mode=party")
        self.assertTrue(any(row["category"] == "Spells" for row in found["results"]))
        items = json.loads(self.fetch("/api/stats/search?q=war_axe").body)["search"]["results"]
        self.assertEqual(items[0]["href"], "/stats/items/weapons.war_axe")
        combos = json.loads(self.fetch("/api/stats/search?q=minotaur+fighter").body)["search"]["results"]
        self.assertEqual(combos[0]["href"], "/stats/combos/minotaur.fighter")
        for row in found["results"] + items + combos:
            self.assertEqual(self.fetch(row["href"]).code, 200, row["href"])

    def test_search_empty_safety_and_navigation_coverage(self):
        body = self.fetch("/stats/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E").body.decode()
        self.assertNotIn("<script>alert(1)", body)
        self.assertIn("No entries match", body)
        empty = json.loads(self.fetch("/api/stats/search").body)["search"]
        self.assertEqual(empty["results"], [])
        self.assertEqual(self.fetch("/stats/search/missing").code, 404)
        data = json.loads(self.fetch("/api/stats/overview?mode=solo").body)
        entries = [entry for group in data["navigation"] for entry in group["entries"]]
        self.assertEqual({entry["key"] for entry in entries}, set(stats.SECTIONS))
        self.assertEqual(len(entries), len(stats.SECTIONS))
        self.assertTrue(all(entry["href"].endswith("?mode=solo") for entry in entries))

    def test_search_reference_is_independent_of_gameplay_filters(self):
        for query in ("hobgoblin", "curing", "fighting", "horns"):
            unfiltered = json.loads(self.fetch("/api/stats/search?q=" + query).body)["search"]
            filtered = json.loads(self.fetch("/api/stats/search?q=" + query + "&account=Nobody&since=2099-01-01").body)["search"]
            self.assertEqual([r["name"] for r in unfiltered["results"] if r["category"] != "Players & heroes"],
                             [r["name"] for r in filtered["results"] if r["category"] != "Players & heroes"])
            self.assertGreater(filtered["total"], 0)

    def test_empty_states_read_well(self):
        empty = stats.StatsStore(os.path.join(self.tmp.name, "nothing"), binary=[],
                                 fixture_path=os.path.join(self.tmp.name, "missing.json"), ingest_interval=0)
        stats._store = empty
        for section in stats.SECTIONS:
            response = self.fetch("/stats/" + section)
            self.assertEqual(response.code, 200, section)
        body = self.fetch("/stats").body.decode()
        self.assertIn("No games have been recorded on this server yet", body)


if __name__ == "__main__":
    unittest.main()
