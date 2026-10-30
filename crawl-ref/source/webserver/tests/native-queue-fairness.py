"""A delayed real completion cannot let one native actor's burst exclude peers."""
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


class QueueFairnessTests(recovery.NativeRecoveryTests):
    @staticmethod
    def send(connection, kind, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))

    @staticmethod
    def turns(game):
        return [next(member["turns"] for member in game.party_control.views[slot]["members"]
                     if member["slot"] == slot) for slot in range(3)]

    @gen_test(timeout=100)
    async def test_native_burst_is_fair_after_a_delayed_completion(self):
        async with self.native_session(players=3) as (probe, game, host_connection, host, guest_connection, guest):
            third_connection, third = self.party_connections["Third"]
            await self.wait_for(lambda: self.settled(probe, game) and not game.player_streams.pending,
                                "Personal baselines settled")
            before = self.turns(game)
            sent_start = len(game.conn.sent)
            request = game.activity_pump.request_id + 1
            with NativeCompletionHold(probe, request) as hold:
                self.send(host_connection, "key", keycode=46)
                await self.wait_for(lambda: bool(hold.held), "Real native completion delayed")
                self.assertTrue(game.activity_pump.inflight)
                self.assertEqual(game.activity_pump.owner, 0)
                self.send(guest_connection, "input", data=[46], text="s.")
                self.send(guest_connection, "key", keycode=ord("s"))
                self.send(third_connection, "key", keycode=46)
                self.send(host_connection, "key", keycode=46)
                for connection in (guest_connection, third_connection, host_connection):
                    self.send(connection, "ping")
                    if connection is guest_connection:
                        counts, pong = [], False
                        while not pong:
                            raw = await connection.read_message()
                            self.assertIsNotNone(raw)
                            for packet in json.loads(raw).get("msgs", []):
                                if packet["msg"] == "party_state":
                                    own = next(member for member in packet["members"] if member["slot"] == 1)
                                    counts.append(own.get("queued_action_count", 0))
                                pong = pong or packet["msg"] == "pong"
                        self.assertIn(4, counts, "Waiting input count reaches the guest over its real socket")
                    else:
                        await self.read_until(connection, "pong")
                self.assertEqual(len(game.activity_pump.inputs), 6)
                self.assertEqual(game.activity_pump.owner, 0)
                self.assertEqual(game.activity_pump.request_id, request)
                hold.release()
            await self.wait_for(lambda: self.settled(probe, game) and not game.activity_pump.queued_action
                and self.turns(game) == [before[0] + 2, before[1] + 4, before[2] + 1], "Fair native burst completion")
            actions = [packet for packet in game.conn.sent[sent_start:]
                       if packet.get("msg") == "key" and "activity_id" in packet]
            order = [packet["player_id"] for packet in actions]
            tokens = [packet["activity_id"] for packet in actions]
            self.assertEqual(order, [0, 1, 2, 0, 1, 1, 1])
            self.assertEqual(tokens, list(range(request, request + 7)))
            guest_keys = [packet["keycode"] for packet in actions if packet["player_id"] == 1]
            self.assertEqual(guest_keys, list(map(ord, ".s.s")))
            self.assertTrue(all(probe.ready_tokens.count(token) == 1 for token in tokens))
            self.assertTrue(all(not member.get("queued_action")
                               for view in game.party_control.views.values() for member in view["members"]))
            REPORT.update(passed=True, delayed_real_completion=request, native_actor_order=order,
                          exact_tokens=tokens, no_replay=True, own_key_order_preserved=True,
                          every_waiting_actor_served_before_same_actor_repeats=True,
                          waiting_queue_count_received_over_real_websocket=True,
                          queue_labels_clear_after_dispatch=True,
                          mixed_data_text_batch_and_newer_key_order=guest_keys)


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
                       fault_injection="one real native completion held at the server adapter")), indent=2) + "\n")
    REPORT = dict(passed=False, engine_sha256=source[str(ENGINE / "crawl")], existing_saves_used=False)
    recovery.ENGINE, recovery.OUTPUT, recovery.REPORT = ENGINE, OUTPUT, REPORT
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        QueueFairnessTests("test_native_burst_is_fair_after_a_delayed_completion")]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
