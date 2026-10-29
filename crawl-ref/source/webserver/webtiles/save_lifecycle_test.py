"""Ended runs cannot be resumed; death cleanup preserves survivors and records."""
from pathlib import Path
from unittest.mock import patch
import unittest
import uuid

from webtiles import game_library as library
from webtiles.game_library_test import Workspace
from webtiles.library_management_test import Socket


class SaveLifecycleTests(Workspace, unittest.TestCase):
    def game(self, reason=None, package=True, owner="Host"):
        game = library.create_game(owner, "coop")
        if package:
            Path(game["save_dir"], owner + ".cs").write_bytes(b"checkpoint")
        if reason:
            library.finish_game(game["id"], reason)
        return library.get_game(game["id"])

    def test_all_terminal_outcomes_reject_leftover_packages_and_later_callbacks(self):
        survivor = self.game("saved")
        socket = Socket()
        for reason, status in library.EXIT_STATUSES.items():
            with self.subTest(reason=reason):
                game = self.game(reason)
                self.assertEqual(game["status"], status)
                self.assertTrue(list(Path(game["save_dir"]).rglob("*.cs")))
                self.assertEqual(library.save_files(game), [])
                self.assertFalse(library.get_entity("games", game["id"])["loadable"])
                self.assertEqual(library.latest_game("Host", "coop")["id"], survivor["id"])
                socket.library_load(id=game["id"])
                self.assertEqual(socket.messages[-1][0], "library_error")
                for late_reason in ("saved", "crash", None):
                    library.finish_game(game["id"], late_reason)
                    self.assertEqual(library.get_game(game["id"])["status"], status)

    def test_purge_only_confirmed_dead_runs_and_retain_public_history(self):
        dead = self.game("dead")
        hero = {"id": str(uuid.uuid4()), "name": "Lyra"}
        item = {"id": str(uuid.uuid4()), "name": "Keepsake"}
        self.snapshot(dead, players=[hero], randarts=[item])
        # Missing native packages are normal after death and still need removal
        # from the save manager. Preserve their records too.
        no_package = self.game("dead", package=False)
        active_dead = self.game("dead")
        other_owner = self.game("dead", owner="Other")
        survivors = [self.game(reason) for reason in ("saved", "crash", "won", "quit")]
        partial = self.game("saved")
        self.snapshot(partial, players=[{"hp": 0}, {"hp": 12}])
        survivors.append(partial)

        result = library.purge_fallen_saves("hOsT", {active_dead["id"]})
        self.assertEqual(set(result["deleted"]), {dead["id"], no_package["id"]})
        self.assertEqual(result["failed"], [])
        self.assertFalse(Path(dead["save_dir"]).exists())
        record = library.get_entity("games", dead["id"])
        self.assertEqual(record["status"], "fallen")
        self.assertTrue(record["save_deleted_at"])
        self.assertEqual(library.get_entity("players", hero["id"])["name"], "Lyra")
        self.assertEqual(library.get_entity("randarts", item["id"])["name"], "Keepsake")
        for game in survivors + [active_dead, other_owner]:
            self.assertEqual(next(Path(game["save_dir"]).rglob("*.cs")).read_bytes(), b"checkpoint")
            self.assertIsNone(library.get_game(game["id"])["save_deleted_at"])
        self.assertEqual(library.purge_fallen_saves("Host", {active_dead["id"]}),
                         {"deleted": [], "failed": []})

    def test_failed_cleanup_keeps_checkpoint_and_can_retry(self):
        dead = self.game("dead")
        with patch("webtiles.game_library.shutil.rmtree", side_effect=OSError("permission")):
            result = library.purge_fallen_saves("Host")
        self.assertEqual(result, {"deleted": [], "failed": [dead["id"]]})
        self.assertTrue(Path(dead["save_dir"], "Host.cs").exists())
        self.assertIsNone(library.get_game(dead["id"])["save_deleted_at"])
        self.assertEqual(library.purge_fallen_saves("Host")["deleted"], [dead["id"]])

    @patch("webtiles.library_socket.running_game_ids")
    def test_continue_shows_checkpoints_and_real_processes_without_historical_clutter(self, running):
        saved = self.game("saved")
        crashed = self.game("crash")
        # This stale 'active' record is stopped but still recoverable.
        stale = self.game()
        library.mark_active(stale["id"])
        starting = self.game(package=False)
        dead = self.game("dead")
        for reason in ("won", "quit", "bailed out", None):
            self.game(reason, package=reason is not None)
        running.return_value = {starting["id"]}
        socket = Socket()
        socket.library_fetch()
        games = {g["id"]: g for g in socket.messages[-1][1]["games"]}
        self.assertEqual(set(games), {saved["id"], crashed["id"], stale["id"], starting["id"]})
        self.assertFalse(games[stale["id"]]["running"])
        self.assertTrue(games[stale["id"]]["deletable"])
        self.assertTrue(games[starting["id"]]["running"])
        self.assertFalse(games[starting["id"]]["deletable"])
        self.assertTrue(library.get_game(dead["id"])["save_deleted_at"])


if __name__ == "__main__":
    unittest.main()
