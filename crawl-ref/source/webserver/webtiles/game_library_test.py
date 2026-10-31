"""Persistence, identity, HTTP rendering and ownership regressions."""
import json
import os
from pathlib import Path
import tempfile
import unittest
import uuid

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import game_library as library
from webtiles.library_http import LibraryAPIHandler, LibraryPageHandler
from webtiles.library_socket import LibrarySocketMethods


class Workspace:
    def setUp(self):
        self.previous_dir = os.getcwd()
        self.workspace = tempfile.TemporaryDirectory()
        os.chdir(self.workspace.name)
        self.addCleanup(self.cleanup_workspace)
        super().setUp()

    def cleanup_workspace(self):
        # Library jobs resolve BASE_DIR relative to the cwd: let the worker
        # drain before leaving the temporary directory.
        from webtiles import library_socket
        library_socket._db_executor.submit(lambda: None).result(timeout=10)
        os.chdir(self.previous_dir)
        self.workspace.cleanup()

    def snapshot(self, game, **changes):
        event_dir = Path(library.BASE_DIR, "events")
        event_dir.mkdir(exist_ok=True)
        payload = {"id": game["id"], "turns": 42, "place": "D:3", "seed": "12",
                   "players": [], "randarts": [], **changes}
        (event_dir / (game["id"] + ".json")).write_text(json.dumps(payload))
        library.ingest(game["id"])


class LibraryTests(Workspace, unittest.TestCase):
    def test_separate_saves_and_stable_account_identity(self):
        first = library.create_game("Host", "coop")
        second = library.create_game("Host", "coop")
        self.assertNotEqual(first["id"], second["id"])
        self.assertNotEqual(first["save_dir"], second["save_dir"])
        self.assertEqual(first["owner_id"], library.account_id("hOsT"))
        Path(first["save_dir"], "Host.cs").write_bytes(b"first native package")
        library.finish_game(first["id"], "saved")
        self.assertEqual(library.latest_game("Host", "coop")["id"], first["id"])
        self.assertEqual(Path(first["save_dir"], "Host.cs").read_bytes(), b"first native package")
        serialized = json.dumps(library.list_games("Host"))
        self.assertNotIn("save_dir", serialized)
        self.assertNotIn(self.workspace.name, serialized)
        library.create_game("Other", "coop")
        self.assertEqual([game["id"] for game in library.list_games("hOsT")],
                         [first["id"], second["id"]])
        self.assertEqual(len(library.list_games()), 3)

    def test_ingest_reports_only_real_updates(self):
        game = library.create_game("Host", "coop")
        self.assertFalse(library.ingest(game["id"]))
        event_dir = Path(library.BASE_DIR, "events")
        event_dir.mkdir(exist_ok=True)
        (event_dir / (game["id"] + ".json")).write_text(json.dumps({"id": game["id"], "turns": 7}))
        self.assertTrue(library.ingest(game["id"]))
        self.assertFalse(library.ingest(game["id"]))
        self.assertEqual(library.list_games("Host")[0]["state"]["turns"], 7)

    def test_identity_links_survive_updates_and_keep_dropped_randarts(self):
        game = library.create_game("Host", "coop")
        hero = {"id": str(uuid.uuid4()), "name": "Same name", "xl": 3}
        item = {"id": str(uuid.uuid4()), "name": "Same name", "finder_id": hero["id"]}
        self.snapshot(game, players=[hero], randarts=[item])
        hero["xl"] = 4
        self.snapshot(game, players=[hero], randarts=[])
        self.assertEqual(library.get_entity("players", hero["id"])["xl"], 4)
        self.assertEqual(library.get_entity("randarts", item["id"])["finder_id"], hero["id"])
        self.assertEqual(library.get_entity("games", game["id"])["randarts"][0]["id"], item["id"])
        other = library.create_game("Other", "coop")
        self.snapshot(other, players=[{**hero, "name": "Collision"}])
        self.assertEqual(library.get_entity("players", hero["id"])["game_id"], game["id"])

    def test_legacy_import_preserves_original(self):
        source = Path("old/saves/sprint")
        source.mkdir(parents=True)
        (source / "Host.cs").write_bytes(b"legacy native package")
        game = library.import_legacy("Host", "sprint-web-trunk", "old")
        self.assertEqual((source / "Host.cs").read_bytes(), b"legacy native package")
        self.assertEqual(Path(game["save_dir"], "sprint/Host.cs").read_bytes(), b"legacy native package")
        self.assertEqual(game["status"], "saved")

    def test_load_requires_owner_and_idle_host(self):
        game = library.create_game("Host", "coop")
        Path(game["save_dir"], "Host.cs").write_bytes(b"native package")

        class Socket(LibrarySocketMethods):
            username = "Other"
            process = None
            def __init__(self):
                self.messages, self.started = [], []
            def send_message(self, name, **payload):
                self.messages.append((name, payload))
            def is_in_lobby(self):
                return self.process is None
            def start_crawl(self, mode):
                self.started.append(mode)

        socket = Socket()
        socket.library_load(id=game["id"])
        self.assertFalse(socket.started)
        socket.username = "Host"
        socket.process = object()
        socket.library_load(id=game["id"])
        self.assertFalse(socket.started)
        socket.process = None
        socket.library_load(id=game["id"])
        self.assertEqual(socket.started, ["coop"])
        self.assertEqual(socket._library_resume_id, game["id"])


class LibraryHTTPTests(Workspace, AsyncHTTPTestCase):
    def get_app(self):
        templates = Path(__file__).resolve().parents[1] / "templates"
        return tornado.web.Application([
            (r"/(games|players|randarts)/([0-9a-f-]+)", LibraryPageHandler),
            (r"/api/library/(games|players|randarts)/([0-9a-f-]+)", LibraryAPIHandler),
        ], template_path=str(templates))

    def test_profiles_escape_text_and_hide_save_paths(self):
        game = library.create_game("Host", "coop", title="<script>alert(1)</script>")
        hero = {"id": str(uuid.uuid4()), "name": "<img src=x>", "xl": 1,
                "species": "Human", "job": "Fighter", "hp": 10, "hp_max": 10, "place": "D:1"}
        self.snapshot(game, players=[hero])
        response = self.fetch("/games/" + game["id"])
        self.assertEqual(response.code, 200)
        self.assertNotIn(b"<script>alert", response.body)
        self.assertIn(b"&lt;script&gt;", response.body)
        self.assertIn(hero["id"].encode(), response.body)
        response = self.fetch("/api/library/games/" + game["id"])
        self.assertNotIn(b"save_dir", response.body)
        self.assertNotIn(self.workspace.name.encode(), response.body)
        self.assertEqual(self.fetch("/players/" + str(uuid.uuid4())).code, 404)

    def test_randart_link_works_before_library_refresh_or_save(self):
        game = library.create_game("Host", "coop")
        item = {"id": str(uuid.uuid4()), "name": "The axe of Sharing",
                "description": "A newly identified artefact.", "finder_name": "Host",
                "finder_id": str(uuid.uuid4()), "place": "D:1"}
        event_dir = Path(library.BASE_DIR, "events")
        event_dir.mkdir(exist_ok=True)
        event_dir.joinpath(game["id"] + ".json").write_text(json.dumps({
            "id": game["id"], "players": [], "randarts": [item]}))
        response = self.fetch("/randarts/" + item["id"])
        self.assertEqual(response.code, 200)
        self.assertIn(item["name"].encode(), response.body)
        self.assertIsNone(library.get_game(game["id"])["saved_at"])


if __name__ == "__main__":
    unittest.main()
