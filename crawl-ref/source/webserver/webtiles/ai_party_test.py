"""Decision contracts, native arbitration, stale replies, and prompt continuation."""
import copy
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from webtiles import system_one, party_roster
from webtiles.ai_party import AIParty
from webtiles.ai_prompt import PromptContext
from webtiles.activity_pump import ActivityPump
from webtiles.party_control import PartyControl
from webtiles import ws_handler
from webtiles.process_handler import CrawlProcessHandler


def decision(choice):
    return system_one.Decision(choice, 0.8, "jev-test", 100, 10)


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_http_contract_and_server_side_credentials(self):
        response = dict(model="jev-test", answers=dict(action=dict(type="choice", choice="west",
            confidence=0.7, probabilities=dict(west=0.8, hold=0.2))), usage=dict(input_tokens=100, output_tokens=12))
        http = SimpleNamespace(fetch=AsyncMock(return_value=SimpleNamespace(body=json.dumps(response).encode())))
        with patch.dict("os.environ", TYPESAFE_API_KEY="test-secret"), patch.object(system_one, "_calls", []):
            result = await system_one.decide({"hp": 12}, {"west": "Move west", "hold": "Hold"}, "Choose", http=http)
        request = http.fetch.call_args.args[0]
        self.assertEqual(request.url, "https://api.typesafe.ai/v1/systemone")
        self.assertEqual(request.headers["Authorization"], "Bearer test-secret")
        self.assertFalse(request.follow_redirects)
        self.assertEqual(json.loads(request.body)["questions"]["action"]["criteria"], {"west": "Move west", "hold": "Hold"})
        self.assertEqual(result.choice, "west")

    async def test_missing_key_and_call_limit_do_not_send_request(self):
        http = SimpleNamespace(fetch=AsyncMock())
        with patch.dict("os.environ", TYPESAFE_API_KEY=""):
            with self.assertRaisesRegex(system_one.DecisionError, "TYPESAFE_API_KEY"):
                await system_one.decide({}, {"hold": "Hold"}, "Choose", http)
        with patch.dict("os.environ", TYPESAFE_API_KEY="key", DCSS_AI_CALLS_PER_HOUR="1"), patch.object(system_one, "_calls", [0]):
            with self.assertRaisesRegex(system_one.DecisionError, "hourly"):
                await system_one.decide({}, {"hold": "Hold"}, "Choose", http, now=lambda: 1)
        http.fetch.assert_not_called()

    def test_forged_choice_and_nonfinite_distribution_rejected(self):
        payload = dict(model="test", answers=dict(action=dict(type="choice", choice="quit",
            confidence=0.9, probabilities=dict(hold=1))), usage=dict(input_tokens=0, output_tokens=0))
        for changes in ({}, {"choice": "hold", "confidence": float("nan")},
                        {"choice": "hold", "probabilities": {"hold": -1}},
                        {"choice": "hold", "probabilities": {"other": 1}}):
            bad = copy.deepcopy(payload)
            bad["answers"]["action"].update(changes)
            with self.assertRaises(system_one.DecisionError):
                system_one.parse_decision(bad, {"hold": "Hold"})


class PromptTests(unittest.TestCase):
    def test_text_menu_updates_and_nested_return(self):
        prompt = PromptContext()
        prompt.ingest(dict(msg="txt", id="menu", lines={"1": "<b>Choose</b> &lt;item&gt;"}))
        prompt.ingest(dict(msg="menu", title="Inventory", items=[dict(text="healing potion", hotkeys=[97])]))
        prompt.ingest(dict(msg="update_menu_items", chunk_start=1, items=[dict(text="wand", hotkeys=[98])]))
        self.assertEqual(prompt.choices()["item_1"], (98, "wand"))
        prompt.ingest(dict(msg="menu", title="Nested", type="crt"))
        prompt.ingest(dict(msg="close_menu"))
        self.assertEqual(prompt.state()["menu"]["title"], "Inventory")
        self.assertEqual(prompt.state()["screen"], ["Choose <item>"])

    def test_target_confirm_quantity_and_more_choices(self):
        prompt = PromptContext()
        for mode, key, code in [(2, "target", ord(".")), (8, "yes", ord("y")),
                                (5, "continue", 32), (7, "key_3", ord("3"))]:
            prompt.ingest(dict(msg="input_mode", mode=mode))
            self.assertEqual(prompt.choices()[key][0], code)
        prompt.ingest(dict(msg="cursor", x=7, y=2))
        self.assertEqual(prompt.state()["cursor"]["x"], 7)

    def test_current_confirmation_overrides_underlying_menu(self):
        prompt = PromptContext()
        prompt.ingest(dict(msg="menu", items=[dict(text="potion", hotkeys=[97])]))
        prompt.ingest(dict(msg="input_mode", mode=8))
        self.assertIn("yes", prompt.choices())
        self.assertNotIn("item_0", prompt.choices())

    def test_shortcuts_have_the_heros_item_and_power_meaning(self):
        choices = PromptContext().choices(dict(spells=[dict(letter="b", name="Blink")]))
        self.assertIn("Blink", choices["key_b"][1])


