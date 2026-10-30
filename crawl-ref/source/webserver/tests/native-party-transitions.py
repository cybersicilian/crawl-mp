"""Three native humans retain personal views through off-floor resurrection."""
import argparse
import importlib.util
import json
import hashlib
from pathlib import Path
import unittest

from tornado.testing import gen_test

from helpers.native_party_fixture import NativePartyFixture
from helpers.native_transport import NativeCompletionHold

spec = importlib.util.spec_from_file_location("native_recovery", Path(__file__).with_name("native-websocket-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class TransitionTests(recovery.NativeRecoveryTests):
    @staticmethod
    def send(connection, kind, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))

    @staticmethod
    def member(game, viewer, slot):
        return next((member for member in game.party_control.views.get(viewer, {}).get("members", [])
                     if member["slot"] == slot), {})

    @staticmethod
    def inventory(player):
        # Usefulness and its color change when resurrection restores half MP.
        return {slot: {key: value for key, value in item.items() if key not in {"col", "useless"}}
                for slot, item in player.get("inv", {}).items()}

    def turns(self, game):
        # An idle native floor's last packet can predate remote actions. Read
        # each actor's personal server stream, whose public facts are merged.
        return [self.member(game, slot, slot)["turns"] for slot in range(3)]

    async def open_lua(self, connection, fixture, game):
        start = len(fixture.probe.packets)
        self.send(connection, "key", keycode=38)
        await self.wait_for(lambda: fixture.has_text("Enter Wizard Command", start), "Wizard command")
        start = len(fixture.probe.packets)
        if REPORT["expect_cap_cost"]:
            self.assertTrue(game.activity_pump.prompt, "Combined engine must expose the wizard prompt")
        if game.activity_pump.prompt:
            self.send(connection, "key", keycode=20)
            REPORT["wizard_selector_uses_production_routing"] = True
        else:
            # The earlier engine reports the private selector as mode 0/busy.
            fixture.probe.send("key", keycode=20, player_id=1,
                               prompt_activity_id=game.activity_pump.request_id)
            REPORT["privileged_wizard_mode0_fixture_seam"] = True
        await self.wait_for(lambda: any(packet.get("msg") == "init_input"
            for packet in fixture.payloads(start)), "Lua input")

    @gen_test(timeout=240)
    async def test_off_floor_resurrection_refreshes_private_views(self):
        def prepare(probe):
            fixture = NativePartyFixture(probe, REPORT)
            fixture.split_floors(3, separate_regions=False)
            fixture.lua(1, 'debug.disable("death",false)')
            fixture.command(0, 0)

        async with self.native_session(players=3, setup=prepare) as (
                probe, game, host_connection, host, guest_connection, guest):
            fixture = NativePartyFixture(probe, REPORT)
            third_connection, third = self.party_connections["Third"]
            await self.wait_for(lambda: not game.player_streams.pending and self.settled(probe, game),
                                "Prepared personal views")
            self.assertEqual([game.party_control.views[slot]["floor"] for slot in range(3)], ["D:1", "D:1", "D:2"])
            own_inventory = self.inventory(game.player_streams.cached[1]["player"][0])
            caps = [self.member(game, slot, slot).get("xl_cap") for slot in range(3)]
            if REPORT["expect_cap_cost"]:
                self.assertEqual(caps, [27, 27, 27])
            before = self.turns(game)
            await self.open_lua(guest_connection, fixture, game)
            start = len(probe.packets)
            self.send(guest_connection, "text_input", text='you.die(); crawl.mpr("TRANSITION_DEATH_DONE")\r')
            await self.wait_for(lambda: any(packet.get("msg") == "menu"
                and "Die?" in packet.get("title", {}).get("text", "")
                for packet in fixture.payloads(start)), "Native death confirmation")
            self.send(guest_connection, "key", keycode=ord("Y"))
            await self.wait_for(lambda: "TRANSITION_DEATH_DONE" in fixture.message_fragments(start), "Native downing")
            self.send(guest_connection, "key", keycode=27)
            await self.wait_for(lambda: self.settled(probe, game)
                and all(self.member(game, viewer, 1).get("ghost_haunting") for viewer in range(3)),
                "Downing reaches every personal view")
            self.assertEqual(self.turns(game), before, "Wizard fixture downing must not advance a hero")
            self.assertEqual(game.party_control.selected(guest), 1)
            self.assertEqual(game.player_streams.cached[1]["player"][0]["name"], "TokenPeer")
            REPORT["downing_reaches_all_floors"] = True
            self.send(guest_connection, "key", keycode=46)
            error = await self.read_until(guest_connection, "game_action_error")
            self.assertIn("recovery", error["message"])
            await self.wait_for(lambda: self.settled(probe, game), "Downed input rejection completion")
            self.assertEqual(self.turns(game), before)
            REPORT["downed_input_rejected_without_stall_or_turn"] = True
            with NativeCompletionHold(probe, game.activity_pump.request_id + 1) as hold:
                self.send(third_connection, "key", keycode=0)
                await self.wait_for(lambda: bool(hold.held), "Real peer completion delayed")
                self.send(guest_connection, "key", keycode=46)
                error = await self.read_until(guest_connection, "game_action_error")
                self.assertIn("downed", error["message"])
                self.assertFalse(game.activity_pump.inputs)
                hold.release()
            await self.wait_for(lambda: self.settled(probe, game), "Delayed completion released")
            REPORT["downed_gameplay_not_buffered_during_peer_action"] = True

            items = game.player_streams.cached[2]["player"][0].get("inv", {})
            scroll = next(int(slot) for slot, item in items.items()
                          if "soul recall" in item.get("name", "").lower() and item.get("quantity", 0) > 0)
            idle_clock = game.party_control.views[0]["floor_time"]
            self.send(third_connection, "inv_item_action", slot=scroll)
            await self.wait_for(lambda: self.settled(probe, game)
                and not game.player_streams.pending and guest.party_view_floor == "D:2"
                and all(self.member(game, viewer, 1).get("alive")
                        and not self.member(game, viewer, 1).get("ghost_haunting") for viewer in range(3)),
                "Remote resurrection and refreshed personal maps")
            self.assertEqual([game.party_control.views[slot]["floor"] for slot in range(3)], ["D:1", "D:2", "D:2"])
            self.assertEqual(game.player_streams.maps[1].floor, "D:2")
            self.assertEqual(guest.personal_center[0], "D:2")
            self.assertEqual(game.player_streams.cached[1]["player"][1], "D:2")
            self.assertEqual(game.player_streams.cached[1]["player"][0]["name"], "TokenPeer")
            self.assertEqual(self.inventory(game.player_streams.cached[1]["player"][0]), own_inventory)
            self.assertEqual(game.player_streams.maps[0].floor, "D:1")
            self.assertEqual(game.party_control.views[0]["floor_time"], idle_clock)
            self.assertFalse(self.member(game, 0, 1)["on_same_level"])
            self.assertEqual(self.member(game, 1, 1)["hp"], max(1, self.member(game, 1, 1)["hp_max"] // 2))
            self.assertEqual(self.turns(game), [before[0], before[1], before[2] + 1])
            if REPORT["expect_cap_cost"]:
                expected = [caps[0], caps[1] - 1, caps[2]]
                for viewer in range(3):
                    self.assertEqual([self.member(game, viewer, slot).get("xl_cap") for slot in range(3)], expected)
                new_connection, new_guest = await self.connect_user("Guest")
                new_guest.watched_game = game
                new_guest.party_member_active, new_guest.party_slot = True, 1
                game.add_watcher(new_guest)
                guest_connection.close(code=1001)
                await self.wait_for(lambda: guest.client_closed, "Old guest connection closes")
                snapshot = await self.read_until(new_connection, "party_state")
                self.assertEqual(snapshot["controlled_slot"], 1)
                self.assertEqual([member.get("xl_cap") for member in snapshot["members"]], expected)
                guest_connection, guest = new_connection, new_guest
                REPORT.update(personal_cap_cost_once=True, cross_floor_caps=expected,
                              caps_preserved_across_guest_reconnect=True)
            REPORT.update(off_floor_resurrection=True, personal_map_and_camera_follow_own_hero=True,
                          own_inventory_preserved=True, idle_floor_unchanged=True, no_control_transfer=True)
            before = self.turns(game)
            self.send(guest_connection, "key", keycode=46)
            await self.wait_for(lambda: self.settled(probe, game) and self.turns(game)[1] == before[1] + 1,
                                "Revived guest acts on the destination floor")
            self.assertEqual(self.turns(game)[0], before[0])
            self.assertEqual(game.party_control.views[0]["floor_time"], idle_clock)
            REPORT.update(revived_guest_action=True, passed=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-cap-cost", action="store_true")
    args = parser.parse_args()
    ENGINE, OUTPUT = args.engine.resolve(), args.output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__).resolve(), Path(recovery.__file__).resolve(),
             Path(__file__).with_name("native-command-completion.py").resolve(),
             Path(__file__).with_name("helpers").joinpath("native_party_fixture.py").resolve(), ENGINE / "crawl"]
    files.append(Path(__file__).with_name("helpers").joinpath("native_transport.py").resolve())
    files += list(Path(__file__).resolve().parents[1].joinpath("webtiles").glob("*.py"))
    files += [path for path in (ENGINE / "dat").rglob("*") if path.is_file()]
    source = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    (OUTPUT / "binding.json").write_text(json.dumps(dict(source=source, engine=str(ENGINE),
        resources=dict(native_games=1, browsers=0, builds=0, existing_saves=False,
                       privileged_setup="disposable fixture only")), indent=2) + "\n")
    REPORT = dict(passed=False, engine_sha256=source[str(ENGINE / "crawl")], existing_saves_used=False,
                  expect_cap_cost=args.expect_cap_cost, privileged_wizard_mode0_fixture_seam=False)
    recovery.ENGINE, recovery.OUTPUT, recovery.REPORT = ENGINE, OUTPUT, REPORT
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        TransitionTests("test_off_floor_resurrection_refreshes_private_views")]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
