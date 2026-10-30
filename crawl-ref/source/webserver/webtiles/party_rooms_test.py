"""Explicit room identities must not fall back to another player's only room."""
from copy import deepcopy
import json
import unittest
from unittest.mock import Mock, patch

from webtiles import party_roster, ws_handler


class StagingSocket:
    username = "NewHost"
    client_closed = False
    reset_lobby_timeout = Mock()
    library_error = Mock()
    party_room_create = ws_handler.CrawlWebSocket.party_room_create
    party_room_apply_comp = ws_handler.CrawlWebSocket.party_room_apply_comp
    party_room_join = ws_handler.CrawlWebSocket.party_room_join
    party_room_update_slot = ws_handler.CrawlWebSocket.party_room_update_slot

    def __init__(self, username=None):
        if username:
            self.username = username
        self.errors = []

    def library_error(self, message):
        self.errors.append(message)


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


class RoomLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.other = {"room_id": "room-other", "host": "OtherHost", "status": "staging",
                      "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        self.other["slots"][0]["username"] = "OtherHost"
        self.other["slots"][1]["username"] = "Guest"
        self.other["slots"][1]["state"] = "player"
        rooms = patch.dict(ws_handler.PARTY_ROOMS, {"room-other": self.other}, clear=True)
        rooms.start()
        self.addCleanup(rooms.stop)
        broadcast = patch.object(ws_handler, "broadcast_party_rooms")
        self.broadcast = broadcast.start()
        self.addCleanup(broadcast.stop)
        games = patch.object(ws_handler.config, "games", {})
        games.start()
        self.addCleanup(games.stop)

    def test_client_room_id_cannot_replace_another_hosts_room(self):
        socket = StagingSocket()
        socket.party_room_create(room_id="room-other")
        self.assertEqual(ws_handler.PARTY_ROOMS["room-other"]["host"], "OtherHost")
        self.assertTrue(socket.errors)
        self.assertNotIn("room-NewHost", ws_handler.PARTY_ROOMS)

    def test_host_keeps_a_single_room(self):
        StagingSocket().party_room_create(room_id="custom-id")
        socket = StagingSocket()
        socket.party_room_create()
        mine = [r["room_id"] for r in ws_handler.PARTY_ROOMS.values() if r["host"] == "NewHost"]
        self.assertEqual(mine, ["custom-id"])
        self.assertTrue(socket.errors)

    def test_joining_another_room_requires_leaving_the_first(self):
        second = {"room_id": "room-second", "host": "Second", "status": "staging",
                  "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        second["slots"][0]["username"] = "Second"
        ws_handler.PARTY_ROOMS["room-second"] = second
        socket = StagingSocket("Guest")
        socket.party_room_join(room_id="room-second")
        self.assertTrue(socket.errors)
        self.assertEqual(second["slots"][1].get("username", ""), "")
        self.assertEqual(self.other["slots"][1]["username"], "Guest")
        self.assertIs(ws_handler._resolve_party_room(username="guest"), self.other)

    def test_a_host_must_leave_before_joining_elsewhere(self):
        StagingSocket().party_room_create()
        socket = StagingSocket()
        socket.party_room_join(room_id="room-other")
        self.assertTrue(socket.errors)
        self.assertNotIn("NewHost", [s["username"] for s in self.other["slots"]])
        self.assertIn("room-NewHost", ws_handler.PARTY_ROOMS)

    def test_departed_users_release_rooms_and_seats_after_grace(self):
        launched = {"room_id": "room-NewHost", "host": "NewHost", "status": "launched",
                    "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        ws_handler.PARTY_ROOMS["room-NewHost"] = launched
        with patch.object(ws_handler, "sockets", set()):
            ws_handler._expire_party_presence("Guest")
            self.assertEqual(self.other["slots"][1]["username"], "")
            ws_handler._expire_party_presence("NewHost")
            self.assertIn("room-NewHost", ws_handler.PARTY_ROOMS, "running games keep their room")
            launched["status"] = "staging"
            ws_handler._expire_party_presence("NewHost")
            self.assertNotIn("room-NewHost", ws_handler.PARTY_ROOMS)
            ws_handler._expire_party_presence("OtherHost")
            self.assertEqual(ws_handler.PARTY_ROOMS, {})
        self.assertEqual(self.broadcast.call_count, 3)

    def test_presence_check_waits_for_other_tabs(self):
        live = StagingSocket("OtherHost")
        with patch.object(ws_handler, "sockets", {live}):
            ws_handler._expire_party_presence("OtherHost")
        self.assertIn("room-other", ws_handler.PARTY_ROOMS)
        self.broadcast.assert_not_called()


class BroadcastTests(unittest.TestCase):
    def test_rooms_are_encoded_once_and_sent_in_one_frame(self):
        room = {"room_id": "room-host", "host": "Host", "status": "staging",
                "slots": deepcopy(ws_handler.DEFAULT_PARTY_SLOTS)}
        lobby = Mock(**{"is_in_lobby.return_value": True})
        playing = Mock(**{"is_in_lobby.return_value": False})
        chronicle = {"ghosts": [], "party_comps": [], "cool_items": []}
        with patch.dict(ws_handler.PARTY_ROOMS, {"room-host": room}, clear=True), \
             patch.object(ws_handler, "sockets", {lobby, playing}), \
             patch.object(ws_handler, "_get_chronicle_payload", return_value=chronicle) as payload:
            ws_handler.broadcast_party_rooms()
        payload.assert_called_once()
        playing.append_message.assert_not_called()
        sends = [call.args[1] for call in lobby.append_message.call_args_list]
        self.assertEqual(sends, [False, True], "both messages share one flush")
        kinds = [json.loads(call.args[0])["msg"] for call in lobby.append_message.call_args_list]
        self.assertEqual(kinds, ["party_rooms_list", "coop_chronicle"])

    def test_no_lobby_sockets_skips_the_chronicle_query(self):
        with patch.dict(ws_handler.PARTY_ROOMS, {}, clear=True), \
             patch.object(ws_handler, "sockets", set()), \
             patch.object(ws_handler, "_get_chronicle_payload") as payload:
            ws_handler.broadcast_party_rooms()
        payload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
