"""Private wizard input must expose exact native prompt ownership and recovery."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from tornado.testing import gen_test
from helpers.native_party_fixture import NativePartyFixture
from webtiles import config

spec = importlib.util.spec_from_file_location("native_recovery", Path(__file__).with_name("native-websocket-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class WizardPromptTests(recovery.NativeRecoveryTests):
    @staticmethod
    def send(connection, kind, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))

    @gen_test(timeout=100)
    async def test_wizard_selector_retains_and_recovers_its_native_owner(self):
        def prepare(probe):
            fixture = NativePartyFixture(probe, REPORT)
            fixture.lua(0, 'debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful")')
            fixture.command(0, 0)

        with patch.dict(config.server_config, reconnect_grace_period=0.03):
            async with self.native_session(setup=prepare) as (probe, game, host_connection, host, guest_connection, guest):
                await self.wait_for(lambda: self.settled(probe, game) and not game.player_streams.pending,
                                    "Prepared views and command boundary settled")
                before = probe.turns()
                start = len(probe.packets)
                self.send(host_connection, "key", keycode=38)
                await self.wait_for(lambda: game.activity_pump.inflight, "Wizard command owns a token")
                request = game.activity_pump.request_id
                await self.wait_for(lambda: any("Enter Wizard Command" in message.get("text", "")
                    for packet in probe.packets[start:]
                    for message in packet.get("payload", packet).get("messages", [])), "Actual wizard selector")
                # A periodic probe can have observed the command before the
                # selector opened. Require a response after this exact query.
                start = len(probe.packets)
                game._probe_native_activity(request)

                def statuses():
                    return [packet.get("payload", packet) for packet in probe.packets[start:]
                            if packet.get("payload", packet).get("msg") == "party_activity_status"
                            and packet.get("payload", packet).get("activity_id") == request]

                await self.wait_for(lambda: bool(statuses()), "Fresh native wizard status", 5)
                status = statuses()[-1]
                REPORT["native_selector_status"] = {key: status.get(key) for key in
                    ("activity_id", "state", "owner", "pending_activity_id", "input_mode")}
                self.assertEqual(status["state"], "prompt")
                self.assertEqual(status["input_mode"], 7)
                self.assertEqual(status["owner"], 0)
                self.assertTrue(game.activity_pump.prompt)
                self.send(guest_connection, "key", keycode=46)
                error = await self.read_until(guest_connection, "game_action_error")
                self.assertIn("Another hero", error["message"])
                self.assertEqual(game.activity_pump.request_id, request)
                self.send(host_connection, "key", keycode=27)
                await self.wait_for(lambda: self.settled(probe, game), "Wizard Escape completes original token")
                self.assertEqual(probe.turns(), before)
                REPORT["explicit_wizard_escape_completed"] = True
                self.send(host_connection, "key", keycode=38)
                await self.wait_for(lambda: game.activity_pump.inflight and game.activity_pump.prompt,
                                    "Second wizard selector")
                request = game.activity_pump.request_id
                sent_start = len(game.conn.sent)
                game.activity_pump.probe_interval = 0.3
                host_connection.close(code=1001)
                await self.wait_for(lambda: host.client_closed and self.settled(probe, game),
                                    "Disconnected wizard owner recovers", 5)
                cancellations = [packet for packet in game.conn.sent[sent_start:]
                                 if packet.get("prompt_activity_id") == request]
                self.assertTrue(any(packet.get("keycode") == 27 and packet.get("player_id") == 0
                                    for packet in cancellations))
                self.assertEqual(game.stop_count, 0)
                self.assertEqual(probe.turns(), before)
                self.send(guest_connection, "key", keycode=46)
                await self.wait_for(lambda: self.settled(probe, game) and probe.turns()[1] == before[1] + 1,
                                    "Peer plays after wizard owner disconnects")
                REPORT.update(passed=True, exact_prompt_ownership=True, no_turn_replay=True,
                              disconnected_wizard_cancelled=True, remaining_hero_progressed=True,
                              cancelled_token=request)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    ENGINE, OUTPUT = args.engine.resolve(), args.output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__).resolve(), Path(recovery.__file__).resolve(), ENGINE / "crawl",
             Path(__file__).with_name("native-command-completion.py").resolve(),
             Path(__file__).with_name("helpers").joinpath("native_party_fixture.py").resolve()]
    files += list(Path(__file__).resolve().parents[1].joinpath("webtiles").glob("*.py"))
    files += [path for path in (ENGINE / "dat").rglob("*") if path.is_file()]
    source = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    (OUTPUT / "binding.json").write_text(json.dumps(dict(source=source, engine=str(ENGINE),
        resources=dict(native_games=1, browsers=0, builds=0, existing_saves=False)), indent=2) + "\n")
    REPORT = dict(passed=False, engine_sha256=source[str(ENGINE / "crawl")], existing_saves_used=False)
    recovery.ENGINE, recovery.OUTPUT, recovery.REPORT = ENGINE, OUTPUT, REPORT
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        WizardPromptTests("test_wizard_selector_retains_and_recovers_its_native_owner")]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
