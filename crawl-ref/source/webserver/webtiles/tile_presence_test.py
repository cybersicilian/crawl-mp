"""Presence identity, map isolation, bounded traffic and disconnect cleanup."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles.party_control import PartyControl
from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.tile_presence import TilePresence


class TilePresenceTest(unittest.TestCase):
    def setUp(self):
        self.now = 10
        self.presence = TilePresence(lambda: self.now)
        self.host = SimpleNamespace(id=1, username="Host", send_message=Mock())
        self.guest = SimpleNamespace(id=2, username="Guest", send_message=Mock())
        self.spectator = SimpleNamespace(id=3, username="Watcher", send_message=Mock())
        self.receivers = [self.host, self.guest, self.spectator]
        self.game = SimpleNamespace(username="Host", tile_presence=self.presence,
            party_control=PartyControl("Host", {"Host": 0, "Guest": 1}),
            _receivers=self.receivers, conn=Mock())
        self.game.party_control.views = {0: dict(floor="D:1"), 1: dict(floor="D:1")}
        for receiver in self.receivers:
            receiver.party_view_floor = "D:1"

    def send(self, source=None, **data):
        packet = dict(msg="party_hover", x=-3, y=5, floor="D:1", generation=self.presence.generation)
        packet.update(data)
        CrawlProcessHandler.handle_input(self.game, json.dumps(packet), source or self.host)

    def test_identity_is_server_owned_and_sender_is_excluded(self):
        self.send(self.guest, slot=0, id=999, user="Host")
        self.host.send_message.assert_called_once_with("party_hover", id=2,
            user="Guest", slot=1, x=-3, y=5, floor="D:1", active=True, generation=0)
        self.guest.send_message.assert_not_called()
        self.spectator.send_message.assert_called_once()
        self.game.conn.send_message.assert_not_called()

    def test_unclaimed_spectator_cannot_publish(self):
        self.send(self.spectator)
        self.assertEqual(self.presence.pointers, {})
        self.game.conn.send_message.assert_not_called()

    def test_ping_is_echoed_to_sender_and_same_floor_peers_without_native_input(self):
        self.guest.party_view_floor = "D:2"
        self.send(msg="party_ping", kind="danger", user="Someone else")
        expected = dict(user="Host", x=-3, y=5, floor="D:1", kind="danger")
        self.host.send_message.assert_called_once_with("party_ping", **expected)
        self.spectator.send_message.assert_called_once_with("party_ping", **expected)
        self.guest.send_message.assert_not_called()
        self.game.conn.send_message.assert_not_called()

    def test_ping_sender_does_not_depend_on_reconnect_delivery_metadata(self):
        del self.guest.party_view_floor
        self.send(self.guest, msg="party_ping", kind="loot")
        self.guest.send_message.assert_called_once_with("party_ping", user="Guest",
            x=-3, y=5, floor="D:1", kind="loot")
        self.game.conn.send_message.assert_not_called()

    def test_ping_rejects_old_or_missing_floor_and_unclaimed_sender(self):
        for source, fields in ((self.host, {"floor": "D:2"}),
                               (self.host, {"floor": None}),
                               (self.spectator, {}),
                               (self.host, {"x": True})):
            self.send(source, msg="party_ping", **fields)
        for receiver in self.receivers:
            receiver.send_message.assert_not_called()
        self.game.conn.send_message.assert_not_called()

    def test_ping_does_not_wait_for_another_players_native_prompt(self):
        self.game.activity_pump = SimpleNamespace(inflight=True, manual=True,
            owner=1, prompt=True, queue_input=Mock())
        self.send(msg="party_ping")
        self.host.send_message.assert_called_once()
        self.game.activity_pump.queue_input.assert_not_called()
        self.game.conn.send_message.assert_not_called()

    def test_hover_routes_only_to_this_expedition(self):
        outsider = SimpleNamespace(id=4, send_message=Mock())
        self.send()
        outsider.send_message.assert_not_called()
        self.guest.send_message.assert_called_once()

    def test_malformed_coordinates_and_old_generations_are_ignored(self):
        for data in ({"x": True}, {"x": 1.5}, {"y": "5"}, {"x": None},
                     {"y": 257}, {"generation": -1}, {"generation": False}):
            self.send(**data)
        self.assertEqual(self.presence.pointers, {})
        self.guest.send_message.assert_not_called()

    def test_moves_are_throttled_but_leave_is_immediate(self):
        self.send()
        self.send(x=2)
        self.assertEqual(self.guest.send_message.call_count, 1)
        self.send(active=False)
        self.guest.send_message.assert_called_with("party_hover", id=1, active=False, generation=0, floor="D:1")
        self.assertEqual(self.presence.pointers, {})

    def test_stationary_heartbeat_and_late_join_lease(self):
        self.send()
        self.now += 2
        self.send()
        self.assertEqual(self.guest.send_message.call_count, 2)
        late = SimpleNamespace(id=8, party_view_floor="D:1", send_message=Mock())
        self.presence.sync(late)
        self.assertEqual(late.send_message.call_count, 2)
        self.now += 7
        late.send_message.reset_mock()
        self.presence.sync(late)
        late.send_message.assert_called_once_with("party_hover_reset", generation=0)

    def test_disconnect_removes_only_that_connection(self):
        self.send()
        self.send(self.guest)
        self.presence.remove(self.guest, self.receivers)
        self.assertEqual(set(self.presence.pointers), {1})
        self.host.send_message.assert_called_with("party_hover", id=2, active=False, generation=0, floor="D:1")

    def test_map_reset_rejects_in_flight_old_coordinates(self):
        self.send()
        self.presence.reset(self.receivers)
        self.assertEqual(self.presence.pointers, {})
        self.guest.send_message.reset_mock()
        self.send(generation=0)
        self.guest.send_message.assert_not_called()
        self.send(generation=1)
        self.guest.send_message.assert_called_once()

    def test_native_map_reset_clears_presence_but_spectator_refresh_does_not(self):
        self.game._is_full_map_msg = lambda msg: CrawlProcessHandlerBase._is_full_map_msg(self.game, msg)
        self.game._is_spectator_only = lambda msg: CrawlProcessHandlerBase._is_spectator_only(self.game, msg)
        self.game._fresh_watchers = set()
        self.game._receivers = [Mock()]
        self.send()
        for packet, generation in (({"msg": "map", "clear": True, "spect_only": True}, 0),
                                   ({"msg": "map", "clear": True}, 1)):
            CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(packet), True)
            self.assertEqual(self.presence.generation, generation)


if __name__ == "__main__":
    unittest.main()
