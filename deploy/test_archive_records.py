"""Recovery and ownership contracts for operator-requested record archival."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

WEB = Path(__file__).resolve().parents[1] / "crawl-ref/source/webserver"
sys.path.insert(0, str(WEB))
from webtiles import chronicle, game_library, stats

spec = importlib.util.spec_from_file_location("archive_records", Path(__file__).with_name("archive_records.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / "rcs"
        (self.root / "saves").mkdir(parents=True)
        self.library = self.root / "library"
        with game_library.connect(str(self.library)):
            pass
        chronicle.init_db(str(self.root))
        store = stats.StatsStore(str(self.root))
        store.connect().close()

    def game(self, name):
        game = game_library.create_game(name, "coop-2p-web-trunk", base_dir=str(self.library))
        (Path(game["save_dir"]) / (name + ".cs")).write_bytes(b"native-checkpoint")
        return game

    def apply(self, plan):
        with patch.object(module.subprocess, "check_output", return_value="./crawl -name Rogue"):
            return plan.apply(self.base / "archive")

    def test_exact_accounts_linked_companions_backups_and_replay(self):
        retained = self.game("rOgUe")
        discarded = self.game("RogueQA")
        with game_library.connect(str(self.library)) as conn:
            for game in (retained, discarded):
                conn.execute("INSERT INTO entities VALUES (?,?,?,?,?,?)",
                             (game["id"], "players", game["id"], "Lyra", "{}", "now"))
        chronicle.record_party_comp(host="Rogue", members=[{"name": "Rogue"}, {"name": "Lyra"}],
                                    timestamp="same-time", base_dir=str(self.root))
        chronicle.record_player_ghost("Lyra", username="Lyra", timestamp="same-time", base_dir=str(self.root))
        chronicle.record_party_comp(host="RogueQA", base_dir=str(self.root))
        for game in (retained, discarded):
            event = {"type": "hero_snapshot", "name": "Lyra", "game_id": game["id"],
                     "hero_id": game["id"], "start": "20261017120000", "time": "2026-10-17T12:00:00Z",
                     "xl": 1, "turns": 1, "outcome": "alive"}
            (Path(game["save_dir"]) / "stats_events.jsonl").write_text(json.dumps(event) + "\n")
            (Path(game["save_dir"]) / "coop_chronicle.jsonl").write_text(
                json.dumps({"type": "ghost", "hero_name": "Lyra"}) + "\n")
        store = stats.StatsStore(str(self.root))
        store.ingest()
        before = (Path(retained["save_dir"]) / "rOgUe.cs").read_bytes()
        plan = module.Archive(self.root, ["Rogue", "JediJosh"])
        self.assertEqual(plan.kept_games, {retained["id"]})
        result = self.apply(plan)
        self.assertEqual(result["status"], "complete")
        self.assertEqual((Path(retained["save_dir"]) / "rOgUe.cs").read_bytes(), before)
        self.assertFalse(Path(discarded["save_dir"]).exists())
        self.assertTrue((self.base / "archive/files/library/saves" / discarded["id"] / "RogueQA.cs").exists())
        self.assertEqual(len(module.rows(self.library / "index.sqlite", "games")), 1)
        self.assertEqual(len(module.rows(self.library / "index.sqlite", "entities")), 1)
        self.assertEqual(len(module.rows(self.root / "coop_chronicle.db", "player_ghosts")), 1)
        backup = self.base / "archive/databases/library/index.sqlite"
        self.assertEqual(len(module.rows(backup, "games")), 2)
        self.assertEqual(len([r for r in module.rows(store_path(store), "chronicle")
                              if r["origin"].startswith("jsonl:")]), 1)
        store.ingest()
        self.assertTrue(all(row["game_id"] == retained["id"] for row in
                            (json.loads(r["row_json"]) for r in module.rows(store_path(store), "games"))))
        after = module.Archive(self.root, ["Rogue", "JediJosh"]).summary()
        self.assertEqual(after["games_archived"], 0)
        self.assertTrue(all(count == 0 for count in after["rows_archived"].values()))
        self.assertEqual(after["shared_sources_filtered"], 0)

    def test_legacy_stream_retains_party_ghosts_and_byte_exact_xlog_lines(self):
        stream = self.root / "saves/coop_chronicle.jsonl"
        events = [{"type": "party_comp", "seed": "1", "members": [{"name": "QA"}]},
                  {"type": "ghost", "hero_name": "QA"},
                  {"type": "party_comp", "seed": "2", "members": [{"name": "Rogue"}, {"name": "Lyra"}]},
                  {"type": "ghost", "hero_name": "Lyra"}]
        stream.write_text("".join(json.dumps(e) + "\n" for e in events))
        chronicle.ingest_jsonl_events(str(self.root))
        logfile = self.root / "saves/logfile"
        kept = b"name=Rogue:seed=2:turn=3\n"
        logfile.write_bytes(b"name=QA:seed=1:turn=9\n" + kept)
        self.apply(module.Archive(self.root, ["Rogue"]))
        self.assertEqual(logfile.read_bytes(), kept)
        self.assertEqual([e["type"] for e in map(json.loads, stream.read_text().splitlines())],
                         ["party_comp", "ghost"])
        self.assertEqual(chronicle.ingest_jsonl_events(str(self.root)), 0)
        self.assertEqual(len(module.rows(self.root / "coop_chronicle.db", "player_ghosts")), 1)

    def test_running_discarded_game_and_unsafe_path_are_rejected(self):
        game = self.game("QA")
        plan = module.Archive(self.root, ["Rogue"])
        with patch.object(module.subprocess, "check_output", return_value="./crawl -name QA"):
            with self.assertRaisesRegex(ValueError, "running"):
                plan.apply(self.base / "archive")
        self.assertTrue(Path(game["save_dir"]).exists())
        with game_library.connect(str(self.library)) as conn:
            conn.execute("UPDATE games SET save_dir = ?", (str(self.base),))
        with self.assertRaisesRegex(ValueError, "Unrecognized save directory"):
            module.Archive(self.root, ["Rogue"])

    def test_active_game_guard_is_scoped_to_the_target_state_directory(self):
        discarded = self.game("QA")
        plan = module.Archive(self.root, ["Rogue"])
        unrelated = "/opt/other/crawl -name QA -dir /run/isolated-qa/rcs"
        with patch.object(module.subprocess, "check_output", return_value=unrelated):
            self.assertEqual(plan.active_games(), [])
            plan.apply(self.base / "archive")
        self.assertFalse(Path(discarded["save_dir"]).exists())
        for directory in (self.root, self.root / "library/saves/game"):
            command = "/opt/game/crawl -name QA -dir " + str(directory)
            with patch.object(module.subprocess, "check_output", return_value=command):
                self.assertEqual(plan.active_games(), ["QA"])

    def test_account_cleanup_is_opt_in_and_preserves_credentials_and_guest_saves(self):
        auth = self.base / "accounts.db3"
        settings = self.base / "settings.db3"
        with sqlite3.connect(auth) as conn:
            conn.executescript("""
                CREATE TABLE dglusers (id INTEGER PRIMARY KEY, username TEXT, password TEXT);
                CREATE TABLE recovery_tokens (token TEXT, user_id INTEGER REFERENCES dglusers(id));
                INSERT INTO dglusers VALUES (1, 'Rogue', 'preserved-hash'), (2, 'Discard', 'discard-hash');
                INSERT INTO recovery_tokens VALUES ('keep-token', 1), ('discard-token', 2);
            """)
        with sqlite3.connect(settings) as conn:
            conn.executescript("""
                CREATE TABLE mutesettings (username TEXT PRIMARY KEY, mutelist TEXT);
                INSERT INTO mutesettings VALUES ('Rogue', ''), ('Discard', 'Rogue');
                CREATE TABLE profile_graphics (username TEXT PRIMARY KEY, settings TEXT, revision INTEGER);
                INSERT INTO profile_graphics VALUES ('Rogue', '{"shading": false}', 2), ('Discard', '{}', 1);
                CREATE TABLE profile_appearance (username TEXT PRIMARY KEY, texture_pack TEXT);
                INSERT INTO profile_appearance VALUES ('Rogue', 'illustrated'), ('Discard', 'classic');
            """)
        for name in ("Rogue", "Discard", "OldAccount"):
            (self.root / (name + ".rc")).write_text("preferences")
            folder = self.root / name
            folder.mkdir()
            (folder / (name + ".txt")).write_text("record")
        (self.root / "Discard.macro").write_text("macro")
        retained = self.game("Rogue")
        with game_library.connect(str(self.library)) as conn:
            conn.execute("UPDATE games SET party_json = ? WHERE id = ?",
                         (json.dumps({"slot_users": {"Rogue": 0, "MrBlueSky": 1}}), retained["id"]))
        default = module.Archive(self.root, ["Rogue", "MrBlueSky"])
        self.assertNotIn(self.root / "Discard.rc", default.paths)
        self.assertTrue(all(path != auth for path, _, _ in default.removals))
        plan = module.Archive(self.root, ["Rogue", "MrBlueSky"], auth, settings)
        self.assertIn(self.root / "OldAccount", plan.paths)
        result = self.apply(plan)
        self.assertTrue(result["protected_files_unchanged"])
        self.assertEqual([(u["username"], u["password"]) for u in module.rows(auth, "dglusers")],
                         [("Rogue", "preserved-hash")])
        self.assertEqual([r["token"] for r in module.rows(auth, "recovery_tokens")], ["keep-token"])
        self.assertEqual([r["username"] for r in module.rows(settings, "mutesettings")], ["Rogue"])
        self.assertEqual([(r["username"], r["settings"], r["revision"])
                          for r in module.rows(settings, "profile_graphics")],
                         [("Rogue", '{"shading": false}', 2)])
        self.assertEqual([(r["username"], r["texture_pack"])
                          for r in module.rows(settings, "profile_appearance")],
                         [("Rogue", "illustrated")])
        self.assertEqual(len(module.rows(self.base / "archive/databases/identity/accounts.db3", "dglusers")), 2)
        self.assertTrue((self.base / "archive/files/Discard.macro").is_file())
        self.assertTrue((self.root / "Rogue.rc").is_file())
        self.assertTrue(Path(retained["save_dir"]).is_dir())
        fresh = module.Archive(self.root, ["Rogue", "MrBlueSky"], auth, settings).summary()
        self.assertTrue(all(n == 0 for n in fresh["rows_archived"].values()))
        self.assertEqual(fresh["paths_archived"], 0)


def store_path(store):
    return Path(store.db_path)


if __name__ == "__main__":
    unittest.main()
