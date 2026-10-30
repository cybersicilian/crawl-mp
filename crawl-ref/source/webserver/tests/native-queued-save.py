"""Saving survives queue clearing and completes with a result during peer prompts."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

from tornado.testing import gen_test
from helpers.native_transport import NativeCompletionHold

spec = importlib.util.spec_from_file_location("native_recovery", Path(__file__).with_name("native-websocket-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class QueuedSaveTests(recovery.NativeRecoveryTests):
    @staticmethod
    def send(connection, kind, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))

    @gen_test(timeout=100)
    async def test_native_save_survives_both_queue_clear_controls(self):
        async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
            await self.wait_for(lambda: self.settled(probe, game) and not game.player_streams.pending,
                                "Prepared command boundary")
            before = probe.turns()
            checks = []
            for mode in ("escape", "activity_cancel"):
                sent_start = len(game.conn.sent)
                with NativeCompletionHold(probe, game.activity_pump.request_id + 1) as hold:
                    self.send(guest_connection, "key", keycode=46)
                    await self.wait_for(lambda: bool(hold.held), "Real peer completion held")
                    self.send(host_connection, "library_save")
                    if mode == "escape":
                        self.send(host_connection, "key", keycode=27)
                    else:
                        self.send(host_connection, "key", keycode=46)
                        self.send(host_connection, "party_activity", action="cancel")
                    self.send(host_connection, "ping")
                    await self.read_until(host_connection, "pong")
                    self.assertEqual(len(game.activity_pump.inputs), 1)
                    self.assertFalse(game.activity_pump.inputs[0].requires_alive)
                    self.assertEqual(game.activity_pump.owner, 1)
                    hold.release()
                result = await self.read_until(host_connection, "record_save_result")
                self.assertTrue(result["ok"])
                await self.wait_for(lambda: self.settled(probe, game), "Save and cancellation settle")
                packets = game.conn.sent[sent_start:]
                saves = [packet for packet in packets if packet.get("msg") == "record_save"]
                self.assertEqual(len(saves), 1)
                self.assertEqual(saves[0]["player_id"], 0)
                self.assertFalse(any(packet.get("msg") == "key" and packet.get("player_id") == 0 for packet in packets))
                self.assertTrue(list((probe.root / "saves").rglob("*.cs")))
                self.assertEqual(probe.turns()[0], before[0])
                checks.append(mode)
            self.assertEqual(probe.turns(), [before[0], before[1] + 2])
            settled_turns = probe.turns()
            self.send(guest_connection, "key", keycode=ord("i"))
            await self.wait_for(lambda: game.activity_pump.prompt and game.activity_pump.owner == 1,
                                "Guest inventory owns the native prompt")
            prompt_token = game.activity_pump.request_id
            sent_start = len(game.conn.sent)
            self.send(host_connection, "library_save")
            result = await self.read_until(host_connection, "record_save_result")
            self.assertFalse(result["ok"])
            self.assertIn("Another hero", result["error"])
            self.assertFalse(any(packet.get("msg") == "record_save"
                                 for packet in game.conn.sent[sent_start:]))
            self.assertEqual(game.activity_pump.request_id, prompt_token)
            self.assertEqual(game.activity_pump.owner, 1)
            self.assertTrue(game.activity_pump.prompt)
            self.assertFalse(game.activity_pump.inputs)
            self.send(guest_connection, "key", keycode=27)
            await self.wait_for(lambda: self.settled(probe, game), "Guest closes its own inventory")
            self.assertEqual(probe.turns(), settled_turns)
            self.send(host_connection, "library_save")
            self.assertTrue((await self.read_until(host_connection, "record_save_result"))["ok"])
            await self.wait_for(lambda: self.settled(probe, game), "Retry save completes")
            self.assertEqual(probe.turns(), settled_turns)
            REPORT.update(passed=True, clear_controls=checks, saves_acknowledged=3,
                          checkpoints_written=True, no_host_gameplay_replayed=True,
                          live_peer_actions=2, exact_peer_ownership_retained=True,
                          peer_prompt_save_rejected_with_result=True,
                          rejected_save_not_sent_to_native=True,
                          save_retry_succeeds_without_turn=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    ENGINE, OUTPUT = args.engine.resolve(), args.output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__).resolve(), Path(recovery.__file__).resolve(), ENGINE / "crawl",
             Path(__file__).with_name("native-command-completion.py").resolve(),
             Path(__file__).with_name("helpers").joinpath("native_transport.py").resolve()]
    files += list(Path(__file__).resolve().parents[1].joinpath("webtiles").glob("*.py"))
    files += [path for path in (ENGINE / "dat").rglob("*") if path.is_file()]
    source = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    (OUTPUT / "binding.json").write_text(json.dumps(dict(source=source, engine=str(ENGINE),
        resources=dict(native_games=1, browsers=0, builds=0, existing_saves=False,
                       fault_injection="one real completion delayed per save/control scenario")), indent=2) + "\n")
    REPORT = dict(passed=False, engine_sha256=source[str(ENGINE / "crawl")], existing_saves_used=False)
    recovery.ENGINE, recovery.OUTPUT, recovery.REPORT = ENGINE, OUTPUT, REPORT
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        QueuedSaveTests("test_native_save_survives_both_queue_clear_controls")]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
