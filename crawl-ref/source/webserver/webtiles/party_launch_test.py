"""Launch failures and retries must preserve staging and real guest ownership."""
from copy import deepcopy
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles import config, ws_handler


class LaunchSocket:
    party_room_launch = ws_handler.CrawlWebSocket.party_room_launch
    username = "Host"

    def is_in_lobby(self):
        return self.process is None

    def rcfile_path(self, game_id):
        return self.rc_path


class PartyLaunchTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="dcss-launch-contract-")
        self.addCleanup(temporary.cleanup)
        self.socket = LaunchSocket()
        self.socket.rc_path = str(Path(temporary.name) / "Host.rc")
        self.socket.process = None
        self.socket.reset_lobby_timeout = Mock()
        self.socket.library_error = Mock()
        self.socket.logger = Mock()
        self.socket.start_crawl = Mock(side_effect=lambda game_id, **kwargs: self.socket.library_error("Fixture preflight denial"))
        self.room = dict(room_id="room-host", host="Host", game_id="coop", status="staging",
                         slots=deepcopy(ws_handler.DEFAULT_PARTY_SLOTS))
        self.room["slots"][0]["username"] = "Host"
        self.room["slots"][1]["state"] = "closed"
        self.room["slots"][3].update(state="player", username="Guest", hero_name="Chosen")
        self.previous = dict(party_arg="previous", slot_users={"Host": 0})
        self.guest = Mock()
        changes = [patch.dict(ws_handler.PARTY_ROOMS, {"room-host": self.room}, clear=True),
                   patch.dict(ws_handler.USER_PARTY_SPECS, {"Host": self.previous}, clear=True),
                   patch.object(config, "games", {"coop": {}})]
        for change in changes:
            change.start()
            self.addCleanup(change.stop)
        for name in ("broadcast_party_rooms", "chronicle.record_party_comp", "IOLoop", "find_user_sockets"):
            change = patch("webtiles.ws_handler." + name)
            value = change.start()
            setattr(self, name.split(".")[-1], value)
            self.addCleanup(change.stop)
        self.find_user_sockets.return_value = [self.guest]

    def successful_start(self, game_id, **kwargs):
        self.socket.process = SimpleNamespace(record_id="fresh-game")

    def assert_failed_start(self):
        self.assertEqual(self.room["status"], "staging")
        self.assertIs(ws_handler.USER_PARTY_SPECS["Host"], self.previous)
        self.assertEqual(self.room["slots"][3]["hero_name"], "Chosen")
        self.guest.send_message.assert_not_called()
        self.record_party_comp.assert_not_called()
        self.socket.library_error.assert_called_once()

    def test_preflight_failure_leaves_staging_and_restores_prior_spec(self):
        self.socket.party_room_launch()
        self.assert_failed_start()

    def test_start_exception_leaves_staging_and_restores_prior_spec(self):
        self.socket.start_crawl.side_effect = OSError("fixture launch failure")
        self.socket.party_room_launch()
        self.assert_failed_start()

    def test_retry_without_prior_spec_does_not_keep_a_failed_launch(self):
        ws_handler.USER_PARTY_SPECS.clear()
        self.socket.party_room_launch()
        self.assertNotIn("Host", ws_handler.USER_PARTY_SPECS)
        self.assertEqual(self.room["status"], "staging")
        self.socket.start_crawl.side_effect = self.successful_start
        self.socket.party_room_launch()
        self.assertEqual(self.room["status"], "launched")
        self.assertEqual(ws_handler.USER_PARTY_SPECS["Host"]["slot_users"], {"Host": 0, "Guest": 1})
        self.assertEqual(self.socket.start_crawl.call_count, 2)
        self.assertEqual(self.guest.send_message.call_count, 1)

    def test_another_host_tab_cannot_launch_a_running_room_again(self):
        self.room["status"] = "launched"
        self.socket.party_room_launch()
        self.socket.start_crawl.assert_not_called()
        self.assertIs(ws_handler.USER_PARTY_SPECS["Host"], self.previous)
        self.guest.send_message.assert_not_called()

    def test_delayed_notification_does_not_join_an_ended_or_replaced_game(self):
        self.socket.start_crawl.side_effect = self.successful_start
        self.socket.party_room_launch()
        callback = self.IOLoop.current.return_value.call_later.call_args.args[1]
        self.guest.send_message.reset_mock()
        self.socket.process = None
        self.room["status"] = "staging"
        callback()
        self.guest.send_message.assert_not_called()

    def test_success_notifies_the_compacted_native_seat(self):
        self.socket.start_crawl.side_effect = self.successful_start
        self.socket.party_room_launch()
        self.assertEqual(self.room["status"], "launched")
        self.socket.start_crawl.assert_called_once_with("coop", character_name="Aldric")
        self.guest.send_message.assert_called_once_with("party_room_launched", room_id="room-host",
                                                      host="Host", slot=1, hero_name="Chosen")
        self.record_party_comp.assert_called_once()
