"""Three authenticated owner bindings through the real router and native engine.

The transport is a local Unix socket. No account or existing save is used.
Native builds and local execution require the shared heavy reservation.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock

from webtiles.activity_pump import ActivityPump
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.process_handler import CrawlProcessHandler, CrawlProcessHandlerBase
from webtiles.tile_presence import TilePresence

spec = importlib.util.spec_from_file_location(
    "native_completion", Path(__file__).with_name("native-command-completion.py"))
completion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(completion)


def verify(source, output, expect_failure=False):
    evidence = {"passed": False, "existing_saves_used": False, "checks": [],
                "expect_failure": expect_failure}
    with tempfile.TemporaryDirectory(prefix="dcss-owners-", dir="/tmp") as temporary:
        probe = completion.NativeProbe(source, Path(temporary), players=3)
        clients = [SimpleNamespace(username=name, id=slot + 1, send_message=Mock(),
                                   append_message=Mock())
                   for slot, name in enumerate(("Probe", "Peer", "Third"))]
        control = PartyControl("Probe", {client.username: slot for slot, client in enumerate(clients)})
        presence = TilePresence()
        streams = PlayerStreams(control, presence)
        sent = []
        clock = [0.0]
        dropped_completions = set()
        suppressed_plans = set()
        suppress_prompts = [False]

        def native_errors():
            return [packet.get("payload", packet) for packet in probe.packets
                    if packet.get("payload", packet).get("msg") == "game_action_error"]

        def send_native(data):
            packet = json.loads(data)
            sent.append(packet)
            probe.send(packet.pop("msg"), **packet)

        game = SimpleNamespace(username="Probe", party_mode=True, party_control=control,
                               tile_presence=presence, player_streams=streams,
                               _receivers=clients, process=True,
                               conn=SimpleNamespace(open=True, send_message=send_native))
        recovery = {} if expect_failure else dict(
            probe=lambda request: probe.send("party_activity_probe", request_id=request),
            restore_prompt=lambda: probe.send("spectator_joined"))
        game.activity_pump = ActivityPump(control, streams, lambda: {0, 1, 2}, Mock(return_value=False),
                                         now=lambda: clock[0], **recovery)
        game.handle_input = lambda packet, client, **bindings: CrawlProcessHandler.handle_input(game, packet, client, **bindings)

        def receive(packet):
            if packet.get("msg") == "party_packet":
                payload = packet.get("payload", {})
                if payload.get("msg") == "party_activity_ready" and payload.get("activity_id") in dropped_completions:
                    dropped_completions.remove(payload["activity_id"])
                    return
                if payload.get("msg") == "input_mode" and payload.get("plan_id") in suppressed_plans:
                    return
                if suppress_prompts[0] and (payload.get("msg") in {"menu", "ui-push", "init_input"}
                    or payload.get("msg") == "input_mode" and payload.get("mode", 0) > 1):
                    return
                CrawlProcessHandlerBase.handle_process_message(game, json.dumps(packet), True)

        probe.packet_callback = receive

        def command(owner, kind="key", **fields):
            game.handle_input(json.dumps(dict(msg=kind, **fields)), clients[owner])

        def settled():
            return (streams.native_ready and not game.activity_pump.inflight
                    and not game.activity_pump.inputs and probe.mode == 1)

        def expect_turns(before, delta):
            expected = [value + step for value, step in zip(before, delta)]
            assert probe.until(lambda: settled() and probe.turns() == expected, 10), {
                "expected": expected, "actual": probe.turns(),
                "inflight": game.activity_pump.inflight,
                "owner": game.activity_pump.owner, "prompt": game.activity_pump.prompt,
                "queued_inputs": len(game.activity_pump.inputs), "sent": sent[-12:]}

        try:
            assert probe.until(lambda: len(probe.party) == 3 and settled(), 40), "Three-player startup"
            assert not probe.party[0].get("enemy_initiative"), "Fixture requires no visible enemies"
            before = probe.turns()
            command(0, keycode=46)
            command(0, keycode=ord("i"))
            command(1, keycode=46)
            assert probe.until(lambda: game.activity_pump.prompt, 10), "Native inventory prompt"
            if expect_failure:
                assert game.activity_pump.owner == 1, "Original prompt ownership mismatch not reproduced"
                command(0, keycode=27)
                assert clients[0].send_message.call_args.kwargs["message"] == (
                    "Another hero is finishing an action. Your view is unchanged.")
                command(1, keycode=27)
                assert probe.until(lambda: any(packet.get("payload", packet).get("msg") == "game_action_error"
                    for packet in probe.packets)), "Native rejected the other owner"
                evidence["checks"].append("Original server blocks the native prompt owner while the engine rejects the server's owner")
                evidence["original_all_players_deadlock_reproduced"] = True
                evidence["passed"] = True
                return
            assert game.activity_pump.owner == 0, "Prompt moved to a queued peer"
            command(0, keycode=27)
            expect_turns(before, [1, 1, 0])
            evidence["checks"].append("A rapid wait/inventory sequence retains the prompt owner while a peer waits")

            before = probe.turns()
            start = len(sent)
            for slot in (0, 0, 1, 2):
                command(slot, keycode=46)
            assert len(sent) == start + 1, "Repeated owner input bypassed the in-flight command"
            expect_turns(before, [2, 1, 1])
            packets = sent[start:]
            assert [packet["player_id"] for packet in packets] == [0, 0, 1, 2]
            assert all("activity_id" in packet for packet in packets)
            evidence["checks"].append("Rapid input from three owners is serialized with one token per command")

            before = probe.turns()
            command(0, keycode=ord("i"))
            command(1, keycode=46)
            command(0, keycode=27)
            expect_turns(before, [0, 1, 0])
            evidence["checks"].append("A buffered owner response closes its native inventory prompt before a peer acts")

            before = probe.turns()
            item = next(item for item in probe.party[0]["members"][0]["inventory"]
                        if type(item.get("slot")) is int)
            command(0, "inv_item_describe", slot=item["slot"], expected_slot=0, expected_name=item["name"])
            command(2, keycode=46)
            command(0, keycode=27)
            expect_turns(before, [0, 0, 1])
            evidence["checks"].append("An inline native item dialog cannot complete before its control handler returns")

            before = probe.turns()
            command(0, "inv_item_describe", slot=item["slot"], expected_slot=0, expected_name=item["name"])
            command(2, keycode=46)
            assert probe.until(lambda: game.activity_pump.prompt), "Inline item dialog"
            request = game.activity_pump.request_id
            errors_before = len(native_errors())
            command(0, "floor_item_action", id=-1)
            assert probe.until(lambda: len(native_errors()) > errors_before), "Invalid dialog action rejected"
            assert game.activity_pump.inflight and game.activity_pump.owner == 0
            assert game.activity_pump.request_id == request, "Dialog rejection completed another command"
            assert probe.turns() == before, "Queued peer acted before the dialog closed"
            command(0, keycode=27)
            expect_turns(before, [0, 0, 1])
            evidence["checks"].append("A rejected action inside a COMMAND-mode dialog retains its token and queued peer")

            before = probe.turns()
            command(0, keycode=ord("i"))
            command(0, keycode=ord("?"))
            command(1, keycode=46)
            old = clients[0]
            replacement = SimpleNamespace(username="Probe", id=101, send_message=Mock(), append_message=Mock())
            clients[0] = replacement
            assert probe.until(lambda: game.activity_pump.prompt), "Prompt after owner reconnect"
            request = game.activity_pump.request_id
            streams.restore(replacement)
            count = sum(packet.get("payload", packet).get("msg") == "ui-stack" for packet in probe.packets)
            probe.send("spectator_joined")
            assert probe.until(lambda: sum(packet.get("payload", packet).get("msg") == "ui-stack"
                for packet in probe.packets) > count), "Native reconnect UI stack"
            assert game.activity_pump.inflight and game.activity_pump.owner == 0
            assert game.activity_pump.request_id == request, "Reconnect snapshot completed the prompt"
            assert not any(packet.get("keycode") == ord("?") for packet in sent[-4:]), "Disconnected input replayed"
            command(0, keycode=27)
            expect_turns(before, [0, 1, 0])
            evidence["checks"].append("Reconnect restores the real prompt without replaying the old connection's queued keys")

            before = probe.turns()
            command(0, keycode=46)
            command(1, keycode=46)
            command(2, keycode=46)
            command(1, keycode=27)
            expect_turns(before, [1, 0, 1])
            evidence["checks"].append("Escape removes only its owner's deferred input while the other owners continue")

            before = probe.turns()
            command(2, "input", text="..")
            command(1, keycode=46)
            expect_turns(before, [0, 1, 2])
            evidence["checks"].append("Raw multi-character input retains separate command ownership")

            before = probe.turns()
            command(0, keycode=ord("i"))
            command(0, keycode=27)
            assert probe.until(settled), "Prompt completion"
            stale = next(packet["prompt_activity_id"] for packet in reversed(sent)
                         if "prompt_activity_id" in packet)
            probe.send("key", keycode=46, player_id=0, prompt_activity_id=stale)
            assert probe.until(lambda: any(packet.get("payload", packet).get("message")
                == "That prompt has finished." for packet in probe.packets)), "Stale prompt response rejection"
            assert probe.turns() == before, "A delayed prompt response became a gameplay action"
            command(1, keycode=46)
            expect_turns(before, [0, 1, 0])
            evidence["checks"].append("A stale prompt response spends no turn and does not strand the next owner")
            before = probe.turns()
            errors_before = len(native_errors())
            command(1, "click_cell", x=0, y=0, button=1, exclude=True, expected_slot=2, expected_place="wrong")
            command(2, keycode=46)
            expect_turns(before, [0, 0, 1])
            assert len(native_errors()) == errors_before + 1, "Expected one stale action rejection"
            evidence["checks"].append("A rejected command completes once without a turn and the next owner progresses")

            before = probe.turns()
            request = game.activity_pump.request_id + 1
            dropped_completions.add(request)
            suppressed_plans.add(901)
            command(0, keycode=46, plan_id=901, expected_slot=0)
            command(1, keycode=46)
            assert probe.until(lambda: request in probe.ready_tokens), "Native completed the dropped acknowledgement"
            assert game.activity_pump.inflight and game.activity_pump.owner == 0
            clock[0] += 6.0
            game.activity_pump.tick()
            expect_turns(before, [1, 1, 0])
            assert game.activity_pump.recovery_counts["completed"] == 1
            assert sum(packet.get("activity_id") == request for packet in sent) == 1, "Recovery replayed gameplay"
            restored = [json.loads(call.args[0]) for call in clients[0].append_message.call_args_list]
            assert any(packet.get("plan_id") == 901 for packet in restored), "Tactical acknowledgement was not repaired"
            evidence["checks"].append("A dropped completion and tactical acknowledgement self-heal without replaying a turn")

            before = probe.turns()
            suppress_prompts[0] = True
            menus = sum(packet.get("payload", packet).get("tag") == "inventory" for packet in probe.packets)
            command(0, keycode=ord("i"))
            command(2, keycode=46)
            assert probe.until(lambda: sum(packet.get("payload", packet).get("tag") == "inventory"
                for packet in probe.packets) > menus), "Real native inventory prompt"
            assert not game.activity_pump.prompt, "Fixture did not suppress the prompt event"
            game.activity_pump.owner = 1  # Deliberately corrupt only the router's owner.
            suppress_prompts[0] = False
            clock[0] += 6.0
            game.activity_pump.tick()
            assert probe.until(lambda: game.activity_pump.prompt and game.activity_pump.owner == 0), "Native prompt recovery"
            assert game.activity_pump.recovery_counts["prompts"] == 1
            command(0, keycode=27)
            expect_turns(before, [0, 0, 1])
            evidence["checks"].append("A missed prompt and incorrect router owner self-heal from the native token and restored UI")

            before = probe.turns()
            errors_before = len(native_errors())
            # Simulate the server still holding its old projection after native
            # stairs completed. The engine must enforce the queued floor too.
            game.handle_input(json.dumps(dict(msg="key", keycode=46)), clients[0], queued_floor="D:99")
            command(2, keycode=46)
            expect_turns(before, [0, 0, 1])
            assert len(native_errors()) == errors_before + 1
            evidence["checks"].append("Native floor binding rejects stale deferred input even before the router's projection updates")

            # Deterministic bursts vary the actor order and include repeated
            # same-owner commands. Each batch drains before another is sent.
            before = probe.turns()
            for batch in range(8):
                delta = [0, 0, 0]
                for index in range(12):
                    slot = (index * index + batch) % 3
                    delta[slot] += 1
                    command(slot, keycode=46)
                expect_turns(before, delta)
                before = probe.turns()
            evidence["checks"].append("96 burst commands across three owners complete with exact per-owner turn counts")
            errors = [call.kwargs for client in clients for call in client.send_message.call_args_list
                      if call.args and call.args[0] == "game_action_error"]
            assert not errors, errors
            assert len(probe.ready_tokens) == len(set(probe.ready_tokens)), "Duplicate native completions"
            assert len(native_errors()) == 4, native_errors()
            evidence["recovery_counts"] = dict(game.activity_pump.recovery_counts)
            evidence["passed"] = True
        finally:
            probe.close()
            evidence["owned_process_exited"] = probe.process.poll() is not None
            output.mkdir(parents=True, exist_ok=True)
            (output / "report.json").write_text(json.dumps(evidence, indent=2) + "\n")
            (output / "terminal.log").write_bytes(probe.terminal)
            (output / "native.json").write_text(json.dumps(probe.packets))
    print(json.dumps(evidence), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-failure", action="store_true")
    args = parser.parse_args()
    verify(args.source.resolve(), args.output.resolve(), args.expect_failure)
