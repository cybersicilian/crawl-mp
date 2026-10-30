"""Real native input and WebSocket recovery in a disposable expedition.

Authentication and game-client HTML are fixture seams. Native execution,
recipient streams, input ownership, WebSocket routing and reconnect leases use
production implementations. One game, no browser, no existing saves/accounts.
"""
import argparse
import asyncio
from contextlib import asynccontextmanager
import hashlib
import importlib.util
import json
import logging
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch

import tornado.ioloop
import tornado.web
from tornado.testing import gen_test
from tornado.websocket import websocket_connect

from webtiles import config, process_handler, ws_handler
from webtiles.session_handoff_test import HandoffSocket, SessionHandoffTests

spec = importlib.util.spec_from_file_location("completion", Path(__file__).with_name("native-command-completion.py"))
completion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(completion)


class FixtureSocket(HandoffSocket):
    def open(self):
        super().open()
        self.username = self.get_argument("user")
        self.user_id = 1 if self.username == "Host" else 2


class NativeConnection:
    open = True

    def __init__(self, probe):
        self.probe = probe
        self.sent = []

    def send_message(self, message):
        data = message.encode() if isinstance(message, str) else message
        self.sent.append(json.loads(data))
        self.probe.peer.sendto(data, self.probe.address)


class NativeChild:
    """Use the real child signals without a production ttyrec file."""
    def __init__(self, process):
        self.send_signal = process.send_signal

    def flush_ttyrec(self):
        pass


class RecoveryGame(process_handler.CrawlProcessHandler):
    def update_watcher_description(self):
        pass  # No public lobby in this fixture.

    def stop(self, delay=False):
        self.stop_count += 1
        super().stop(delay=delay)

    def close_native(self):
        if not self.native_closed:
            if hasattr(self, "poller"):
                self.poller.stop()
            self.probe.close()
            self.native_closed = True
            self.process = None
            self.conn.open = False


