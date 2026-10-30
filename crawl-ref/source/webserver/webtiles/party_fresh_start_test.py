"""A fresh party must leave the selected checkpoint resumable and unchanged."""
from copy import deepcopy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from webtiles import game_library, party_saved, ws_handler


class FreshStartTests(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory(prefix="dcss-fresh-party-")
        self.addCleanup(workspace.cleanup)
        previous = os.getcwd()
        os.chdir(workspace.name)
        self.addCleanup(os.chdir, previous)
        self.game = game_library.create_game("Host", "coop-2p-web-trunk")
        self.package = Path(self.game["save_dir"], "Host.cs")
        self.package.write_bytes(b"preserved native checkpoint")
        game_library.finish_game(self.game["id"], "saved")
        self.original_game = game_library.get_game(self.game["id"])
        self.room = dict(room_id="custom-room", host="Host", status="staging",
                         resume_id=self.game["id"], visibility="private",
                         slots=deepcopy(ws_handler.DEFAULT_PARTY_SLOTS))
        self.room["slots"][0].update(username="Host", hero_name="Saved hero")
        self.room["slots"][1].update(username="Guest", state="player")
        self.original_room = deepcopy(self.room)
        self.socket = Mock(username="hOsT")
        self.socket.is_in_lobby.return_value = True
        for change in (patch.dict(ws_handler.PARTY_ROOMS, {"custom-room": self.room}, clear=True),
                       patch.object(ws_handler, "broadcast_party_rooms"),
                       patch.object(ws_handler.config, "games", {}),
                       patch("webtiles.library_socket.running_game_ids", return_value=set())):
            change.start()
            self.addCleanup(change.stop)

    def create(self, **changes):
        request = dict(room_id="custom-room", replace_save=self.game["id"], visibility="private")
        request.update(changes)
        ws_handler.CrawlWebSocket.party_room_create(self.socket, **request)

    def assert_checkpoint_preserved(self):
        self.assertEqual(game_library.get_game(self.game["id"]), self.original_game)
        self.assertEqual(self.package.read_bytes(), b"preserved native checkpoint")
        self.assertEqual(party_saved.checkpoint(self.game["id"], "Host")["id"], self.game["id"])
        self.assertEqual(self.room, self.original_room)

    def test_fresh_room_preserves_checkpoint_and_releases_old_guest_seats(self):
        self.create()
        fresh = ws_handler.PARTY_ROOMS["custom-room"]
        self.assertIsNot(fresh, self.room)
        self.assertNotIn("resume_id", fresh)
        self.assertEqual(fresh["status"], "staging")
        self.assertEqual(fresh["visibility"], "private")
        self.assertEqual(fresh["slots"][0]["hero_name"], "hOsT")
        self.assertTrue(all(not slot["username"] for slot in fresh["slots"][1:]))
        self.assertEqual(list(ws_handler.PARTY_ROOMS), ["custom-room"])
        self.socket.library_error.assert_not_called()
        self.assert_checkpoint_preserved()

    def test_duplicate_request_preserves_new_character_edits(self):
        self.create()
        fresh = ws_handler.PARTY_ROOMS["custom-room"]
        fresh["slots"][0]["hero_name"] = "New chosen hero"
        self.create()
        self.assertIs(ws_handler.PARTY_ROOMS["custom-room"], fresh)
        self.assertEqual(fresh["slots"][0]["hero_name"], "New chosen hero")
        self.socket.library_error.assert_not_called()
        self.assert_checkpoint_preserved()

    def test_ordinary_create_keeps_saved_party_for_resume(self):
        self.create(replace_save=None)
        self.assertIs(ws_handler.PARTY_ROOMS["custom-room"], self.room)
        self.assert_checkpoint_preserved()

    def test_guest_cannot_replace_hosts_saved_party(self):
        self.socket.username = "Guest"
        self.create()
        self.socket.library_error.assert_called_once()
        self.assert_checkpoint_preserved()

    def test_stale_save_selection_cannot_replace_different_checkpoint(self):
        self.create(replace_save="different-checkpoint")
        self.socket.library_error.assert_called_once()
        self.assert_checkpoint_preserved()

    def test_missing_room_does_not_create_from_stale_selection(self):
        self.create(room_id="missing-room")
        self.assertEqual(list(ws_handler.PARTY_ROOMS), ["custom-room"])
        self.socket.library_error.assert_called_once()
        self.assert_checkpoint_preserved()

    def test_active_socket_cannot_replace_saved_party(self):
        self.socket.is_in_lobby.return_value = False
        self.create()
        self.assertIs(ws_handler.PARTY_ROOMS["custom-room"], self.room)
        self.socket.library_error.assert_called_once()
        self.assert_checkpoint_preserved()

    def test_launching_and_launched_rooms_cannot_be_replaced(self):
        for status in ("launching", "launched"):
            with self.subTest(status=status):
                self.room["status"] = status
                self.socket.library_error.reset_mock()
                self.create()
                self.assertIs(ws_handler.PARTY_ROOMS["custom-room"], self.room)
                self.socket.library_error.assert_called_once()
        self.room["status"] = "staging"
        self.assert_checkpoint_preserved()


if __name__ == "__main__":
    unittest.main()
