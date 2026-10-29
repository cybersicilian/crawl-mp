"""Save deletion and test-account visibility across library and stats adapters."""
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import game_library as library, stats
from webtiles.game_library_test import Workspace
from webtiles.library_http import LibraryAPIHandler, LibraryPageHandler
from webtiles.library_socket import LibrarySocketMethods, running_game_ids
from webtiles.record_visibility import is_test_account


class Socket(LibrarySocketMethods):
    def __init__(self, username="Host"):
        self.username, self.process = username, None
        self.messages = []

    def is_in_lobby(self):
        return self.process is None

    def send_message(self, name, **payload):
        self.messages.append((name, payload))


class SaveDeletionTests(Workspace, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.game = library.create_game("Host", "coop")
        self.package = Path(self.game["save_dir"], "Host.cs")
        self.package.write_bytes(b"native save")
        self.hero = {"id": str(uuid.uuid4()), "name": "Lyra"}
        self.snapshot(self.game, players=[self.hero])

    def test_deletion_removes_only_selected_save_and_preserves_history(self):
        other = library.create_game("Host", "coop")
        other_package = Path(other["save_dir"], "Host.cs")
        other_package.write_bytes(b"another save")
        library.delete_save(self.game["id"], "hOsT")
        self.assertFalse(Path(self.game["save_dir"]).exists())
        self.assertEqual(other_package.read_bytes(), b"another save")
        record = library.get_entity("games", self.game["id"])
        self.assertEqual(record["status"], self.game["status"])
        self.assertTrue(record["save_deleted_at"])
        self.assertFalse(record["loadable"])
        self.assertEqual(library.get_entity("players", self.hero["id"])["name"], "Lyra")
        self.assertEqual(library.latest_game("Host", "coop")["id"], other["id"])
        # Repeated requests and future refreshes must not restore saved progress.
        library.delete_save(self.game["id"], "Host")
        library.ingest(self.game["id"])
        self.assertTrue(library.get_game(self.game["id"])["save_deleted_at"])

    def test_ownership_invalid_ids_and_running_games_leave_files_untouched(self):
        for identifier, owner, active in [
                (self.game["id"], "Other", ()), (self.game["id"], None, ()),
                ("../../outside", "Host", ()), (str(uuid.uuid4()), "Host", ()),
                (self.game["id"], "Host", {self.game["id"]})]:
            with self.subTest(identifier=identifier, owner=owner, active=active):
                with self.assertRaises(ValueError):
                    library.delete_save(identifier, owner, active)
                self.assertEqual(self.package.read_bytes(), b"native save")

    def test_untrusted_storage_path_and_symlink_are_rejected(self):
        original = Path(self.game["save_dir"])
        outside = Path("outside").resolve()
        outside.mkdir()
        (outside / "keep.cs").write_bytes(b"keep")
        with library.connect() as conn:
            conn.execute("UPDATE games SET save_dir = ? WHERE id = ?", (str(outside), self.game["id"]))
        with self.assertRaises(ValueError):
            library.delete_save(self.game["id"], "Host")
        with library.connect() as conn:
            conn.execute("UPDATE games SET save_dir = ? WHERE id = ?", (str(original), self.game["id"]))
        self.package.unlink()
        original.rmdir()
        original.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            library.delete_save(self.game["id"], "Host")
        self.assertEqual((outside / "keep.cs").read_bytes(), b"keep")

    @patch("webtiles.library_socket.running_game_ids", return_value=set())
    def test_socket_authorization_refresh_and_missing_save_directory(self, running):
        socket = Socket()
        other_tab = Socket()
        with patch("webtiles.ws_handler.find_user_sockets", return_value=[socket, other_tab]):
            for username, process in [(None, None), ("Other", None), ("Host", object())]:
                socket.username, socket.process = username, process
                socket.library_delete(id=self.game["id"])
                self.assertEqual(socket.messages[-1][0], "library_error")
                self.assertTrue(self.package.exists())
            socket.username, socket.process = "Host", None
            running.return_value = {self.game["id"]}
            socket.library_delete(id=self.game["id"])
            self.assertTrue(self.package.exists())
            running.return_value = set()
            socket.library_delete(id=self.game["id"])
            self.assertIn(("library_delete_result", {"id": self.game["id"]}), socket.messages)
            for tab in (socket, other_tab):
                self.assertEqual(tab.messages[-1][0], "game_library")
                self.assertEqual(tab.messages[-1][1]["games"], [])
            socket.library_load(id=self.game["id"])
            self.assertEqual(socket.messages[-1][0], "library_error")

    def test_running_check_includes_detached_processes_and_starting_tabs(self):
        detached = SimpleNamespace(record_id="detached")
        starting = SimpleNamespace(process=SimpleNamespace(record_id="starting"))
        unidentified = SimpleNamespace(username="Host")
        with patch("webtiles.process_handler.processes", {1: detached, 2: unidentified}), \
                patch("webtiles.ws_handler.sockets", [starting]):
            self.assertEqual(running_game_ids(), {"detached", "starting", self.game["id"]})

    @patch("webtiles.library_socket.running_game_ids", return_value=set())
    def test_failed_filesystem_operation_reports_error_and_keeps_card(self, running):
        socket = Socket()
        with patch("webtiles.game_library.shutil.rmtree", side_effect=OSError("permission")):
            socket.library_delete(id=self.game["id"])
        self.assertEqual(socket.messages[-1][0], "library_error")
        self.assertIsNone(library.get_game(self.game["id"])["save_deleted_at"])
        self.assertTrue(self.package.exists())


class RecordVisibilityTests(Workspace, unittest.TestCase):
    def test_account_policy_is_specific_case_insensitive_and_configurable(self):
        for name in ("test", "Test123", "QA", "saveqa123", "DesignQA1016", "PolishQA1016",
                     "FolioQAmgu123H", "ControlHostmgu123", "WorkspaceQAmgu123",
                     "DeployQA123", "GuestQAmgu123", "ControlHmgu12345", "ControlGmgu12345"):
            self.assertTrue(is_test_account(name), name)
        for name in (None, "", "Contest", "Latest", "Testament", "Ian", "ControlHost"):
            self.assertFalse(is_test_account(name), name)
        with patch.dict(os.environ, CRAWL_TEST_ACCOUNTS=" ScratchRun, CustomProbe "):
            self.assertTrue(is_test_account("scratchrun"))
            self.assertTrue(is_test_account("CUSTOMPROBE"))
            self.assertFalse(is_test_account("ScratchRunner"))

    def test_public_lists_exclude_test_owners_heroes_and_items_but_owner_keeps_saves(self):
        normal = library.create_game("Contest", "coop")
        qa = library.create_game("SaveQA123", "coop")
        hero = {"id": str(uuid.uuid4()), "name": "Ordinary hero"}
        item = {"id": str(uuid.uuid4()), "name": "QA item"}
        self.snapshot(qa, players=[hero], randarts=[item])
        library.account_id("Test")
        self.assertEqual([g["id"] for g in library.list_entities("games")], [normal["id"]])
        self.assertEqual([p["name"] for p in library.list_entities("players")], ["Contest"])
        self.assertEqual(library.list_entities("randarts"), [])
        self.assertEqual(library.list_games("SaveQA123")[0]["id"], qa["id"])
        self.assertIsNotNone(library.get_entity("games", qa["id"]))
        self.assertIsNotNone(library.get_entity("players", hero["id"]))

    def test_stats_filter_existing_cached_rows_after_account_resolution(self):
        base = Path(library.BASE_DIR)
        qa = library.create_game("SaveQA123", "coop")
        normal = library.create_game("Contest", "coop")
        # No QA label in the hero name: resolve the owner's ID before filtering.
        event = {"type": "hero_snapshot", "name": "Ordinary hero", "account_id": qa["owner_id"],
                 "game_id": qa["id"], "hero_id": str(uuid.uuid4()), "seed": "123",
                 "start": "20261017120000", "time": "2026-10-17T12:01:00Z", "species": "Human", "job": "Fighter"}
        (base.parent / "stats_events.jsonl").write_text(json.dumps(event) + "\n")
        store = stats.StatsStore(str(base.parent), binary=[], ingest_interval=0)
        store.ingest()
        self.assertEqual(store.games(), [])
        self.assertIsNone(stats.build_section(store, "players", "SaveQA123", stats.parse_filters({})))
        # A pre-existing non-wizard xlog QA run also stays out of totals.
        (base.parent / "logfile").write_text("name=SaveQA456:race=Human:cls=Fighter:start=20261017120000S:end=20261017120100S:ktyp=quit\n")
        self.snapshot(normal, players=[{"id": str(uuid.uuid4()), "name": "Visible hero"}])
        store.ingest()
        self.assertEqual([game["account"] for game in store.games()], ["Contest"])
        cached = stats.StatsStore(str(base.parent), binary=[], ingest_interval=0)
        self.assertEqual([game["account"] for game in cached.games()], ["Contest"])
        data = stats.build_section(store, "players", None, stats.parse_filters({"include_wizmode": "1"}))
        self.assertNotIn("SaveQA", json.dumps(data))


class RecordVisibilityHTTPTests(Workspace, AsyncHTTPTestCase):
    def get_app(self):
        templates = Path(__file__).resolve().parents[1] / "templates"
        return tornado.web.Application([
            (r"/(games|players|randarts)(?:/([0-9a-f-]+))?", LibraryPageHandler),
            (r"/api/library/(games|players|randarts)(?:/([0-9a-f-]+))?", LibraryAPIHandler),
        ], template_path=str(templates))

    def test_browse_pages_and_apis_hide_test_data_while_owner_links_work(self):
        normal = library.create_game("Contest", "coop", title="Real expedition")
        qa = library.create_game("DeployQA123", "coop", title="Disposable expedition")
        hero = {"id": str(uuid.uuid4()), "name": "Disposable hero"}
        self.snapshot(qa, players=[hero])
        for prefix in ("", "/api/library"):
            for kind in ("players", "games", "randarts"):
                response = self.fetch(prefix + "/" + kind)
                self.assertEqual(response.code, 200)
                self.assertNotIn(b"Disposable", response.body)
                self.assertNotIn(b"DeployQA", response.body)
        self.assertIn(b"Contest", self.fetch("/players").body)
        self.assertEqual(self.fetch("/players/" + qa["owner_id"]).code, 200)
        library.delete_save(normal["id"], "Contest")
        self.assertEqual(self.fetch("/games/" + normal["id"]).code, 200)
        record = json.loads(self.fetch("/api/library/games/" + normal["id"]).body)
        self.assertFalse(record["loadable"])


if __name__ == "__main__":
    unittest.main()