class NativeRecoveryTests(SessionHandoffTests):
    def get_app(self):
        app = tornado.web.Application([(r"/socket", FixtureSocket)])
        app.sessions = []
        return app

    async def connect_user(self, username):
        connection = await websocket_connect(
            self.get_url("/socket?user=" + username).replace("http", "ws", 1),
            subprotocols=["no-compression"])
        self.connections.append(connection)
        return connection, self._app.sessions[-1]

    async def wait_for(self, predicate, description, seconds=30):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if self.bridge_error:
                raise self.bridge_error
            if predicate():
                return
            await asyncio.sleep(0.01)
        self.fail(description)

    @staticmethod
    def settled(probe, game):
        return (probe.mode == 1 and game.player_streams.native_ready
                and not game.activity_pump.inflight and not game.activity_pump.inputs)

    @asynccontextmanager
    async def native_session(self, restore_from=None, players=2, setup=None):
        self.bridge_error = None
        accounts = ("Host", "Guest", "Third")[:players]
        launch = completion.NativeLaunch(accounts=accounts)
        with tempfile.TemporaryDirectory(prefix="dcss-ws-native-", dir="/tmp") as temporary:
            probe = completion.NativeProbe(ENGINE, Path(temporary), players=players,
                                           launch=launch, restore_from=restore_from)
            game = None
            try:
                deadline = time.monotonic() + 35
                while not (probe.mode == 1 and len(probe.party) == players):
                    probe.poll(0)
                    self.assertIsNone(probe.process.poll(), "Native startup exited")
                    self.assertLess(time.monotonic(), deadline, "Native startup timed out")
                    await asyncio.sleep(0.01)
                if setup:
                    await asyncio.to_thread(setup, probe)
                host_connection, host = await self.connect_user("Host")
                guest_connection, guest = await self.connect_user("Guest")
                self.party_connections = {"Host": (host_connection, host), "Guest": (guest_connection, guest)}
                for name in accounts[2:]:
                    self.party_connections[name] = await self.connect_user(name)
                spec_info = dict(slot_users={name: slot for slot, name in enumerate(accounts)}, multiplayer=True)
                with patch.dict(ws_handler.USER_PARTY_SPECS, {"Host": spec_info}):
                    game = RecoveryGame({"id": "coop"}, "Host", logging.getLogger("native-recovery"))
                game.probe, game.process = probe, NativeChild(probe.process)
                game.conn, game.record_id = NativeConnection(probe), self.game["id"]
                game.native_closed, game.stop_count = False, 0
                self.processes["fixture"] = game
                host.process, host.game_id = game, "coop"
                guest.watched_game = game
                guest.party_member_active, guest.party_slot = True, 1
                game.add_watcher(host)
                game.add_watcher(guest)
                for slot, name in enumerate(accounts[2:], 2):
                    connection, receiver = self.party_connections[name]
                    receiver.watched_game = game
                    receiver.party_member_active, receiver.party_slot = True, slot
                    game.add_watcher(receiver)

                def accept(packet):
                    game.handle_process_message(json.dumps(packet), True)

                history = list(probe.packets)
                if setup:
                    # Privileged fixture setup is not client history. Bootstrap
                    # then request fresh personal views from the prepared game.
                    latest = {}
                    for packet in history:
                        payload = packet.get("payload", packet)
                        if payload.get("msg") in {"version", "options", "layout"}:
                            latest[payload["msg"]] = packet
                        if (packet.get("view") is not True and payload.get("msg") == "input_mode"
                                and payload.get("mode") == 1):
                            latest["input_mode"] = packet
                    history = list(latest.values())
                for packet in history:
                    accept(packet)
                probe.packet_callback = accept
                if setup:
                    for connection, receiver in self.party_connections.values():
                        game.player_streams.request(receiver)

                def poll_native():
                    try:
                        if probe.process.poll() is not None:
                            game.process = None
                            game.conn.open = False
                            game.poller.stop()
                            return
                        probe.poll(0)
                    except Exception as error:
                        self.bridge_error = error
                        game.poller.stop()

                game.poller = tornado.ioloop.PeriodicCallback(poll_native, 10)
                game.poller.start()
                await self.wait_for(lambda: all(game.player_streams.cached.get(slot, {}).get("map")
                                               for slot in range(players)), "Personal baselines")
                host_player = await self.read_until(host_connection, "player")
                guest_player = await self.read_until(guest_connection, "player")
                self.assertEqual(host_player["name"], "TokenProbe")
                self.assertEqual(guest_player["name"], "TokenPeer")
                REPORT["personal_identities_verified"] = True
                yield probe, game, host_connection, host, guest_connection, guest
            finally:
                if game is not None:
                    # Native ownership must close even if later fixture-only
                    # bookkeeping fails on a different adapter composition.
                    game.close_native()
                    REPORT.update(stop_count=game.stop_count,
                        connected_slots=sorted(game.party_control.connected_slots()),
                        pending_views=sorted(game.player_streams.pending),
                        activity=dict(inflight=game.activity_pump.inflight,
                                      owner=game.activity_pump.owner, prompt=game.activity_pump.prompt),
                        remaining_receivers=[dict(username=receiver.username, closed=receiver.client_closed)
                                             for receiver in game._receivers])
                    if not REPORT.get("passed"):
                        OUTPUT.mkdir(parents=True, exist_ok=True)
                        (OUTPUT / "failure-terminal.log").write_bytes(probe.terminal)
                        (OUTPUT / "failure-native.json").write_text(json.dumps(probe.packets))
                        (OUTPUT / "failure-sent.json").write_text(json.dumps(game.conn.sent, indent=2))
                    for name in ("idle_checker", "activity_timer", "ai_timer"):
                        timer = getattr(game, name, None)
                        if timer is not None:
                            timer.stop()
                    ai_party = getattr(game, "ai_party", None)
                    if ai_party is not None:
                        ai_party.close()
                    if game.kill_timeout:
                        tornado.ioloop.IOLoop.current().remove_timeout(game.kill_timeout)
                    for receiver in list(game._receivers):
                        receiver.process = receiver.watched_game = None
                        receiver.close(1000)
                else:
                    probe.close()
                REPORT.setdefault("native_closeouts", []).append(dict(pid=probe.process.pid,
                    exited=probe.process.poll() is not None, exit_code=probe.process.returncode))
                REPORT["owned_process_exited"] = all(item["exited"] for item in REPORT["native_closeouts"])
                OUTPUT.mkdir(parents=True, exist_ok=True)
                (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")

    @gen_test(timeout=100)
    async def test_native_guest_survives_host_drop_and_host_reclaims_same_engine(self):
        async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
            before = probe.turns()[1]
            guest_connection.write_message(json.dumps(dict(msg="key", keycode=46)))
            await self.wait_for(lambda: probe.turns()[1] == before + 1
                                and self.settled(probe, game), "Guest native action")
            pid = probe.process.pid
            with patch.dict(config.server_config, reconnect_grace_period=0.03):
                host_connection.close(code=1001)
                await asyncio.sleep(0.15)
                self.assertTrue(host.client_closed)
                self.assertEqual(game.stop_count, 0)
                self.assertIsNone(probe.process.poll())
                self.assertNotIn(host, game._receivers)
                REPORT["host_grace_survived"] = True
                guest_connection.write_message(json.dumps(dict(msg="key", keycode=46)))
                await self.wait_for(lambda: probe.turns()[1] == before + 2
                                    and self.settled(probe, game), "Guest action after host grace")
                new_connection, new_host = await self.connect_user("Host")
                await self.resume(new_connection, reconnect=True)
                await self.read_until(new_connection, "game_started")
                self.assertIs(new_host.process, game)
                self.assertIsNone(host.process)
                self.assertEqual(probe.process.pid, pid)
                self.assertIsNone(host.reconnect_timeout)
                self.assertEqual(game.stop_count, 0)
                self.assertEqual(game.party_control.selected(new_host), 0)
                self.assertEqual(game.party_control.selected(guest), 1)
                REPORT.update(host_reclaimed=True, guest_actions=2, same_engine_pid=pid)
                new_connection.close(code=1001)
                await asyncio.sleep(0.1)
                self.assertEqual(game.stop_count, 0)
                guest_connection.close(code=1001)
                await self.wait_for(lambda: game.stop_count == 1, "Last human cleanup", 3)
                await self.wait_for(lambda: probe.process.poll() is not None, "Native SIGHUP shutdown", 10)
            REPORT.update(passed=True, last_human_stopped_engine=True)

    @gen_test(timeout=100)
    async def test_native_prompt_reconnect_and_same_account_takeover(self):
        async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
            before = probe.turns()
            guest_connection.write_message(json.dumps(dict(msg="key", keycode=ord("i"))))
            await self.wait_for(lambda: game.activity_pump.prompt and game.activity_pump.owner == 1,
                                "Guest inventory prompt")
            request = game.activity_pump.request_id
            host_connection.write_message(json.dumps(dict(msg="key", keycode=46)))
            error = await self.read_until(host_connection, "game_action_error")
            self.assertIn("Another hero", error["message"])
            new_guest_connection, new_guest = await self.connect_user("Guest")
            new_guest.watched_game = game
            new_guest.party_member_active, new_guest.party_slot = True, 1
            game.add_watcher(new_guest)
            guest_connection.close(code=1001)
            await self.wait_for(lambda: guest.client_closed, "Old guest socket closure")
            stack = await self.read_until(new_guest_connection, "ui-stack")
            self.assertTrue(any(item.get("tag") == "inventory" for item in stack["items"]))
            self.assertEqual(game.activity_pump.request_id, request)
            self.assertTrue(game.activity_pump.inflight)
            self.assertEqual(game.activity_pump.owner, 1)
            self.assertEqual(game.party_control.connected_slots(), {0, 1})
            self.assertEqual(probe.turns(), before)
            REPORT["guest_prompt_restored"] = True
            new_host_connection, new_host = await self.connect_user("Host")
            await self.resume(new_host_connection, reconnect=True)
            await self.read_until(new_host_connection, "connection_wait")
            self.assertIsNone(new_host.process)
            await self.resume(new_host_connection)
            await self.read_until(new_host_connection, "game_started")
            self.assertIs(new_host.process, game)
            self.assertIsNone(host.process)
            await self.read_until(host_connection, "close")
            self.assertIsNone(await host_connection.read_message())
            self.assertEqual(game.stop_count, 0)
            self.assertEqual(game.activity_pump.request_id, request)
            self.assertTrue(game.activity_pump.prompt)
            self.assertEqual(game.activity_pump.owner, 1)
            new_guest_connection.write_message(json.dumps(dict(msg="key", keycode=27)))
            await self.wait_for(lambda: self.settled(probe, game), "Restored prompt completion")
            await self.wait_for(lambda: not game.player_streams.pending, "Deferred personal views")
            self.assertEqual(probe.turns(), before)
            for slot, connection in ((0, new_host_connection), (1, new_guest_connection)):
                connection.write_message(json.dumps(dict(msg="key", keycode=46)))
                expected = [value + int(index <= slot) for index, value in enumerate(before)]
                await self.wait_for(lambda: probe.turns() == expected and self.settled(probe, game),
                                    "Native action after prompt reconnect")
            REPORT.update(passed=True, prompt_token=request, same_account_takeover=True,
                          no_prompt_turn_replay=True, deferred_views_completed=True)

    @gen_test(timeout=120)
    async def test_native_checkpoint_restores_both_heroes(self):
        with tempfile.TemporaryDirectory(prefix="dcss-ws-checkpoint-", dir="/tmp") as temporary:
            checkpoint = Path(temporary)
            async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
                for connection in (host_connection, guest_connection):
                    before = probe.turns()
                    slot = 0 if connection is host_connection else 1
                    connection.write_message(json.dumps(dict(msg="key", keycode=46)))
                    await self.wait_for(lambda: probe.turns()[slot] == before[slot] + 1
                                        and self.settled(probe, game), "Action before checkpoint")
                fields = ("slot", "name", "species", "job", "place", "hp", "hp_max", "mp", "mp_max", "turns")
                saved = [{key: member.get(key) for key in fields} for member in probe.party[0]["members"]]
                old_pid = probe.process.pid
                host_connection.write_message(json.dumps(dict(msg="library_save")))
                result = await self.read_until(host_connection, "record_save_result")
                self.assertTrue(result["ok"])
                self.assertEqual(probe.process.pid, old_pid)
                self.assertEqual(probe.turns(), [member["turns"] for member in saved])
                host_connection.write_message(json.dumps(dict(msg="library_save", exit=True)))
                await self.wait_for(lambda: probe.process.poll() is not None, "Normal checkpoint exit", 15)
                self.assertEqual(probe.process.returncode, 0)
                packages = list((probe.root / "saves").rglob("*.cs"))
                self.assertTrue(packages)
                for name in ("saves", "library"):
                    shutil.copytree(probe.root / name, checkpoint / name)
                if (probe.root / "record.json").exists():
                    shutil.copy2(probe.root / "record.json", checkpoint / "record.json")
                REPORT["checkpoint_written"] = True
            async with self.native_session(restore_from=checkpoint) as (probe, game, host_connection, host, guest_connection, guest):
                actual = [{key: member.get(key) for key in fields} for member in probe.party[0]["members"]]
                self.assertEqual(actual, saved)
                self.assertNotEqual(probe.process.pid, old_pid)
                self.assertEqual(game.party_control.selected(host), 0)
                self.assertEqual(game.party_control.selected(guest), 1)
                before = probe.turns()
                guest_connection.write_message(json.dumps(dict(msg="key", keycode=46)))
                await self.wait_for(lambda: probe.turns()[1] == before[1] + 1
                                    and self.settled(probe, game), "Guest action after checkpoint restore")
                self.assertEqual(probe.turns()[0], before[0])
                REPORT.update(passed=True, checkpoint_restored=True, both_heroes_preserved=True,
                              new_native_process=True, guest_action_after_restore=True)

    @gen_test(timeout=100)
    async def test_native_guest_cannot_end_the_expedition(self):
        async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
            before = probe.turns()
            checks = []
            for label, keycode in (("save now", 19), ("save prompt", ord("S")),
                                   ("abandon", 17), ("suspend", 26)):
                start, completions = len(probe.packets), len(probe.ready_tokens)
                guest_connection.write_message(json.dumps(dict(msg="key", keycode=keycode)))
                await self.wait_for(lambda: probe.process.poll() is not None
                                    or len(probe.ready_tokens) > completions,
                                    "Guest global command completion")
                self.assertIsNone(probe.process.poll(), "Guest " + label + " terminated the shared engine")
                def denied():
                    messages = [entry.get("text", "") for packet in probe.packets[start:]
                                for entry in packet.get("payload", packet).get("messages", [])]
                    REPORT["authority_messages"] = messages[-8:]
                    return any("Only the expedition host" in text for text in messages)
                await self.wait_for(denied, "Guest " + label + " rejection message", 3)
                self.assertTrue(self.settled(probe, game))
                self.assertEqual(probe.turns(), before)
                checks.append(label)
            start = len(probe.packets)
            guest_connection.write_message(json.dumps(dict(msg="main_menu_action")))
            await self.wait_for(lambda: game.activity_pump.prompt, "Guest native game menu")
            menus = [packet.get("payload", packet) for packet in probe.packets[start:]
                     if packet.get("payload", packet).get("tag") == "game_menu"]
            self.assertTrue(menus)
            labels = [entry.get("text", "") for entry in menus[-1].get("items", [])]
            self.assertFalse(any("Save and" in text or "abandon character" in text for text in labels))
            guest_connection.write_message(json.dumps(dict(msg="key", keycode=27)))
            await self.wait_for(lambda: self.settled(probe, game), "Guest game menu completion")
            host_connection.write_message(json.dumps(dict(msg="library_save", exit=True)))
            await self.wait_for(lambda: probe.process.poll() is not None, "Host save-and-exit", 15)
            self.assertEqual(probe.process.returncode, 0)
            REPORT.update(passed=True, guest_global_commands_blocked=checks,
                          guest_menu_actions_filtered=True, host_save_and_exit_preserved=True,
                          no_turns_spent=True)

    @gen_test(timeout=100)
    async def test_native_disconnected_prompt_owner_does_not_strand_peers(self):
        with patch.dict(config.server_config, reconnect_grace_period=0.03):
            async with self.native_session() as (probe, game, host_connection, host, guest_connection, guest):
                before = probe.turns()
                more = REPORT["case"] == "orphan-more"
                if more:
                    await self.open_more_prompt(probe, game, guest_connection)
                else:
                    guest_connection.write_message(json.dumps(dict(msg="key", keycode=ord("i"))))
                await self.wait_for(lambda: game.activity_pump.prompt and game.activity_pump.owner == 1,
                                    "Guest inventory prompt")
                request = game.activity_pump.request_id
                sent_start = len(game.conn.sent)
                nested = REPORT["case"] == "orphan-nested"
                if nested:
                    start = len(probe.packets)
                    guest_connection.write_message(json.dumps(dict(msg="key", keycode=ord("a"))))
                    await self.wait_for(lambda: any(packet.get("payload", packet).get("type") == "describe-item"
                        for packet in probe.packets[start:]), "Nested item description")
                    start = len(probe.packets)
                    game._restore_native_prompt()
                    await self.wait_for(lambda: any(packet.get("payload", packet).get("msg") == "ui-stack"
                        and len(packet.get("payload", packet).get("items", [])) >= 2
                        for packet in probe.packets[start:]), "Native nested prompt stack")
                    REPORT["nested_stack_verified"] = True
                guest_connection.close(code=1001)
                await self.wait_for(lambda: guest.client_closed, "Guest disconnection")
                game.activity_pump.probe_interval = 0.5
                await self.wait_for(lambda: self.settled(probe, game), "Abandoned prompt recovery", 4)
                self.assertEqual(probe.turns(), before)
                self.assertEqual(game.stop_count, 0)
                self.assertEqual(game.party_control.members, {"Host": 0, "Guest": 1})
                replies = game.activity_pump.recovery_counts["abandoned_prompts"]
                self.assertGreaterEqual(replies, 2 if nested else 1)
                if more:
                    cancellations = [packet for packet in game.conn.sent[sent_start:]
                                     if "prompt_activity_id" in packet]
                    self.assertTrue(any(packet.get("keycode") == 32 for packet in cancellations))
                    self.assertTrue(all(packet["prompt_activity_id"] == request
                                        and packet["player_id"] == 1 for packet in cancellations))
                    REPORT.update(native_more_verified=True, prompt_cancellations=cancellations)
                host_connection.write_message(json.dumps(dict(msg="key", keycode=46)))
                await self.wait_for(lambda: probe.turns()[0] == before[0] + 1
                                    and self.settled(probe, game), "Host action after prompt recovery")
                REPORT.update(passed=True, disconnected_prompt_token=request,
                              reservation_preserved=True, native_turn_not_replayed=True,
                              remaining_hero_progressed=True, cancel_replies=replies)

    async def open_more_prompt(self, probe, game, connection):
        start = len(probe.packets)

        def payloads():
            return [packet.get("payload", packet) for packet in probe.packets[start:]]

        def has_text(text):
            return any(text.casefold() in message.get("text", "").casefold()
                       for packet in payloads() for message in packet.get("messages", []))

        connection.write_message(json.dumps(dict(msg="key", keycode=38)))
        await self.wait_for(lambda: has_text("Enter Wizard Command")
                            or has_text("really want to enter wizard mode"), "Wizard entry")
        if has_text("really want to enter wizard mode"):
            connection.write_message(json.dumps(dict(msg="text_input", text="wiz\r")))
            await self.wait_for(lambda: has_text("Enter Wizard Command"), "Wizard confirmation")
        start = len(probe.packets)
        connection.write_message(json.dumps(dict(msg="key", keycode=20)))
        await self.wait_for(lambda: any(packet.get("msg") == "init_input" for packet in payloads()), "Lua input")
        # The wizard Lua interpreter suppresses MORE internally. Configure a
        # real gameplay feedback message, leave Lua, then trigger that message.
        connection.write_message(json.dumps(dict(msg="text_input", text='crawl.setopt("show_more = true"); '
            'crawl.setopt("force_more_message += Only the expedition host"); crawl.mpr("MORE_SETUP_READY")\r')))
        await self.wait_for(lambda: has_text("MORE_SETUP_READY"), "MORE fixture setup")
        connection.write_message(json.dumps(dict(msg="key", keycode=27)))
        await self.wait_for(lambda: self.settled(probe, game), "Wizard command completion")
        connection.write_message(json.dumps(dict(msg="key", keycode=19)))
        await self.wait_for(lambda: probe.mode == 5 and game.activity_pump.prompt
                            and game.activity_pump.owner == 1, "Actual native MORE prompt")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--case", choices=("recovery", "prompt", "resume", "authority", "orphan", "orphan-nested", "orphan-more"), default="recovery")
    args = parser.parse_args()
    ENGINE, OUTPUT = args.engine.resolve(), args.output.resolve()
    REPORT = dict(passed=False, case=args.case,
                  engine_sha256=hashlib.sha256((ENGINE / "crawl").read_bytes()).hexdigest(),
                  existing_saves_used=False, authentication="fixture identity", browsers=0)
    files = [Path(__file__).resolve(), Path(__file__).with_name("native-command-completion.py").resolve()]
    files += list(Path(__file__).resolve().parents[1].joinpath("webtiles").glob("*.py"))
    files.append(ENGINE / "crawl")
    source = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    OUTPUT.mkdir(parents=True, exist_ok=False)
    (OUTPUT / "binding.json").write_text(json.dumps(dict(source=source, engine=str(ENGINE),
        resources=dict(native_games=2 if args.case == "resume" else 1, browsers=0, builds=0)), indent=2) + "\n")
    methods = dict(recovery="test_native_guest_survives_host_drop_and_host_reclaims_same_engine",
                   prompt="test_native_prompt_reconnect_and_same_account_takeover",
                   resume="test_native_checkpoint_restores_both_heroes",
                   authority="test_native_guest_cannot_end_the_expedition",
                   orphan="test_native_disconnected_prompt_owner_does_not_strand_peers",
                   **{kind: "test_native_disconnected_prompt_owner_does_not_strand_peers"
                      for kind in ("orphan-nested", "orphan-more")})
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([NativeRecoveryTests(methods[args.case])]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
