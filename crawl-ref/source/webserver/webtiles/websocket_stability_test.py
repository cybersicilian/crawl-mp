"""Real Tornado framing verifies protocol and application heartbeats."""
import asyncio
import json
import unittest
from unittest.mock import Mock, patch

import tornado.web
from tornado.testing import AsyncHTTPTestCase, gen_test
from tornado.websocket import websocket_connect

from webtiles.ws_handler import CrawlWebSocket
from webtiles import config, ws_handler
from webtiles.websocket_settings import heartbeat_settings


class HeartbeatSocket(CrawlWebSocket):
    def open(self):
        self.application.socket = self

    def on_close(self):
        pass


class ConnectionLimitSocket(CrawlWebSocket):
    def reset_idle_timeouts(self):
        pass

    def send_lobby(self):
        self.send_message("accepted")


class WebSocketStabilityTest(AsyncHTTPTestCase):
    def get_app(self):
        return tornado.web.Application([(r"/socket", HeartbeatSocket), (r"/limit", ConnectionLimitSocket)],
            **heartbeat_settings(0.05, 0.05))

    @gen_test
    async def test_native_compression_deltas_and_measured_echo(self):
        connection = await websocket_connect(self.get_url("/socket").replace("http", "ws", 1),
            subprotocols=["native-deflate-v1", "no-compression"], compression_options={})
        try:
            self.assertEqual(connection.selected_subprotocol, "native-deflate-v1")
            self.assertFalse(self._app.socket.deflate, "Application compression must not double-compress native frames")
            self.assertIsNotNone(connection.protocol._decompressor)
            connection.write_message(json.dumps({"msg": "transport_hello", "version": 1}))
            self.assertEqual(json.loads(await connection.read_message()),
                             {"msgs": [{"msg": "transport_ready", "version": 1}]})
            self.assertTrue(self._app.socket.state_deltas)
            connection.write_message(json.dumps({"msg": "latency_probe", "sequence": 123}))
            self.assertEqual(json.loads(await connection.read_message()),
                             {"msgs": [{"msg": "transport_pong", "sequence": 123}]})
        finally:
            connection.close()

    @gen_test
    async def test_protocol_pongs_keep_javascript_idle_connection_alive(self):
        connection = await websocket_connect(self.get_url("/socket").replace("http", "ws", 1),
                                             subprotocols=["no-compression"])
        try:
            await asyncio.sleep(0.2)
            self.assertTrue(self._app.socket.received_pong)
            self.assertFalse(self._app.socket.client_closed)
            connection.write_message(json.dumps({"msg": "ping"}))
            message = json.loads(await connection.read_message())
            self.assertEqual(message, {"msgs": [{"msg": "pong"}]})
        finally:
            connection.close()

    @gen_test
    async def test_missing_protocol_pong_closes_the_dead_connection(self):
        connection = await websocket_connect(self.get_url("/socket").replace("http", "ws", 1),
                                             subprotocols=["no-compression"])
        original = connection.protocol._handle_message

        def without_pong(opcode, data):
            if opcode != 0x9:
                return original(opcode, data)

        connection.protocol._handle_message = without_pong
        try:
            self.assertIsNone(await connection.read_message())
        finally:
            connection.close()

    @gen_test
    async def test_disconnected_hosts_do_not_consume_the_connection_limit(self):
        previous = Mock(client_closed=True)
        ws_handler.sockets.add(previous)
        get_config = config.get
        values = {"max_connections": 1, "dgl_mode": True, "autologin": None}
        try:
            with patch.object(config, "get", side_effect=lambda key, *args:
                              values[key] if key in values else get_config(key, *args)):
                connection = await websocket_connect(self.get_url("/limit").replace("http", "ws", 1),
                                                     subprotocols=["no-compression"])
                try:
                    self.assertEqual(json.loads(await connection.read_message()),
                                     {"msgs": [{"msg": "accepted"}]})
                finally:
                    connection.close()
                    await asyncio.sleep(0.01)
        finally:
            ws_handler.sockets.discard(previous)


class HeartbeatSettingsTest(unittest.TestCase):
    def test_older_tornado_gets_an_interval_plus_a_response_window(self):
        self.assertEqual(heartbeat_settings(20, 20, (6, 4)),
                         {"websocket_ping_interval": 20, "websocket_ping_timeout": 40})

    def test_newer_tornado_measures_the_response_window_after_each_ping(self):
        self.assertEqual(heartbeat_settings(20, 20, (6, 5)),
                         {"websocket_ping_interval": 20, "websocket_ping_timeout": 20})

    def test_disabled_pings_and_default_timeouts_are_preserved(self):
        self.assertEqual(heartbeat_settings(0, 20, (6, 4))["websocket_ping_interval"], 0)
        self.assertIsNone(heartbeat_settings(20, None, (6, 4))["websocket_ping_timeout"])


if __name__ == "__main__":
    unittest.main()
