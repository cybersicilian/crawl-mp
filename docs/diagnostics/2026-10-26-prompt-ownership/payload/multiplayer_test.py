"""Human membership and recipient/floor isolation at the server boundary."""
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from webtiles import party_roster
from webtiles.activity_pump import ActivityPump
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.tile_presence import TilePresence


class MultiplayerTest(unittest.TestCase):
    def setUp(self):
        self.host = self.client("Host", 1)
        self.guest = self.client("Guest", 2)
        self.watch = self.client("Spectator", 3)
        self.clients = [self.host, self.guest, self.watch]
        self.control = PartyControl("Host", {"Host": 0, "Guest": 1})
        self.presence = TilePresence()
        self.streams = PlayerStreams(self.control, self.presence)

    @staticmethod
    def client(name, identity):
        return SimpleNamespace(username=name, id=identity, send_message=Mock(),
                               append_message=Mock())

    def packet(self, slot, kind, floor="D:1", view=True, **fields):
        payload = dict(msg=kind, **fields)
        self.streams.ingest(dict(slot=slot, floor=floor, view=view, payload=payload),
                            self.clients, True)
        return payload

    @staticmethod
    def received(client):
        return [json.loads(call.args[0]) for call in client.append_message.call_args_list]

    def test_sparse_launch_excludes_companions_and_preserves_solo_builds(self):
        room = dict(slots=[dict(slot=i, state="companion", username="") for i in range(4)])
        room["slots"][0].update(state="player", username="Host")
        self.assertEqual(party_roster.describe(room)["launch_slots"], [0, 1, 2, 3])
        room["slots"][3].update(state="player", username="Guest")
        self.assertEqual(party_roster.describe(room)["launch_slots"], [0, 3])
        self.assertTrue(party_roster.describe(room)["multiplayer"])
        self.assertEqual(room["slots"][1]["state"], "companion")

    def test_late_join_appends_one_human_without_filler_and_reconnects(self):
        control = PartyControl("Host", {"Host": 0})
        control.state = dict(multiplayer_protocol=1, player_count=1)
        with self.assertRaises(ValueError):
            control.claim(self.guest, 3)
        self.assertEqual(control.claim(self.guest), 1)
        self.assertEqual(control.claim(self.client("gUeSt", 99)), 1)
        control.state["player_count"] = 2
        self.assertEqual(control.claim(self.client("Third", 100)), 2)

    def test_queued_late_joins_have_human_reservations_before_native_acknowledges(self):
        control = PartyControl("Host", {"Host": 0})
        control.state = dict(multiplayer_protocol=1, player_count=1)
        for slot in (1, 2, 3):
            self.assertEqual(control.claim(self.client("Guest%d" % slot, slot)), slot)
        with self.assertRaises(ValueError):
            control.claim(self.client("Fifth", 5))

    def test_anonymous_watchers_cannot_create_a_nonpersistent_character(self):
        anonymous = self.client(None, 90)
        self.assertIsNone(CrawlProcessHandler.join_party_member(SimpleNamespace(), anonymous))
        anonymous.send_message.assert_called_once()

    def test_mixed_legacy_party_is_preserved_before_rejecting_join(self):
        control = PartyControl("Host", {"Host": 0})
        control.state = dict(multiplayer_protocol=1, player_count=3)
        with self.assertRaisesRegex(ValueError, "unclaimed companions"):
            control.claim(self.guest)
        self.assertEqual(control.members, {"Host": 0})
        self.assertEqual(control.state["player_count"], 3)

    def test_private_streams_never_use_union_map_or_other_hero_player(self):
        self.packet(0, "map", view=False, cells=[dict(mon="hidden")])
        self.packet(0, "player", name="HostHero")
        self.packet(1, "player", name="GuestHero")
        self.packet(1, "messages", messages=["A secret monster attacks!"])
        self.assertEqual(self.received(self.host), [dict(msg="player", name="HostHero")])
        self.assertEqual(self.received(self.watch), self.received(self.host))
        self.assertEqual([p["msg"] for p in self.received(self.guest)], ["player", "messages"])

    def test_deferred_messages_retain_their_owner_after_actor_context_changes(self):
        self.packet(0, "msgs", more=True, messages=[dict(recipient=1, text="A hidden orc hits you"),
                                                   dict(recipient=0, text="Your turn")])
        self.assertEqual(self.received(self.host)[0]["messages"], [dict(text="Your turn")])
        self.assertEqual(self.received(self.guest)[0]["messages"], [dict(text="A hidden orc hits you")])
        self.assertNotIn("more", self.received(self.guest)[0])

    def test_floor_and_camera_baselines_remain_personal(self):
        self.packet(0, "map", vgrdc=dict(x=20, y=30), cells=[])
        self.packet(1, "map", floor="D:2", vgrdc=dict(x=10, y=12), cells=[])
        self.packet(0, "map", vgrdc=dict(x=20, y=30), cells=[dict(x=20, y=30)])
        self.assertNotIn("vgrdc", self.received(self.host)[-1])
        self.assertEqual(self.host.party_view_floor, "D:1")
        self.assertEqual(self.guest.party_view_floor, "D:2")
        reconnect = self.client("Guest", 100)
        self.streams.restore(reconnect)
        self.assertEqual(reconnect.party_view_floor, "D:2")
        self.assertEqual(self.received(reconnect)[0]["vgrdc"], dict(x=10, y=12))
        self.assertNotIn("name", self.received(reconnect)[0])

    def test_identical_full_projections_do_not_repaint_idle_clients(self):
        for _ in range(3):
            self.packet(0, "map", cells=[], vgrdc=dict(x=1, y=2))
            self.packet(0, "player", name="HostHero")
        self.assertEqual(len(self.received(self.host)), 2)
        self.assertEqual(len(self.received(self.guest)), 0)

    def test_returning_to_unchanged_floor_still_replaces_the_map(self):
        for floor in ("D:1", "D:2", "D:1"):
            self.packet(0, "map", floor=floor, cells=[], vgrdc=dict(x=1, y=2))
        self.assertEqual(len(self.received(self.host)), 3)
        self.assertEqual(self.host.party_view_floor, "D:1")

    def test_native_restart_resets_identical_map_and_camera_baselines(self):
        envelope = dict(slot=0, floor="D:1", view=True,
                        payload=dict(msg="map", cells=[], vgrdc=dict(x=1, y=2)))
        self.streams.ingest(envelope, self.clients, True)
        restarted = PlayerStreams(self.control, TilePresence())
        restarted.ingest(envelope, self.clients, True)
        self.assertEqual(len(self.received(self.host)), 2)
        self.assertEqual(self.received(self.host)[1]["vgrdc"], dict(x=1, y=2))

    def test_early_reconnect_waits_for_native_command_mode_and_its_own_map(self):
        request = Mock(return_value=True)
        streams = PlayerStreams(self.control, self.presence, request)
        streams.request(self.guest)
        request.assert_not_called()
        streams.note_mode(dict(msg="input_mode", mode=1))
        request.assert_called_once_with(1)
        # A prompt can race a queued request. Retry when it finishes.
        streams.note_mode(dict(msg="input_mode", mode=7))
        streams.note_mode(dict(msg="input_mode", mode=1))
        self.assertEqual(request.call_count, 2)
        streams.ingest(dict(slot=1, floor="D:2", view=True,
                           payload=dict(msg="map", cells=[], vgrdc=dict(x=1,y=2))), self.clients, True)
        streams.note_mode(dict(msg="input_mode", mode=1))
        self.assertEqual(request.call_count, 2)
        self.assertEqual(self.guest.party_view_floor, "D:2")

    def test_reattaching_same_native_process_replays_layout_before_complete_personal_map(self):
        self.packet(0, "layout", message_pane=dict(height=7))
        self.packet(0, "player", name="HostHero")
        self.packet(0, "map", cells=[], vgrdc=dict(x=1, y=2))
        self.host.append_message.reset_mock()
        self.streams.restore(self.host)
        self.assertEqual([packet["msg"] for packet in self.received(self.host)], ["layout", "player", "map"])
        self.assertIn("vgrdc", self.received(self.host)[-1])

    def test_public_party_facts_update_without_replacing_another_floor_or_private_inventory(self):
        own = dict(slot=0, place="D:1", turns=4, inventory=["own gear"], trade_targets=[1])
        self.packet(0, "party_state", members=[own, dict(slot=1, place="D:1")],
                    gold=10, world_aut_clock=40, floor_time=40)
        self.host.append_message.reset_mock()
        self.packet(1, "party_state", floor="D:2", gold=20, world_aut_clock=99, floor_time=99,
                    members=[dict(slot=0, place="D:1", inventory=["wrong context"]),
                             dict(slot=1, place="D:2", turns=5, floor_items=["hidden"] )])
        packet = self.received(self.host)[-1]
        self.assertEqual(packet["floor"], "D:1")
        self.assertEqual(packet["world_aut_clock"], 40)
        self.assertEqual(packet["floor_time"], 40)
        self.assertEqual(packet["gold"], 20)
        self.assertEqual(packet["members"][0]["inventory"], ["own gear"])
        self.assertEqual(packet["members"][0]["trade_targets"], [])
        self.assertFalse(packet["members"][1]["on_same_level"])
        self.assertEqual(packet["members"][1]["floor_items"], [])
        self.assertIn(0, self.streams.pending, "The source floor must clear a departed hero's old proxy view")

    def test_global_time_and_zot_reach_idle_floors_and_reconnects(self):
        self.packet(0, "player", name="HostHero", time=40, time_last_input=35, hp=20, hp_max=20,
                    inv={"a": {"name": "own gear"}})
        own = dict(slot=0, place="D:1", hp=20, hp_max=20, can_act=True,
                   zot_clock={"remaining_aut": 100}, inventory=["own gear"])
        self.packet(0, "party_state", members=[own, dict(slot=1, place="D:2")],
                    global_time=40, world_aut_clock=40, floor_time=40)
        self.host.append_message.reset_mock()
        self.packet(1, "party_state", floor="D:2", global_time=50,
                    world_aut_clock=99, floor_time=99,
                    members=[dict(slot=0, place="D:1", hp=18, hp_max=18,
                                  can_act=False, zot_clock={"remaining_aut": 90},
                                  inventory=["wrong context"]),
                             dict(slot=1, place="D:2", zot_clock={"remaining_aut": 85})])
        player, state = self.received(self.host)[-2:]
        self.assertEqual(player["msg"], "player")
        self.assertEqual(player["time"], 50)
        self.assertEqual(player["time_last_input"], 45)
        self.assertEqual(player["name"], "HostHero")
        self.assertEqual(player["inv"], {"a": {"name": "own gear"}})
        self.assertEqual(player["hp_max"], 18)
        self.assertEqual(state["global_time"], 50)
        self.assertEqual(state["floor"], "D:1")
        self.assertEqual(state["floor_time"], 40)
        self.assertEqual(state["world_aut_clock"], 40)
        self.assertEqual(state["members"][0]["zot_clock"]["remaining_aut"], 90)
        self.assertEqual(state["members"][1]["zot_clock"]["remaining_aut"], 85)
        self.assertTrue(state["members"][0]["can_act"])
        self.assertEqual(state["members"][0]["inventory"], ["own gear"])
        self.assertEqual(own["zot_clock"]["remaining_aut"], 100)
        reconnect = self.client("Host", 100)
        self.streams.restore(reconnect)
        restored = {packet["msg"]: packet for packet in self.received(reconnect)}
        self.assertEqual(restored["player"]["time"], 50)
        self.assertEqual(restored["party_state"]["global_time"], 50)
        self.assertEqual(restored["party_state"]["members"][0]["zot_clock"]["remaining_aut"], 90)

    def test_personal_snapshots_scrub_other_heroes_floor_items(self):
        members = [dict(slot=i, floor_items=["private"], trade_targets=[1-i]) for i in (0, 1)]
        self.packet(0, "party_state", members=members, floor="D:1")
        self.packet(1, "party_state", members=members, floor="D:2")
        host, guest = self.received(self.host)[0], self.received(self.guest)[0]
        self.assertEqual(host["controlled_slot"], 0)
        self.assertEqual(guest["controlled_slot"], 1)
        self.assertEqual(host["floor"], "D:1")
        self.assertEqual(guest["floor"], "D:2")
        self.assertEqual(host["members"][1]["floor_items"], [])
        self.assertEqual(guest["members"][0]["trade_targets"], [])
        self.assertEqual(host["members"][0]["floor_items"], ["private"])

    def test_pointer_floor_change_removes_old_peer_and_rejects_stale_coordinates(self):
        for client in self.clients:
            client.party_view_floor = "D:1"
        self.presence.update(self.guest, dict(x=1, y=2, generation=0, floor="D:1"),
                             dict(slot=1, floor="D:1"), self.clients)
        self.host.send_message.reset_mock()
        self.packet(1, "map", floor="D:2", vgrdc=dict(x=1, y=2), cells=[])
        self.host.send_message.assert_called_once_with("party_hover", id=2, active=False,
                                                       generation=0, floor="D:1")
        self.presence.update(self.guest, dict(x=1, y=2, generation=0, floor="D:1"),
                             dict(slot=1, floor="D:2"), self.clients)
        self.assertEqual(self.presence.pointers, {})

    def test_browser_cannot_request_private_views_or_change_native_mode(self):
        game = SimpleNamespace(conn=Mock())
        for kind in ("view_player", "party_session", "party_packet", "attach", "spectator_joined", "party_activity_step"):
            CrawlProcessHandler.handle_input(game, json.dumps(dict(msg=kind, slot=0)), self.guest)
        game.conn.send_message.assert_not_called()

    def test_peer_keys_cannot_wait_in_queue_to_answer_an_owned_native_prompt(self):
        streams = SimpleNamespace(native_ready=True)
        pump = ActivityPump(self.control, streams, lambda: {0, 1}, Mock())
        pump.start_manual(1)
        pump.prompt = True
        game = SimpleNamespace(party_control=self.control, activity_pump=pump, conn=Mock())
        CrawlProcessHandler.handle_input(game, json.dumps(dict(msg="key", keycode=106)), self.host)
        self.host.send_message.assert_called_once_with("game_action_error",
            message="Another hero is finishing an action. Your view is unchanged.")
        self.assertFalse(pump.inputs)
        game.conn.send_message.assert_not_called()
        CrawlProcessHandler.handle_input(game, json.dumps(dict(msg="key", keycode=27)), self.guest)
        self.assertEqual(json.loads(game.conn.send_message.call_args.args[0])["player_id"], 1)

    def command_game(self):
        streams = SimpleNamespace(native_ready=True)
        pump = ActivityPump(self.control, streams, lambda: {0, 1}, Mock())
        game = SimpleNamespace(party_control=self.control, activity_pump=pump,
                               player_streams=streams, conn=Mock(open=True), process=True,
                               party_mode=True, username="Host", _receivers=self.clients)
        game.handle_input = lambda message, source, **bindings: CrawlProcessHandler.handle_input(game, message, source, **bindings)
        return game, pump

    def test_repeated_owner_keys_wait_for_exact_command_completion(self):
        game, pump = self.command_game()
        first = pump.start_manual(0)
        game.handle_input(json.dumps(dict(msg="key", keycode=106)), self.host)
        game.handle_input(json.dumps(dict(msg="key", keycode=108)), self.guest)
        game.conn.send_message.assert_not_called()
        self.assertEqual(len(pump.inputs), 2)
        pump.command_boundary(first)
        packets = [json.loads(call.args[0]) for call in game.conn.send_message.call_args_list]
        self.assertEqual([(packet["player_id"], packet["activity_id"]) for packet in packets], [(0, first + 1)])
        pump.command_boundary(pump.request_id)
        self.assertEqual(json.loads(game.conn.send_message.call_args.args[0])["player_id"], 1)

    def test_automated_prompt_keeps_ownership_and_accepts_its_owners_response(self):
        game, pump = self.command_game()
        request = pump.start_manual(1)
        pump.manual = False
        pump.prompt_boundary()
        game.handle_input(json.dumps(dict(msg="key", keycode=27)), self.guest)
        response = json.loads(game.conn.send_message.call_args.args[0])
        self.assertEqual(response["prompt_activity_id"], request)
        self.assertEqual(response["player_id"], 1)
        self.assertTrue(pump.inflight)
        game.handle_input(json.dumps(dict(msg="key", keycode=106)), self.host)
        self.host.send_message.assert_called_once()

    def test_native_automation_prompt_does_not_release_the_command_token(self):
        pump = ActivityPump(self.control, self.streams, lambda: {0, 1}, Mock())
        self.streams.native_ready = True
        request = pump.start_manual(1)
        pump.manual = False
        game = SimpleNamespace(party_control=self.control, activity_pump=pump,
                               player_streams=self.streams, _receivers=self.clients)
        CrawlProcessHandlerBase.handle_process_message(game, json.dumps(dict(
            msg="party_packet", slot=1, floor="D:1", view=False,
            payload=dict(msg="input_mode", mode=8))), True)
        self.assertTrue(pump.inflight)
        self.assertTrue(pump.prompt)
        self.assertEqual(pump.request_id, request)
        self.assertEqual(pump.owner, 1)
        self.assertFalse(self.streams.native_ready)

    def test_raw_input_uses_one_tracked_command_per_character(self):
        game, pump = self.command_game()
        game.handle_input(json.dumps(dict(msg="input", text="hj")), self.host)
        self.assertEqual(game.conn.send_message.call_count, 1)
        self.assertEqual(len(pump.inputs), 1)
        pump.command_boundary(pump.request_id)
        packets = [json.loads(call.args[0]) for call in game.conn.send_message.call_args_list]
        self.assertEqual([packet["keycode"] for packet in packets], [104, 106])
        self.assertEqual([packet["activity_id"] for packet in packets], [1, 2])


if __name__ == "__main__":
    unittest.main()
