"""Real WebSocket handoffs retain the running engine and its other players."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import Mock, patch

import tornado.web
from tornado.testing import AsyncHTTPTestCase, gen_test
from tornado.websocket import websocket_connect

from webtiles import config, game_library, ws_handler
from webtiles.game_library_test import Workspace
from webtiles.ws_handler import CrawlWebSocket


class HandoffSocket(CrawlWebSocket):
    """Keep production routing/cleanup, isolating authentication and native I/O."""
    def open(self):
        self.deflate = False
        ws_handler.sockets.add(self)
        self.application.sessions.append(self)

    def init_user(self, callback):
        callback(0)

    def update_db_info(self):
        return True

    def is_admin(self):
        return False

    def account_restricted(self):
        return False

    def game_id_allowed(self, game_id):
        return True

    def send_lobby_html(self):
        pass

    def go_lobby(self):
        self.send_message("go_lobby")

    def reset_idle_timeouts(self):
        pass

    def reset_lobby_timeout(self):
        pass

    def restore_blocklist(self):
        pass


class SessionHandoffTests(Workspace, AsyncHTTPTestCase):
    def setUp(self):
        self.processes = {}
        patches = [
            patch.object(config, "server_config", {"dgl_mode": True}),
            patch.object(config, "games", {"coop": Mock()}),
            patch.object(ws_handler, "sockets", set()),
            patch("webtiles.process_handler.processes", self.processes),
            patch("webtiles.userdb.user_passwd_match", return_value=(True, "Host", None)),
        ]
        for name in ("profile_appearance", "profile_graphics"):
            module = getattr(ws_handler, name, None)
            if module is not None:
                patches.append(patch.object(module, "send_state"))
        for configuration in patches:
            configuration.start()
            self.addCleanup(configuration.stop)
        self.connections = []
        super().setUp()
        self.game = game_library.create_game("Host", "coop")

    def tearDown(self):
        for connection in self.connections:
            connection.close()
        super().tearDown()

    def get_app(self):
        app = tornado.web.Application([(r"/socket", HandoffSocket)])
        app.sessions = []
        return app

    async def read_until(self, connection, kind):
        while True:
            raw = await connection.read_message()
            self.assertIsNotNone(raw, "Socket closed before " + kind)
            messages = json.loads(raw).get("msgs", [])
            self.assertFalse(any(message["msg"] == "library_error" for message in messages), messages)
            for message in messages:
                if message["msg"] == kind:
                    return message

    async def login(self):
        connection = await websocket_connect(self.get_url("/socket").replace("http", "ws", 1),
                                             subprotocols=["no-compression"])
        self.connections.append(connection)
        connection.write_message(json.dumps(dict(msg="login", username="Host", password="fixture")))
        await self.read_until(connection, "login_success")
        return connection, self._app.sessions[-1]

    async def resume(self, connection, reconnect=False):
        connection.write_message(json.dumps(dict(msg="expedition_open", id=self.game["id"],
                                                 reconnect=reconnect)))

    @gen_test
    async def test_dropped_host_can_reclaim_after_grace_while_guest_keeps_playing(self):
        old_connection, old = await self.login()
        guest = object()
        watchers = {old, guest}
        process = SimpleNamespace(username="Host", record_id=self.game["id"], process=Mock(),
            conn=Mock(open=True), stop=Mock(), handle_input=Mock(),
            party_control=SimpleNamespace(multiplayer=True, connected_slots=lambda: {1} if guest in watchers else set()),
            remove_watcher=Mock(side_effect=watchers.discard), add_watcher=Mock(side_effect=watchers.add))
        old.process, old.game_id = process, "coop"
        self.processes["fixture"] = process
        with patch.dict(config.server_config, reconnect_grace_period=0.03):
            old_connection.close(code=1001)
            await asyncio.sleep(0.15)
            self.assertTrue(old.client_closed)
            self.assertNotIn(old, watchers)
            self.assertIsNotNone(old.reconnect_timeout)
            process.stop.assert_not_called()
            new_connection, new = await self.login()
            await self.resume(new_connection, reconnect=True)
            await self.read_until(new_connection, "game_started")
            self.assertIsNone(old.process)
            self.assertIs(new.process, process)
            self.assertEqual(watchers, {new, guest})
            self.assertIsNone(old.reconnect_timeout)
            process.stop.assert_not_called()

    @gen_test
    async def test_explicit_resume_hands_off_unsaved_game_and_closes_previous_socket(self):
        old_connection, old = await self.login()
        # No native package exists: this must retain the current engine state.
        guest = object()
        watchers = {old, guest}
        process = SimpleNamespace(username="Host", record_id=self.game["id"], process=Mock(),
                                  conn=Mock(open=True), stop=Mock(), handle_input=Mock(),
                                  remove_watcher=Mock(side_effect=watchers.discard),
                                  add_watcher=Mock(side_effect=watchers.add))
        old.process, old.game_id = process, "coop"
        self.processes["fixture"] = process
        new_connection, new = await self.login()

        # An automatic reconnect must not pull control off an active computer.
        await self.resume(new_connection, reconnect=True)
        await self.read_until(new_connection, "connection_wait")
        self.assertIs(old.process, process)
        self.assertIsNone(new.process)

        await self.resume(new_connection)
        started = await self.read_until(new_connection, "game_started")
        self.assertEqual(started["expedition_id"], self.game["id"])
        moved = await self.read_until(old_connection, "close")
        self.assertIn("another session", moved["reason"])
        self.assertIsNone(await old_connection.read_message())
        self.assertEqual(old_connection.close_code, 1000)
        self.assertIsNone(old.process)
        self.assertIs(new.process, process)
        self.assertEqual(watchers, {new, guest})
        self.assertEqual(process.end_callback, new._on_crawl_end)
        process.stop.assert_not_called()

        new_connection.write_message(json.dumps(dict(msg="library_save")))
        # Ordered WebSocket messages ensure saving was routed before this pong.
        new_connection.write_message(json.dumps(dict(msg="ping")))
        await self.read_until(new_connection, "pong")
        self.assertEqual(json.loads(process.handle_input.call_args.args[0]),
                         dict(msg="record_save", exit=False))
        self.assertIs(process.handle_input.call_args.kwargs["source"], new)
        process.stop.assert_not_called()
