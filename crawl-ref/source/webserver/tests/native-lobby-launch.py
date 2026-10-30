"""Real lobby launch/retry, process spawning, joins and save through WebSockets."""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import signal
import tempfile
import time
import unittest
from unittest.mock import patch

import tornado.web
from tornado.testing import gen_test
from tornado.websocket import websocket_connect

from webtiles import config, game_library, process_handler, userdb, ws_handler
from webtiles.session_handoff_test import HandoffSocket, SessionHandoffTests


class LobbySocket(HandoffSocket):
    def open(self):
        super().open()
        self.username = self.get_argument("user")
        self.user_id = 1

    def send_json_options(self, *args):
        pass  # No game-client HTML in this transport fixture.


class LobbyLaunchTests(SessionHandoffTests):
    def get_app(self):
        app = tornado.web.Application([(r"/socket", LobbySocket)])
        app.sessions = []
        return app

    async def connect_user(self, name):
        connection = await websocket_connect(self.get_url("/socket?user=" + name).replace("http", "ws", 1),
                                             subprotocols=["no-compression"])
        self.connections.append(connection)
        return connection, self._app.sessions[-1]

    async def message(self, connection, kind):
        while True:
            raw = await connection.read_message()
            self.assertIsNotNone(raw, "Socket closed before " + kind)
            for packet in json.loads(raw).get("msgs", []):
                if packet["msg"] == "library_error" and kind != "library_error":
                    self.fail("Unexpected launch error: " + packet.get("message", str(packet)))
                if packet["msg"] == kind:
                    return packet

    async def wait_for(self, predicate, description, seconds=35):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if predicate():
                return
            await asyncio.sleep(0.01)
        self.fail(description)

    @staticmethod
    def send(connection, kind, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))

    @staticmethod
    def member(game, slot):
        state = game.party_control.views.get(slot) or game.party_control.state or {}
        return next((member for member in state.get("members", []) if member["slot"] == slot), {})

    @gen_test(timeout=150)
    async def test_failed_launch_retry_and_real_native_joins(self):
        game = child = None
        children = []
        with tempfile.TemporaryDirectory(prefix="dcss-l-", dir="/tmp") as temporary:
            root = Path(temporary)
            directories = {name: root / name for name in ("rcs", "macros", "morgue", "locks", "sockets", "home", "library")}
            for directory in directories.values():
                directory.mkdir()
            database = userdb.crawl_db(str(root / "settings.sqlite"))
            self.addCleanup(database.close)
            params = config.GameConfig(dict(id="coop", name="Disposable co-op", crawl_binary=str(ENGINE / "crawl"),
                dir_path=str(ENGINE), cwd=str(root), rcfile_path=str(directories["rcs"]),
                macro_path=str(directories["macros"]), morgue_path=str(directories["morgue"]),
                inprogress_path=str(directories["locks"]), socket_path=str(directories["sockets"]),
                env=dict(HOME=str(directories["home"]), CRAWL_LIBRARY_DIR=str(directories["library"])),
                options=["-no-gdb", "-extra-opt-last", "show_more=false", "-seed", "9548842358735470601"]),
                use_template=False)
            with patch.dict(config.games, {"coop": params}, clear=True), \
                 patch.dict(config.server_config, enable_ttyrecs=False, reconnect_grace_period=0.1), \
                 patch.dict(ws_handler.PARTY_ROOMS, {}, clear=True), \
                 patch.dict(ws_handler.USER_PARTY_SPECS, {}, clear=True), \
                 patch.object(userdb, "settings_db", database), \
                 patch.object(process_handler.CrawlProcessHandlerBase, "_send_client"), \
                 patch.object(ws_handler, "update_all_lobbys"), \
                 patch.object(ws_handler, "update_global_status"), \
                 patch.object(ws_handler, "remove_in_lobbys"):
                try:
                    host_connection, host = await self.connect_user("Host")
                    guest_connection, guest = await self.connect_user("Guest")
                    self.send(host_connection, "party_room_create", game_id="coop", name="Retry fixture")
                    await self.message(host_connection, "party_rooms_list")
                    room = ws_handler.PARTY_ROOMS["room-Host"]
                    self.send(host_connection, "party_room_update_slot", slot=1, state="closed")
                    self.send(host_connection, "party_room_update_slot", slot=2, state="closed")
                    self.send(guest_connection, "party_room_join", room_id="room-Host", slot=3, hero_name="ReservedPeer")
                    await self.wait_for(lambda: room["slots"][3]["username"] == "Guest", "Guest staging reservation")
                    with patch.object(host, "library_prepare_start", side_effect=ValueError("Fixture preflight denial")):
                        self.send(host_connection, "party_room_launch", room_id="room-Host")
                        await self.message(host_connection, "library_error")
                        self.send(host_connection, "ping")
                        await self.message(host_connection, "pong")
                    self.assertEqual(room["status"], "staging")
                    self.assertIsNone(host.process)
                    self.assertNotIn("Host", ws_handler.USER_PARTY_SPECS)
                    self.assertFalse(host._library_fresh)
                    REPORT["preflight_failure_preserved_staging"] = True
                    self.send(host_connection, "party_room_launch", room_id="room-Host")
                    started = await self.message(host_connection, "game_started")
                    launched = await self.message(guest_connection, "party_room_launched")
                    self.assertEqual(launched["slot"], 1)
                    game = host.process
                    self.assertIsNotNone(game)
                    child = game.process
                    children.append((child.pid, child, game))
                    REPORT["native_pid"] = child.pid
                    await self.wait_for(lambda: self.member(game, 0).get("name")
                        and game.player_streams.native_ready, "Native startup and host view", 45)
                    self.assertEqual(game.party_members, {"Host": 0, "Guest": 1})
                    self.assertEqual(self.member(game, 0)["name"], room["slots"][0]["hero_name"])
                    REPORT["chosen_host_hero_name_preserved"] = True
                    self.assertEqual(room["status"], "launched")
                    self.send(guest_connection, "watch", username="Host", expedition_id=started["expedition_id"])
                    await self.message(guest_connection, "watching_started")
                    self.send(guest_connection, "join_party", slot=1)
                    await self.wait_for(lambda: guest.party_member_active
                        and self.member(game, 1).get("name") == "ReservedPeer", "Reserved guest joins native hero")
                    before = self.member(game, 1)["turns"]
                    self.send(guest_connection, "key", keycode=46)
                    await self.wait_for(lambda: self.member(game, 1).get("turns") == before + 1
                        and not game.activity_pump.inflight, "Guest native action")
                    third_connection, third = await self.connect_user("Third")
                    self.send(third_connection, "watch", username="Host", expedition_id=started["expedition_id"])
                    await self.message(third_connection, "watching_started")
                    self.send(third_connection, "join_party", slot=2)
                    await self.wait_for(lambda: third.party_member_active and self.member(game, 2).get("name"),
                                        "Late human join")
                    self.assertEqual(game.party_members, {"Host": 0, "Guest": 1, "Third": 2})
                    before = self.member(game, 2)["turns"]
                    self.send(third_connection, "key", keycode=46)
                    await self.wait_for(lambda: self.member(game, 2).get("turns") == before + 1
                        and not game.activity_pump.inflight, "Late guest action")
                    self.send(guest_connection, "join_party", slot=1)
                    self.send(guest_connection, "ping")
                    await self.message(guest_connection, "pong")
                    self.assertEqual(len(game.party_members), 3)
                    expected_names = [self.member(game, slot)["name"] for slot in range(3)]
                    REPORT.update(real_process_launcher=True, compacted_guest_seat=True,
                        guest_action=True, late_join_and_action=True, repeated_join_idempotent=True)
                    self.send(host_connection, "library_save", exit=True)
                    await self.wait_for(lambda: child.returncode is not None, "Native save and exit", 20)
                    self.assertEqual(child.returncode, 0)
                    self.assertEqual(room["status"], "staging")
                    saved = game_library.get_game(started["expedition_id"])
                    self.assertTrue(game_library.save_files(saved))
                    self.send(host_connection, "expedition_open", id=saved["id"])
                    resumed = await self.message(host_connection, "game_started")
                    self.assertEqual(resumed["expedition_id"], saved["id"])
                    game = host.process
                    child = game.process
                    children.append((child.pid, child, game))
                    self.assertNotEqual(children[0][0], child.pid)
                    await self.wait_for(lambda: self.member(game, 0).get("name")
                        and game.player_streams.native_ready, "Restored native host", 45)
                    self.assertEqual(game.party_members, {"Host": 0, "Guest": 1, "Third": 2})
                    for connection, receiver, slot in ((guest_connection, guest, 1), (third_connection, third, 2)):
                        self.send(connection, "watch", username="Host", expedition_id=saved["id"])
                        await self.message(connection, "watching_started")
                        self.send(connection, "join_party", slot=slot)
                        await self.wait_for(lambda: receiver.party_member_active
                            and self.member(game, slot).get("name"), "Restored reserved guest")
                    self.assertEqual([self.member(game, slot)["name"] for slot in range(3)], expected_names)
                    before = self.member(game, 2)["turns"]
                    self.send(third_connection, "key", keycode=46)
                    await self.wait_for(lambda: self.member(game, 2).get("turns") == before + 1
                        and not game.activity_pump.inflight, "Restored late guest action")
                    self.send(host_connection, "library_save", exit=True)
                    await self.wait_for(lambda: child.returncode is not None, "Restored native save and exit", 20)
                    self.assertEqual(child.returncode, 0)
                    self.assertEqual(ws_handler.PARTY_ROOMS["room-Host"]["status"], "staging")
                    REPORT.update(real_library_resume=True, chosen_names_restored=True,
                                  late_join_reservation_restored=True, resumed_guest_action=True)
                    REPORT.update(passed=True, normal_saved_exit=True, room_returns_to_staging=True)
                finally:
                    # This registry is patched to this fixture only. Include a
                    # child that started before a failed game_started delivery.
                    for owned_game in list(self.processes.values()):
                        owned_child = owned_game.process
                        if owned_child and all(owned_child is not entry[1] for entry in children):
                            children.append((owned_child.pid, owned_child, owned_game))
                    for pid, owned_child, owned_game in children:
                        if owned_child.returncode is not None:
                            continue
                        if owned_game.process:
                            owned_game.stop()
                        deadline = time.monotonic() + 12
                        while owned_child.returncode is None and time.monotonic() < deadline:
                            await asyncio.sleep(0.05)
                        if owned_child.returncode is None:
                            owned_child.send_signal(signal.SIGKILL)
                            await self.wait_for(lambda: owned_child.poll() is not None, "Owned child cleanup", 5)
                    REPORT["native_closeouts"] = [dict(pid=pid, exited=owned_child.returncode is not None,
                        exit_code=owned_child.returncode) for pid, owned_child, _ in children]
                    REPORT["owned_process_exited"] = all(item["exited"] for item in REPORT["native_closeouts"])
                    if game:
                        REPORT["last_party"] = game.party_control.state
                    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    ENGINE, OUTPUT = args.engine.resolve(), args.output.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__).resolve(), ENGINE / "crawl"]
    files += list(Path(__file__).resolve().parents[1].joinpath("webtiles").glob("*.py"))
    files += [path for path in (ENGINE / "dat").rglob("*") if path.is_file()]
    source = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    (OUTPUT / "binding.json").write_text(json.dumps(dict(source=source, engine=str(ENGINE),
        resources=dict(native_games=2, simultaneous_native_games=1, builds=0, browsers=0, fixture_authentication=True,
                       existing_saves=False)), indent=2) + "\n")
    REPORT = dict(passed=False, existing_saves_used=False, engine_sha256=source[str(ENGINE / "crawl")])
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        LobbyLaunchTests("test_failed_launch_retry_and_real_native_joins")]))
    REPORT["source_unchanged"] = source == {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    REPORT["passed"] = REPORT["passed"] and result.wasSuccessful() and REPORT["source_unchanged"]
    (OUTPUT / "report.json").write_text(json.dumps(REPORT, indent=2) + "\n")
    raise SystemExit(0 if REPORT["passed"] else 1)
