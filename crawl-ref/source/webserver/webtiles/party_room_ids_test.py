"""GHSA-5wfq-36jc-wp3f: a resumed save must not replace another user's live room."""
from copy import deepcopy
import unittest
from unittest.mock import patch

from webtiles import game_library, ws_handler
from webtiles.game_library_test import Workspace
from webtiles.library_management_test import Socket


class SavedRoomRestoreTests(Workspace, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.socket = Socket()
        for target, value in (("sockets", set()), ("PARTY_ROOMS", {}), ("USER_PARTY_SPECS", {})):
            patched = patch.object(ws_handler, target, value)
            patched.start()
            self.addCleanup(patched.stop)

    def saved_game(self, room_id):
        room = {"room_id": room_id, "host": "Host", "status": "staging",
                "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        game = game_library.create_game("Host", "solo")
        game_library.update_party(game["id"], (
            {"party_arg": "2", "slot_specs": {}, "room": room}))
        with open(game["save_dir"] + "/Host.cs", "wb") as package:
            package.write(b"saved")
        game_library.finish_game(game["id"], "saved")
        self.socket._library_resume_id = game["id"]
        return game

    def test_saved_room_id_naming_another_users_room_is_rekeyed(self):
        victim = {"room_id": "room-Victim", "host": "Victim", "status": "staging", "slots": []}
        ws_handler.PARTY_ROOMS["room-Victim"] = victim
        self.saved_game("room-Victim")
        self.socket.library_prepare_start("solo")
        self.assertIs(ws_handler.PARTY_ROOMS["room-Victim"], victim)
        self.assertEqual(ws_handler.PARTY_ROOMS["room-Host"]["host"], "Host")

    def test_own_saved_room_id_is_kept(self):
        self.saved_game("custom-room")
        self.socket.library_prepare_start("solo")
        self.assertEqual(ws_handler.PARTY_ROOMS["custom-room"]["status"], "launched")


if __name__ == "__main__":
    unittest.main()
