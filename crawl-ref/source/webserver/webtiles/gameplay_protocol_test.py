"""Host control is sticky; connected guests cannot impersonate another hero."""
import json
from types import MethodType, SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.party_control import PartyControl


class GameplayProtocolTest(unittest.TestCase):
    def setUp(self):
        self.game = SimpleNamespace(username="Host", party_members={"Host": 0, "Guest": 1},
                                    party_mode=True, conn=Mock(open=True), process=Mock())
        self.game.handle_input = MethodType(CrawlProcessHandler.handle_input, self.game)
        self.game.party_control = PartyControl("Host", self.game.party_members)
        # Raw "input" strings are normalised through handle_input recursively.
        self.game.handle_input = lambda *args, **kwargs: CrawlProcessHandler.handle_input(self.game, *args, **kwargs)
        self.game.party_control.state = {"msg": "party_state", "active_slot": 1, "members": [
            {"slot": slot, "alive": True} for slot in range(4)]}

    def send(self, username, message):
        source = SimpleNamespace(username=username, party_slot=0, send_message=Mock())
        self.game.conn.reset_mock()
        CrawlProcessHandler.handle_input(self.game, json.dumps(message), source)
        return source

    def packet(self):
        return json.loads(self.game.conn.send_message.call_args.args[0])

    def test_host_commands_are_bound_even_after_guest_acts(self):
        self.send("Guest", {"msg": "key", "keycode": 108})
        for message in ({"msg": "key", "keycode": 105, "player_id": 1},
                        {"msg": "click_cell", "x": 10, "y": 20},
                        {"msg": "power_action", "letter": "a"},
                        {"msg": "menu_action", "action": "primary", "entry": 42},
                        {"msg": "floor_item_action", "id": 0}):
            self.send("Host", message)
            self.assertEqual(self.packet()["player_id"], 0)

    def test_solo_control_changes_only_after_native_acknowledgement(self):
        self.game.party_members.pop("Guest")
        self.send("Host", {"msg": "switch_player", "slot": 2})
        self.assertTrue(self.packet()["control_owner"])
        self.assertEqual(self.game.party_control.owner_slot, 0)
        self.game.party_control.acknowledge(2)
        self.send("Host", {"msg": "input", "text": "i"})
        self.assertEqual(self.packet()["player_id"], 2)

    def test_multiplayer_switch_and_cycle_requests_never_reach_native_control(self):
        for username in ("Host", "Guest"):
            for message in ({"msg": "switch_player", "slot": 2, "control_owner": True},
                            {"msg": "cycle_player"},
                            {"msg": "party_action", "action": "switch_player", "slot": 2},
                            {"msg": "party_action", "action": "cycle_player"}):
                source = self.send(username, message)
                self.game.conn.send_message.assert_not_called()
                self.assertIn("assigned hero", source.send_message.call_args.kwargs["message"])
        for username, slot in (("Host", 0), ("Guest", 1)):
            self.send(username, {"msg": "key", "keycode": 105, "player_id": 2})
            self.assertEqual(self.packet()["player_id"], slot)

    def test_owner_cannot_take_a_claimed_hero(self):
        self.send("Host", {"msg": "switch_player", "slot": 1})
        self.game.conn.send_message.assert_not_called()

    def test_solo_cycle_uses_owners_selection(self):
        self.game.party_members.pop("Guest")
        self.game.party_control.acknowledge(1)
        self.send("Host", {"msg": "cycle_player"})
        self.assertEqual(self.packet()["msg"], "switch_player")
        self.assertEqual(self.packet()["slot"], 2)

    def test_unclaimed_connection_cannot_use_stale_client_slot(self):
        self.send("Spectator", {"msg": "key", "keycode": 108, "player_id": 0})
        self.game.conn.send_message.assert_not_called()

    def test_guest_cannot_acknowledge_owner_selection(self):
        self.send("Guest", {"msg": "switch_player", "slot": 1, "control_owner": True})
        self.assertNotIn("control_owner", self.packet())

    def test_guest_identity_always_overwrites_client_identity(self):
        for message in ({"msg": "key", "keycode": 105, "player_id": 3},
                        {"msg": "inv_item_describe", "slot": 0, "player_id": 0},
                        {"msg": "menu_action", "action": "hide", "entry": 42, "player_id": 3},
                        {"msg": "inv_item_use", "slot": 0, "player_id": 0},
                        {"msg": "power_action", "letter": "a", "player_id": 2},
                        {"msg": "floor_item_action", "id": 0, "player_id": 3},
                        {"msg": "party_trade", "slot": 0, "recipient_slot": 0, "player_id": 0}):
            self.send("Guest", message)
            self.assertEqual(self.packet()["player_id"], 1)

    def test_raw_guest_input_is_bound_to_guest(self):
        self.send("Guest", {"msg": "input", "text": "i"})
        self.assertEqual(self.packet(), {"msg": "key", "keycode": 105, "player_id": 1})
        self.game.process.write_input.assert_not_called()

    def test_raw_host_input_is_bound_to_p1(self):
        self.send("Host", {"msg": "input", "data": [104], "text": "j"})
        packets = [json.loads(call.args[0]) for call in self.game.conn.send_message.call_args_list]
        self.assertEqual([packet["player_id"] for packet in packets], [0, 0])
        self.game.process.write_input.assert_not_called()

    def test_closed_game_socket_never_falls_back_to_unbound_terminal_input(self):
        self.game.conn.open = False
        self.send("Host", {"msg": "input", "text": "h"})
        self.game.process.write_input.assert_not_called()

    def test_party_snapshots_are_personalized_without_changing_turn_order(self):
        host = SimpleNamespace(username="Host", append_message=Mock())
        guest = SimpleNamespace(username="Guest", append_message=Mock())
        self.game._receivers = [host, guest]
        CrawlProcessHandlerBase.handle_process_message(
            self.game, json.dumps(self.game.party_control.state), True)
        for receiver, selected in ((host, 0), (guest, 1)):
            packet = json.loads(receiver.append_message.call_args.args[0])
            self.assertEqual(packet["controlled_slot"], selected)
            self.assertEqual(packet["controllable_slots"], [selected])
            self.assertEqual(packet["active_slot"], 1)

    def test_native_control_acknowledgement_is_consumed(self):
        self.game._receivers = [Mock()]
        CrawlProcessHandlerBase.handle_process_message(
            self.game, json.dumps({"msg": "party_control", "slot": 2}), True)
        self.assertEqual(self.game.party_control.selected(SimpleNamespace(username="Host")), 0)
        self.game._receivers[0].append_message.assert_not_called()

    def test_unchanged_snapshots_are_not_retransmitted(self):
        host = SimpleNamespace(username="Host", append_message=Mock())
        guest = SimpleNamespace(username="Guest", append_message=Mock())
        self.game._receivers = [host, guest]
        packet = json.dumps(self.game.party_control.state)
        for _ in range(4):
            CrawlProcessHandlerBase.handle_process_message(self.game, packet, False)
        host.append_message.assert_called_once()
        guest.append_message.assert_called_once()
        # In-flight solo acknowledgements cannot change multiplayer identity.
        self.game.party_control.acknowledge(2)
        CrawlProcessHandlerBase.handle_process_message(self.game, packet, False)
        self.assertEqual(host.append_message.call_count, 1)
        self.assertEqual(guest.append_message.call_count, 1)
        self.assertEqual(json.loads(host.append_message.call_args.args[0])["controlled_slot"], 0)
        # A newly loaded client needs full state even if it was sent previously.
        guest.last_party_snapshot = None
        CrawlProcessHandlerBase.handle_process_message(self.game, packet, False)
        self.assertEqual(guest.append_message.call_count, 2)

    def test_changed_snapshots_and_new_connections_receive_full_state(self):
        host = SimpleNamespace(username="Host", append_message=Mock())
        self.game._receivers = [host]
        for clock in [0, 10]:
            packet = dict(self.game.party_control.state, world_aut_clock=clock)
            CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(packet), True)
        self.assertEqual(host.append_message.call_count, 2)
        guest = SimpleNamespace(username="Guest", append_message=Mock())
        self.game._receivers.append(guest)
        CrawlProcessHandlerBase.handle_process_message(self.game, json.dumps(packet), True)
        guest.append_message.assert_called_once()
        self.assertEqual(json.loads(guest.append_message.call_args.args[0])["world_aut_clock"], 10)

    def test_guest_cannot_change_party_rules_or_other_control(self):
        for message in ({"msg": "toggle_friendly_fire"},
                        {"msg": "party_action", "action": "toggle_simultaneous_turns"},
                        {"msg": "switch_player", "slot": 0},
                        {"msg": "force_terminate", "answer": True},
                        {"msg": "party_action", "action": "cycle_player"}):
            source = self.send("Guest", message)
            self.game.conn.send_message.assert_not_called()
            self.assertEqual(source.send_message.call_args.args[0], "game_action_error")

    def test_guest_can_center_control_on_own_hero(self):
        self.send("Guest", {"msg": "switch_player", "slot": 1})
        self.assertEqual(self.packet()["slot"], 1)

    def test_chat_shortcut_cannot_bypass_party_rule_authority(self):
        self.game.handle_notification = Mock()
        source = SimpleNamespace(username="Guest")
        self.assertTrue(CrawlProcessHandlerBase.handle_chat_command(self.game, source, "/party ff"))
        self.game.conn.send_message.assert_not_called()
        source.username = "Host"
        self.assertTrue(CrawlProcessHandlerBase.handle_chat_command(self.game, source, "/party ff"))
        self.assertEqual(self.packet()["msg"], "toggle_friendly_fire")


if __name__ == "__main__":
    unittest.main()
