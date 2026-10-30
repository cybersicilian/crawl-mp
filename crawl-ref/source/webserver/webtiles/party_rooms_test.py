"""Explicit room identities must not fall back to another player's only room."""
from copy import deepcopy
import unittest
from unittest.mock import Mock, patch

from webtiles import party_roster, ws_handler


class StagingSocket:
    username = "NewHost"
    reset_lobby_timeout = Mock()
    library_error = Mock()
    party_room_create = ws_handler.CrawlWebSocket.party_room_create
    party_room_apply_comp = ws_handler.CrawlWebSocket.party_room_apply_comp
    party_room_join = ws_handler.CrawlWebSocket.party_room_join
    party_room_update_slot = ws_handler.CrawlWebSocket.party_room_update_slot


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

    def test_create_cannot_replace_another_hosts_room(self):
        original = deepcopy(self.other)
        socket = StagingSocket()
        socket.library_error = Mock()
        with patch.object(ws_handler, "broadcast_party_rooms"), patch.object(ws_handler.config, "games", {}):
            socket.party_room_create(room_id="room-other", name="Taken over")
        self.assertEqual(self.other, original)
        self.assertIs(ws_handler.PARTY_ROOMS["room-other"], self.other)
        socket.library_error.assert_called_once()

    def test_failed_create_preserves_existing_guest_reservation(self):
        self.other["slots"][1]["username"] = "NewHost"
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"), patch.object(ws_handler.config, "games", {}):
            StagingSocket().party_room_create(room_id="room-other")
        self.assertEqual(self.other, original)

    def test_explicit_join_cannot_reopen_a_closed_seat_or_fall_back(self):
        self.other["slots"][2]["state"] = "closed"
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"):
            StagingSocket().party_room_join(room_id="room-other", slot=2)
        self.assertEqual(self.other, original)

    def test_automatic_join_respects_closed_and_ai_seats_when_no_seat_is_open(self):
        self.other["slots"][2]["state"] = "closed"
        self.other["slots"][3]["state"] = "ai"
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"):
            StagingSocket().party_room_join(room_id="room-other")
        self.assertEqual(self.other, original)

    def test_slot_edit_cannot_bypass_a_closed_seat(self):
        self.other["slots"][2]["state"] = "closed"
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"):
            StagingSocket().party_room_update_slot(room_id="room-other", slot=2, hero_name="Taken")
        self.assertEqual(self.other, original)

    def test_slot_edit_cannot_assign_one_account_to_two_heroes(self):
        socket = StagingSocket()
        socket.username = "gUeSt"
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"):
            socket.party_room_update_slot(room_id="room-other", slot=2, hero_name="Second hero")
        self.assertEqual(self.other, original)

    def test_nonmember_cannot_claim_and_close_an_open_seat(self):
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"):
            StagingSocket().party_room_update_slot(room_id="room-other", slot=2, state="closed")
        self.assertEqual(self.other, original)

    def test_direct_open_seat_edit_still_claims_once_and_preserves_reconnect(self):
        socket = StagingSocket()
        with patch.object(ws_handler, "broadcast_party_rooms"):
            socket.party_room_update_slot(room_id="room-other", slot=2, hero_name="Pilot")
            socket.party_room_join(room_id="room-other")
        self.assertEqual(self.other["slots"][2]["username"], "NewHost")
        self.assertEqual(self.other["slots"][2]["hero_name"], "Pilot")
        self.assertEqual(sum(slot["username"] == "NewHost" for slot in self.other["slots"]), 1)

    def test_room_availability_excludes_closed_ai_and_reserved_seats(self):
        self.assertEqual(party_roster.describe(self.other)["available_slots"], [2, 3])
        self.other["slots"][2]["state"] = "closed"
        self.other["slots"][3]["state"] = "ai"
        self.assertEqual(party_roster.describe(self.other)["available_slots"], [])

    def test_duplicate_create_preserves_chosen_build_and_guest_reservations(self):
        socket = StagingSocket()
        socket.username = "otherHOST"
        self.other["slots"][0].update(hero_name="Pilot", ready=False)
        original = deepcopy(self.other)
        with patch.object(ws_handler, "broadcast_party_rooms"), patch.object(ws_handler.config, "games", {}):
            socket.party_room_create(room_id="room-other", name="Repeated request")
        self.assertEqual(self.other, original)
        self.assertIs(ws_handler.PARTY_ROOMS["room-other"], self.other)

    def test_host_cannot_create_a_second_room_and_leave_an_orphaned_party(self):
        socket = StagingSocket()
        socket.username = "OTHERhost"
        with patch.object(ws_handler, "broadcast_party_rooms"), patch.object(ws_handler.config, "games", {}):
            socket.party_room_create(room_id="second-room")
        self.assertEqual(list(ws_handler.PARTY_ROOMS), ["room-other"])

    def test_second_room_join_and_direct_claim_preserve_existing_membership(self):
        socket = StagingSocket()
        for identity in ("gUeSt", "OTHERhost"):
            for operation in ("party_room_join", "party_room_update_slot"):
                with self.subTest(identity=identity, operation=operation):
                    second = {"room_id": "second-room", "host": "SecondHost",
                              "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
                    second["slots"][0]["username"] = "SecondHost"
                    socket.username = identity
                    original = deepcopy(second)
                    with patch.dict(ws_handler.PARTY_ROOMS, {"second-room": second}), \
                            patch.object(ws_handler, "broadcast_party_rooms"):
                        getattr(socket, operation)(room_id="second-room", slot=2)
                    self.assertEqual(second, original)


if __name__ == "__main__":
    unittest.main()
