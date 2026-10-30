"""Connection changes publish live status without changing reservations."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles.party_control import PartyControl
from webtiles.process_handler import CrawlProcessHandlerBase


class PartyConnectionTest(unittest.TestCase):
    def test_attach_disconnect_and_same_account_tab_keep_correct_presence(self):
        class Receiver:
            def __init__(self, name):
                self.username = name
                self.append_message = Mock()

        host, guest, second_tab = Receiver("Host"), Receiver("Guest"), Receiver("gUeSt")
        game = SimpleNamespace(client_path=None, _receivers={host}, tile_presence=Mock(),
                               update_watcher_description=Mock())
        game.party_control = PartyControl("Host", {"Host": 0, "Guest": 1},
            lambda: {game.party_control.reservation(receiver) for receiver in game._receivers})
        game.party_control.state = dict(msg="party_state", members=[dict(slot=0), dict(slot=1)])
        game.publish_party_status = lambda: CrawlProcessHandlerBase.publish_party_status(game)
        CrawlProcessHandlerBase.add_watcher(game, guest)
        self.assertTrue(json.loads(host.append_message.call_args.args[0])["members"][1]["connected"])
        CrawlProcessHandlerBase.add_watcher(game, second_tab)
        CrawlProcessHandlerBase.remove_watcher(game, guest)
        self.assertTrue(json.loads(host.append_message.call_args.args[0])["members"][1]["connected"])
        CrawlProcessHandlerBase.remove_watcher(game, second_tab)
        self.assertFalse(json.loads(host.append_message.call_args.args[0])["members"][1]["connected"])
        self.assertEqual(game.party_control.members, {"Host": 0, "Guest": 1})
