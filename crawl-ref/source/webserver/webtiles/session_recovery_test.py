import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from webtiles import session_recovery
from webtiles.ws_handler import CrawlWebSocket


class SessionRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.loop = Mock()
        self.loop.call_later.return_value = "timeout"
        self.patch_loop = patch("webtiles.session_recovery.IOLoop.current", return_value=self.loop)
        self.patch_config = patch("webtiles.session_recovery.config.get", return_value=30)
        self.patch_loop.start()
        self.patch_config.start()
        self.addCleanup(self.patch_loop.stop)
        self.addCleanup(self.patch_config.stop)
        self.process = SimpleNamespace(process=Mock(), conn=Mock(open=True), record_id="save-a",
            stop=Mock(), remove_watcher=Mock(), add_watcher=Mock())
        self.old = SimpleNamespace(username="Host", game_id="coop", client_closed=True,
            process=self.process, reconnect_timeout=None, clear_timeouts=Mock(), try_cleanup=Mock(),
            send_message=Mock(), close=Mock())
        self.new = SimpleNamespace(username="host", game_id="coop", process=None,
            _on_crawl_end=Mock(), reset_idle_timeouts=Mock(), send_message=Mock(), restore_blocklist=Mock())

    def test_drop_retains_process_and_expires(self):
        self.assertTrue(session_recovery.defer_stop(self.old))
        self.process.stop.assert_not_called()
        self.process.remove_watcher.assert_called_once_with(self.old)
        self.assertEqual(self.old.reconnect_timeout, "timeout")
        self.loop.call_later.call_args.args[1]()
        self.process.stop.assert_called_once()
        self.assertIsNone(self.old.reconnect_timeout)

    def test_host_drop_does_not_stop_connected_teammates_after_grace(self):
        connected = {1}
        self.process.party_control = SimpleNamespace(multiplayer=True, connected_slots=lambda: connected)
        session_recovery.defer_stop(self.old)
        expire = self.loop.call_later.call_args.args[1]
        expire()
        self.process.stop.assert_not_called()
        self.assertIsNotNone(self.old.reconnect_timeout)
        self.assertTrue(session_recovery.reclaim(self.new, [self.old]))
        self.assertIs(self.new.process, self.process)
        self.process.stop.assert_not_called()

    def test_hostless_expedition_stops_after_last_human_disconnects(self):
        connected = {1}
        self.process.party_control = SimpleNamespace(multiplayer=True, connected_slots=lambda: connected,
                                                       ai_slots={2})
        session_recovery.defer_stop(self.old)
        expire = self.loop.call_later.call_args.args[1]
        expire()
        self.process.stop.assert_not_called()
        connected.clear()
        expire()
        self.process.stop.assert_called_once()
        self.assertIsNone(self.old.reconnect_timeout)

    def test_reclaim_transfers_callback_and_same_process_without_starting_another(self):
        session_recovery.defer_stop(self.old)
        self.assertTrue(session_recovery.reclaim(self.new, [self.old]))
        self.assertIs(self.new.process, self.process)
        self.assertIsNone(self.old.process)
        self.assertIs(self.process.end_callback, self.new._on_crawl_end)
        self.process.add_watcher.assert_called_once_with(self.new)
        self.new.send_message.assert_called_once_with("game_started", game_id="coop", expedition_id="save-a")
        self.loop.remove_timeout.assert_called_once_with("timeout")
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))
        self.process.stop.assert_not_called()

    def test_authenticated_owner_and_matching_mode_are_required(self):
        for fields in ({"username": None}, {"username": "Guest"}, {"game_id": "other"}):
            with self.subTest(fields=fields):
                session_recovery.defer_stop(self.old)
                receiver = SimpleNamespace(**{**vars(self.new), **fields})
                self.assertFalse(session_recovery.reclaim(receiver, [self.old]))

    def test_explicit_resume_transfers_live_session_without_stopping_or_reloading(self):
        self.old.client_closed = False
        self.new._library_resume_id = "save-a"

        def close_previous(code, reason):
            # on_close sees no owned engine, so it cannot stop the expedition.
            self.assertIsNone(self.old.process)
            self.assertIs(self.new.process, self.process)

        self.old.close.side_effect = close_previous
        self.assertTrue(session_recovery.reclaim(self.new, [self.old]))
        self.assertIsNone(self.new._library_resume_id)
        self.assertIs(self.process.end_callback, self.new._on_crawl_end)
        self.process.remove_watcher.assert_called_once_with(self.old)
        self.process.add_watcher.assert_called_once_with(self.new)
        self.process.stop.assert_not_called()
        reason = "This expedition was opened in another session."
        self.old.send_message.assert_called_once_with("close", reason=reason)
        self.old.close.assert_called_once_with(1000, reason)
        self.old.clear_timeouts.assert_called_once()
        self.new.send_message.assert_called_once_with("game_started", game_id="coop", expedition_id="save-a")

    def test_live_takeover_never_replaces_a_different_save_mode_or_account(self):
        self.old.client_closed = False
        for fields in ({"username": None}, {"username": "Guest"}, {"game_id": "other"},
                       {"_library_resume_id": "save-b"}, {"_library_fresh": True}):
            with self.subTest(fields=fields):
                receiver = SimpleNamespace(**{**vars(self.new), **fields})
                self.assertFalse(session_recovery.reclaim(receiver, [self.old]))
                self.assertIsNone(receiver.process)
        self.old.close.assert_not_called()
        self.process.remove_watcher.assert_not_called()

    def test_new_expedition_does_not_wait_on_or_take_over_a_live_session(self):
        self.old.client_closed = False
        self.new._library_fresh = True
        self.assertFalse(session_recovery.reclaim(self.new, [self.old], reconnect=True))
        self.new.send_message.assert_not_called()
        self.old.close.assert_not_called()

    def test_other_save_fresh_start_and_expired_grace_cannot_be_reclaimed(self):
        session_recovery.defer_stop(self.old)
        self.new._library_resume_id = "save-b"
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))
        self.new._library_resume_id = "save-a"
        self.new._library_fresh = True
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))
        self.new._library_fresh = False
        self.old.reconnect_timeout = None
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))

    def test_stopped_or_disconnected_engine_is_not_reclaimed(self):
        session_recovery.defer_stop(self.old)
        self.process.conn.open = False
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))
        self.process.conn.open = True
        self.process.process = None
        self.assertFalse(session_recovery.reclaim(self.new, [self.old]))

    def test_disabled_grace_and_anonymous_connections_stop_normally(self):
        with patch("webtiles.session_recovery.config.get", return_value=0):
            self.assertFalse(session_recovery.defer_stop(self.old))
        self.old.username = None
        self.assertFalse(session_recovery.defer_stop(self.old))
        self.loop.call_later.assert_not_called()

    def test_half_open_previous_socket_is_waited_for_without_taking_control(self):
        self.old.client_closed = False
        self.assertTrue(session_recovery.reclaim(self.new, [self.old], reconnect=True))
        self.new.send_message.assert_called_once_with("connection_wait", retry_after=1)
        self.assertIsNone(self.new.process)
        self.process.stop.assert_not_called()
        self.process.add_watcher.assert_not_called()

    def test_exact_link_does_not_wait_on_another_live_save_of_the_same_mode(self):
        self.old.client_closed = False
        self.new._library_resume_id = "save-b"
        self.assertFalse(session_recovery.reclaim(self.new, [self.old], reconnect=True))
        self.new.send_message.assert_not_called()

    def close_owner(self, code=1000, connected=frozenset({1}), ai_slots=frozenset()):
        self.process.party_control = SimpleNamespace(multiplayer=True,
            connected_slots=lambda: set(connected), ai_slots=set(ai_slots))
        self.old.close_code = code
        self.old.is_running = lambda: True
        self.old.total_message_bytes = self.old.failed_messages = self.old.failed_on_messages = 0
        self.old.logger = Mock()
        with patch("webtiles.ws_handler.shutting_down", False):
            CrawlWebSocket.on_close(self.old)

    def test_normal_host_socket_close_keeps_connected_teammates_playing(self):
        self.close_owner()
        self.process.stop.assert_not_called()
        self.assertIsNotNone(self.old.reconnect_timeout)
        self.loop.call_later.call_args.args[1]()
        self.process.stop.assert_not_called()
        self.assertTrue(session_recovery.reclaim(self.new, [self.old]))
        self.assertIs(self.new.process, self.process)

    def test_normal_close_without_a_connected_human_stops_immediately(self):
        for connected, ai_slots in ((set(), set()), ({None}, set()), ({2}, {2})):
            with self.subTest(connected=connected, ai_slots=ai_slots):
                self.process.stop.reset_mock()
                self.close_owner(connected=connected, ai_slots=ai_slots)
                self.process.stop.assert_called_once()

    def test_policy_close_still_stops_even_with_connected_teammates(self):
        self.close_owner(code=1008)
        self.process.stop.assert_called_once()
        self.assertIsNone(self.old.reconnect_timeout)

    def test_server_shutdown_still_stops_even_with_connected_teammates(self):
        self.close_owner(code=1001)
        self.process.stop.reset_mock()
        with patch("webtiles.ws_handler.shutting_down", True):
            CrawlWebSocket.on_close(self.old)
        self.process.stop.assert_called_once()

    def test_native_pong_and_browser_ping_count_as_liveness(self):
        socket = SimpleNamespace(received_pong=False, send_message=Mock())
        CrawlWebSocket.on_pong(socket, b"")
        self.assertTrue(socket.received_pong)
        socket.received_pong = False
        CrawlWebSocket.connection_ping(socket)
        self.assertTrue(socket.received_pong)
        socket.send_message.assert_called_once_with("pong")


if __name__ == "__main__":
    unittest.main()
