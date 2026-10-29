"""Explicit room identities must not fall back to another player's only room."""
from copy import deepcopy
import unittest
from unittest.mock import Mock, patch

from webtiles import ws_handler


class StagingSocket:
    username = "NewHost"
    reset_lobby_timeout = Mock()
    party_room_create = ws_handler.CrawlWebSocket.party_room_create
    party_room_apply_comp = ws_handler.CrawlWebSocket.party_room_apply_comp


class RoomResolutionTests(unittest.TestCase):
    def setUp(self):
        self.other = {"room_id": "room-other", "host": "OtherHost",
                      "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        self.other["slots"][0]["username"] = "OtherHost"
        self.other["slots"][1]["username"] = "Guest"
        rooms = patch.dict(ws_handler.PARTY_ROOMS, {"room-other": self.other}, clear=True)
        rooms.start()
        self.addCleanup(rooms.stop)

    def test_unknown_explicit_identity_does_not_select_sole_unrelated_room(self):
        self.assertIsNone(ws_handler._resolve_party_room(username="NewHost"))
        self.assertIsNone(ws_handler._resolve_party_room(room_id="missing"))

    def test_host_guest_and_existing_aliases_resolve_case_insensitively(self):
        for query in ({"username": "otherhost"}, {"username": "guest"},
                      {"room_id": "room-other"}, {"room_id": "other"}, {"room_id": "otherHOST"}):
            with self.subTest(query=query):
                self.assertIs(ws_handler._resolve_party_room(**query), self.other)

    def test_implicit_single_room_join_remains_available(self):
        self.assertIs(ws_handler._resolve_party_room(), self.other)
        with patch.dict(ws_handler.PARTY_ROOMS, {"room-second": {"host": "Second"}}):
            self.assertIsNone(ws_handler._resolve_party_room())

    def test_use_build_creates_own_room_and_preserves_other_host(self):
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"), patch.object(ws_handler.config, "games", {}):
            StagingSocket().party_room_apply_comp(comp_name="Fresh recipe", friendly_fire=False,
                members=[{"name": "Pilot", "species": "Minotaur", "job": "Fighter"}])
        self.assertEqual(self.other, original)
        own = ws_handler.PARTY_ROOMS["room-NewHost"]
        self.assertEqual(own["host"], "NewHost")
        self.assertEqual(own["name"], "Fresh recipe")
        self.assertFalse(own["friendly_fire"])
        self.assertEqual(own["slots"][0]["hero_name"], "Pilot")


if __name__ == "__main__":
    unittest.main()
