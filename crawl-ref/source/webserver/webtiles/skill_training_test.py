"""Training messages are scoped to the authenticated hero or expedition owner."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.process_handler import CrawlProcessHandler
from webtiles.party_control import PartyControl


class TrainingAuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.game = SimpleNamespace(username="Host", party_members={"Host": 0, "Guest": 1},
                                    conn=Mock(open=True), process=None)
        self.game.party_control = PartyControl("Host", self.game.party_members)

    def request(self, username, slot, **extra):
        source = SimpleNamespace(username=username, party_slot=0, send_message=Mock())
        message = dict(msg="skill_training", action="target", slot=slot, skill=0,
                       target=125, base=False, request_id="test-request", **extra)
        self.game.conn.reset_mock()
        CrawlProcessHandler.handle_input(self.game, json.dumps(message), source)
        return source

    def test_solo_owner_can_edit_every_party_slot(self):
        self.game.party_members.pop("Guest")
        for slot in range(4):
            self.request("Host", slot)
            self.game.conn.send_message.assert_called_once()

    def test_multiplayer_owner_can_edit_only_own_hero(self):
        self.request("Host", 0)
        self.game.conn.send_message.assert_called_once()
        for slot in (1, 2, 3):
            self.request("Host", slot)
            self.game.conn.send_message.assert_not_called()

    def test_member_can_edit_own_hero(self):
        self.request("Guest", 1)
        self.game.conn.send_message.assert_called_once()

    def test_member_cannot_spoof_a_different_hero(self):
        source = self.request("Guest", 0, player_id=0)
        self.game.conn.send_message.assert_not_called()
        source.send_message.assert_called_once()
        self.assertFalse(source.send_message.call_args.kwargs["ok"])

    def test_unclaimed_spectator_and_anonymous_are_rejected(self):
        for username in ("Spectator", None):
            self.request(username, 0)
            self.game.conn.send_message.assert_not_called()

    def test_invalid_slots_never_reach_the_engine(self):
        for slot in (None, -1, 4, 1.5, True, "1", [], {}):
            self.request("Host", slot)
            self.game.conn.send_message.assert_not_called()


if __name__ == "__main__":
    unittest.main()
