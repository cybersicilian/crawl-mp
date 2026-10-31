"""Launch names reach native argv and survive resumes without changing ownership."""
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from webtiles import character_names, config, game_library, ws_handler
from webtiles.game_library_test import Workspace
from webtiles.library_management_test import Socket
from webtiles.library_socket import configure_process
from webtiles.process_handler import CrawlProcessHandlerBase


class CharacterNameTests(unittest.TestCase):
    def test_native_names_and_blank_fallback(self):
        for name in ("Aldric", "Moss the Wise", "Éowyn", "Hero-2._", "勇者"):
            self.assertEqual(character_names.validate(" " + name + " ", "Host"), name)
        for name in (None, "", "   "):
            self.assertEqual(character_names.validate(name, "Host"), "Host")

    def test_rejects_invalid_names_and_native_width_overflow(self):
        for name in ([], {}, 12, "../escape", "A:B", "A,B", "A\nB", "A\x00B",
                     "A\\B", "...", "A" * 21, "勇" * 11, "=evil"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                character_names.validate(name, "Host")
        self.assertEqual(character_names.validate("勇" * 10, "Host"), "勇" * 10)


class NamedLaunchTests(Workspace, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.socket = Socket()
        for target, value in (("sockets", set()), ("PARTY_ROOMS", {}), ("USER_PARTY_SPECS", {})):
            patched = patch.object(ws_handler, target, value)
            patched.start()
            self.addCleanup(patched.stop)

    def fresh(self, name):
        self.socket._library_fresh = True
        return self.socket.library_prepare_start("solo", character_name=name)

    def call(self, game):
        process = SimpleNamespace(username="Host", game_params=config.GameConfig({
            "id": "solo", "crawl_binary": "crawl", "options": []}, use_template=False),
            config_path=lambda key: "/account", account_restricted=lambda: False)
        configure_process(process, game)
        return process, CrawlProcessHandlerBase._base_call(process)

    def test_selected_name_reaches_native_but_paths_and_owner_keep_account_identity(self):
        game = self.fresh("Moss the Wise")
        process, call = self.call(game)
        self.assertEqual(call[call.index("-name") + 1], "Moss the Wise")
        self.assertEqual(call[call.index("-rc") + 1], "/account/Host.rc")
        self.assertEqual(call[call.index("-macro") + 1], "/account/Host.macro")
        self.assertEqual(game["owner"], process.username)
        self.assertEqual(process.game_params["env"]["CRAWL_OWNER_ID"], game["owner_id"])

    def test_saved_name_survives_mode_resume_and_exact_resume_with_another_draft(self):
        game = self.fresh("Moss")
        package = Path(game["save_dir"], "Moss.cs")
        package.write_bytes(b"saved package")
        game_library.finish_game(game["id"], "saved")
        for exact in (False, True):
            if exact:
                self.socket._library_resume_id = game["id"]
            resumed = self.socket.library_prepare_start("solo", character_name="New name")
            self.assertEqual(resumed["id"], game["id"])
            self.assertEqual(self.call(resumed)[0].character_name, "Moss")
            self.assertEqual(package.read_bytes(), b"saved package")

    def test_default_and_old_saves_keep_account_name(self):
        game = self.fresh("")
        self.assertEqual(self.call(game)[0].character_name, "Host")
        old = game_library.create_game("Host", "solo")
        self.assertEqual(self.call(old)[0].character_name, "Host")

    def test_invalid_name_cannot_create_a_game_and_new_runs_do_not_reuse_old_names(self):
        self.fresh("First")
        self.fresh("Second")
        games = game_library.list_games("Host")
        self.assertEqual(len(games), 2)
        with self.assertRaises(ValueError):
            self.fresh("../escape")
        self.assertEqual(len(game_library.list_games("Host")), 2)
        self.assertEqual(json.loads(self.fresh("")["party_json"])["character_name"], "Host")


if __name__ == "__main__":
    unittest.main()
