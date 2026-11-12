"""GHSA-6wf6-39j3-jrjf: a spectator cannot take a hero without the owner's consent."""
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles import ws_handler
from webtiles.party_control import PartyControl
from webtiles.process_handler import CrawlProcessHandler


class Watcher(SimpleNamespace):
    __hash__ = object.__hash__


def watcher(name):
    return Watcher(username=name, id=abs(hash(name)) % 1000, send_message=Mock(),
                   party_member_active=False, client_closed=False)


class JoinConsentTests(unittest.TestCase):
    def setUp(self):
        rooms = patch.dict(ws_handler.PARTY_ROOMS, {}, clear=True)
        rooms.start()
        self.addCleanup(rooms.stop)
        game = CrawlProcessHandler.__new__(CrawlProcessHandler)
        game.username = "Host"
        game.record_id = None
        game.party_members = {"Host": 0}
        game.party_control = PartyControl("Host", game.party_members)
        game.party_control.state = dict(multiplayer_protocol=1, player_count=1)
        game.party_mode = False
        game.player_streams = Mock()
        game._receivers = set()
        game.notes = []
        game.handle_notification = lambda user, text: game.notes.append((user, text))
        self.game = game

    def watch(self, name):
        w = watcher(name)
        self.game._receivers.add(w)
        return w

    def test_stranger_join_becomes_a_request_and_takes_no_seat(self):
        stranger = self.watch("Stranger")
        self.assertIsNone(self.game.join_party_member(stranger))
        self.assertEqual(self.game.party_members, {"Host": 0})
        self.assertIn("Stranger", self.game.notes[0][1])
        self.assertEqual(self.game.notes[0][0], "Host")

    def test_owner_accept_seats_the_requester(self):
        stranger = self.watch("Stranger")
        self.game.join_party_member(stranger)
        self.game.party_owner_command("Host", "accept", "stranger")
        self.assertEqual(self.game.party_members.get("Stranger"), 1)
        stranger.send_message.assert_any_call("party_joined", slot=1)

    def test_only_the_owner_can_accept(self):
        stranger = self.watch("Stranger")
        self.game.join_party_member(stranger)
        self.game.party_owner_command("Stranger", "accept", "Stranger")
        self.assertNotIn("Stranger", self.game.party_members)

    def test_deny_and_remove(self):
        stranger = self.watch("Stranger")
        self.game.join_party_member(stranger)
        self.game.party_owner_command("Host", "deny", "Stranger")
        self.game.party_owner_command("Host", "accept", "Stranger")
        self.assertNotIn("Stranger", self.game.party_members)
        self.game.party_members["Saved"] = 2
        self.game.party_owner_command("Host", "remove", "saved")
        self.assertNotIn("Saved", self.game.party_members)
        self.game.party_owner_command("Host", "remove", "host")
        self.assertIn("Host", self.game.party_members)

    def test_launched_room_roster_and_private_invite_join_directly(self):
        room = {"room_id": "room-Host", "host": "Host", "status": "launched", "visibility": "private",
                "invite_token": "tok", "slots": [{"slot": 0, "username": "Host"},
                                                 {"slot": 1, "username": "Friend"}]}
        ws_handler.PARTY_ROOMS["room-Host"] = room
        self.assertEqual(self.game.join_party_member(self.watch("Friend")), 1)
        invited = self.watch("Invited")
        invited.party_invites = {"room-Host": "tok"}
        self.assertEqual(self.game.join_party_member(invited), 2)
        room["visibility"] = "public"
        self.assertIsNone(self.game.join_party_member(self.watch("Passerby")))

    def test_no_new_seat_before_the_engine_reports_state(self):
        self.game.party_control.state = None
        self.game.party_approved = {"stranger"}
        stranger = self.watch("Stranger")
        self.assertIsNone(self.game.join_party_member(stranger))
        self.assertNotIn("Stranger", self.game.party_members)

    def test_chat_command_routes_owner_actions(self):
        stranger = self.watch("Stranger")
        self.game.join_party_member(stranger)
        host = SimpleNamespace(username="Host")
        with patch.object(CrawlProcessHandler, "is_player", return_value=True, create=True):
            self.assertTrue(self.game.handle_chat_command(host, "/party accept Stranger"))
        self.assertEqual(self.game.party_members.get("Stranger"), 1)


if __name__ == "__main__":
    unittest.main()