class PartyTests(unittest.TestCase):
    def test_browser_cannot_inject_model_actions_or_native_configuration(self):
        process = SimpleNamespace(conn=Mock())
        for kind in ("ai_configure", "ai_state", "ai_action", "ai_prompt"):
            CrawlProcessHandler.handle_input(process, json.dumps(dict(msg=kind)), SimpleNamespace(username="Host"))
        process.conn.send_message.assert_not_called()

    def test_guests_cannot_manage_ai(self):
        process = SimpleNamespace(party_control=PartyControl("Host", {"Host": 0, "Guest": 1}), ai_party=Mock())
        guest = SimpleNamespace(username="Guest", send_message=Mock())
        CrawlProcessHandler.handle_input(process, json.dumps(dict(msg="ai_control", slot=2, action="pause")), guest)
        process.ai_party.control.assert_not_called()
        self.assertIn("owner", guest.send_message.call_args.kwargs["message"])

    def test_guest_cannot_convert_or_claim_ai_seat(self):
        slot = dict(slot=1, state="ai", username="", hero_name="Jev")
        room = dict(room_id="own", host="Host", slots=[dict(slot=0, username="Host"), slot])
        guest = SimpleNamespace(username="Guest", reset_lobby_timeout=Mock())
        for state in (None, "ai"):
            with patch.object(ws_handler, "_resolve_party_room", return_value=room):
                ws_handler.CrawlWebSocket.party_room_update_slot(guest, slot=1, state=state)
            self.assertEqual(slot, dict(slot=1, state="ai", username="", hero_name="Jev"))

    def test_sparse_human_and_ai_roster_compacts_and_excludes_shared_companion(self):
        slots = [dict(slot=i, state="companion", username="") for i in range(4)]
        slots[0].update(state="player", username="Host")
        slots[2]["state"] = "ai"
        slots[3].update(state="player", username="Guest")
        room = party_roster.describe(dict(slots=slots))
        self.assertEqual(room["launch_slots"], [0, 2, 3])
        self.assertTrue(room["multiplayer"])
        control = PartyControl("Host", {"Host": 0})
        control.ai_slots = {1}
        control.state = dict(multiplayer_protocol=1, player_count=2)
        self.assertEqual(control.claim(SimpleNamespace(username="Guest")), 2)
        self.assertTrue(control.multiplayer)

    def test_launch_without_key_fails_before_native_or_file_changes(self):
        room = dict(room_id="own", host="Host", slots=[dict(slot=0, state="player", username="Host"),
                                                     dict(slot=1, state="ai", username="")])
        socket = SimpleNamespace(username="Host", reset_lobby_timeout=Mock(), is_in_lobby=lambda: True, library_error=Mock())
        with patch.object(ws_handler, "_resolve_party_room", return_value=room), patch.dict("os.environ", TYPESAFE_API_KEY=""), patch("builtins.open") as opened:
            ws_handler.CrawlWebSocket.party_room_launch(socket)
        opened.assert_not_called()
        self.assertIn("TYPESAFE_API_KEY", socket.library_error.call_args.args[0])


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.host = SimpleNamespace(username="Host")
        control = PartyControl("Host", {"Host": 0})
        control.ai_slots = {1}
        control.views[1] = dict(members=[dict(slot=1, name="AI", inventory=[dict(name="potion", slot=0)], spells=[])])
        streams = SimpleNamespace(native_ready=True)
        pump = ActivityPump(control, streams, lambda: {0, 1}, Mock())
        self.process = SimpleNamespace(party_control=control, player_streams=streams, activity_pump=pump,
            _receivers=[self.host], conn=SimpleNamespace(open=True, send_message=Mock()), publish_ai_status=Mock())
        self.model = AsyncMock(return_value=decision("step_west"))
        self.ai = AIParty(self.process, {1}, self.model, now=lambda: 100)
        self.ai.native_connection = self.process.conn
        self.packet = dict(msg="ai_state", revision=1, state=dict(slot=1, can_act=True, hp=10,
            actions=dict(step_west="Move west", wait="Wait"), party=[dict(slot=0, turns=1)]))
        self.ai.ingest(1, self.packet, True)

    def sent(self):
        return json.loads(self.process.conn.send_message.call_args.args[0])

    async def test_action_bound_to_slot_revision_and_native_completion(self):
        await self.ai.tick()
        self.assertEqual(self.sent(), dict(msg="ai_action", player_id=1, choice="step_west", revision=1, activity_id=1))
        self.assertTrue(self.process.activity_pump.inflight)
        self.assertEqual(self.process.activity_pump.owner, 1)
        await self.ai.tick()
        self.model.assert_awaited_once()

    async def test_prompt_is_an_enriched_jev_decision_even_with_queued_human_input(self):
        await self.ai.tick()
        self.ai.next_call = 0
        self.ai.ingest(1, dict(msg="input_mode", mode=8))
        self.ai.ingest(1, dict(msg="msgs", messages=[dict(text="Really drink this potion?")]))
        self.process.activity_pump.queue_input(Mock())
        self.model.return_value = decision("yes")
        await self.ai.tick()
        self.assertEqual(self.sent(), dict(msg="ai_prompt", player_id=1, keycode=ord("y"), mode=8, prompt_activity_id=1))
        state = self.model.call_args.args[0]
        self.assertEqual(state["last_action"], "Move west")
        self.assertIn("Really drink", state["prompt"]["recent_messages"][0])
        self.assertEqual(state["hero"]["inventory"][0]["name"], "potion")

    async def test_stale_observation_is_discarded(self):
        async def changed(*args):
            self.ai.ingest(1, dict(self.packet, revision=2), True)
            return decision("step_west")
        self.ai.decide = changed
        await self.ai.tick()
        self.process.conn.send_message.assert_not_called()
        self.assertFalse(self.process.activity_pump.inflight)

    async def test_stale_prompt_and_pause_discard_delayed_reply(self):
        await self.ai.tick()
        self.ai.next_call = 0
        self.ai.ingest(1, dict(msg="input_mode", mode=8))
        self.process.conn.send_message.reset_mock()
        async def changed(*args):
            self.ai.ingest(1, dict(msg="input_mode", mode=1))
            return decision("yes")
        self.ai.decide = changed
        await self.ai.tick()
        self.process.conn.send_message.assert_not_called()

    async def test_pause_during_request_and_disconnect_never_send(self):
        async def paused(*args):
            self.ai.control(1, "pause")
            return decision("step_west")
        self.ai.decide = paused
        await self.ai.tick()
        self.process.conn.send_message.assert_not_called()
        self.assertEqual(self.ai.status[1]["state"], "paused")
        self.ai.status[1]["state"] = "ready"
        self.ai.next_call = 0
        self.process._receivers.clear()
        await self.ai.tick()
        self.process.conn.send_message.assert_not_called()

    async def test_provider_failure_pauses_with_no_fallback_action(self):
        self.model.side_effect = system_one.DecisionError("unavailable")
        await self.ai.tick()
        self.assertEqual(self.ai.status[1]["state"], "error")
        self.process.conn.send_message.assert_not_called()

    async def test_human_prompt_and_human_command_queue_take_precedence(self):
        pump = self.process.activity_pump
        pump.start_manual(0)
        await self.ai.tick()
        self.model.assert_not_awaited()
        pump.command_boundary(pump.request_id)
        self.process.player_streams.native_ready = True
        pump.queue_action(0, "move", Mock())
        await self.ai.tick()
        self.model.assert_not_awaited()

    async def test_native_configuration_only_contains_reserved_ai_slots(self):
        self.ai.native_connection = None
        await self.ai.tick()
        self.assertEqual(self.sent(), dict(msg="ai_configure", slots=2))
        self.model.assert_not_awaited()

    async def test_hold_never_spends_native_turn_or_repeats_for_same_observation(self):
        self.model.return_value = decision("hold")
        await self.ai.tick()
        self.ai.next_call = 0
        await self.ai.tick()
        self.process.conn.send_message.assert_not_called()
        self.model.assert_awaited_once()

    async def test_owner_can_cancel_a_failed_ai_prompt_without_model_request(self):
        await self.ai.tick()
        self.ai.ingest(1, dict(msg="input_mode", mode=8))
        self.ai.status[1]["state"] = "error"
        self.ai.control(1, "cancel_prompt")
        self.assertEqual(self.sent(), dict(msg="ai_prompt", player_id=1, keycode=27, mode=8, prompt_activity_id=1))
        self.assertEqual(self.ai.status[1]["state"], "paused")

    def test_prompt_messages_are_filtered_by_native_recipient(self):
        self.ai.ingest(1, dict(msg="msgs", messages=[dict(text="own", recipient=1), dict(text="human secret", recipient=0)]))
        self.assertEqual(self.ai.prompts[1].messages, ["own"])

    async def test_blocked_human_queue_does_not_deadlock_ai_initiative(self):
        self.process.party_control.views[1]["members"].append(dict(slot=0, can_act=False))
        self.process.party_control.views[0] = self.process.party_control.views[1]
        self.process.activity_pump.queue_action(0, "move", Mock())
        await self.ai.tick()
        self.assertEqual(self.sent()["msg"], "ai_action")

    async def test_other_floor_refresh_uses_native_view_before_deciding(self):
        self.packet["state"].update(floor="D:1", global_time=10)
        self.ai.ingest(1, self.packet, True)
        self.process.party_control.state = dict(floor="D:2")
        self.process.party_control.views[1].update(floor="D:1", global_time=20)
        self.process._request_native_view = Mock(return_value=True)
        await self.ai.tick()
        self.process._request_native_view.assert_called_once_with(1)
        self.model.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
