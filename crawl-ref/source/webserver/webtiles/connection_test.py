"""Backpressure retains ordered input instead of losing a keypress."""
import errno
import socket
import tempfile
from datetime import timedelta
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from tornado.ioloop import IOLoop
from tornado.concurrent import Future
from tornado.gen import with_timeout
from tornado.testing import AsyncTestCase, gen_test
from webtiles.connection import WebtilesSocketConnection


class InputBackpressureTest(unittest.TestCase):
    def setUp(self):
        self.connection = WebtilesSocketConnection('/tmp/crawl-test.sock', Mock())
        self.connection.socket = Mock()
        self.connection.socketpath = '/tmp/crawl-test-client.sock'
        self.connection.open = True
        self.loop_patch = patch('webtiles.connection.IOLoop.current')
        self.loop = self.loop_patch.start().return_value
        self.addCleanup(self.loop_patch.stop)

    def test_immediate_delivery_never_waits_for_a_timer(self):
        self.connection.send_message('key')
        self.connection.socket.sendto.assert_called_once_with(b'key', '/tmp/crawl-test.sock')
        self.loop.update_handler.assert_not_called()
        self.assertFalse(self.connection.pending_messages)

    def test_full_buffer_preserves_selection_and_following_keys_in_order(self):
        for code in (errno.EAGAIN, errno.ENOBUFS):
            with self.subTest(errno=code):
                sock = self.connection.socket
                sock.reset_mock()
                sock.sendto.side_effect = OSError(code, 'full')
                self.connection.send_message('switch_player')
                self.connection.send_message('first_key')
                self.connection.send_message('second_key')
                self.assertEqual(list(self.connection.pending_messages),
                                 [b'switch_player', b'first_key', b'second_key'])
                sock.sendto.side_effect = None
                sock.reset_mock()
                self.connection._handle_read(sock.fileno(), IOLoop.WRITE)
                self.assertEqual([call.args[0] for call in sock.sendto.call_args_list],
                                 [b'switch_player', b'first_key', b'second_key'])
                self.assertFalse(self.connection.pending_messages)
                self.assertFalse(self.connection.write_blocked)
                self.assertEqual(self.loop.update_handler.call_args.args[1], IOLoop.READ | IOLoop.ERROR)

    def test_interrupted_system_call_retries_the_same_packet(self):
        self.connection.socket.sendto.side_effect = [InterruptedError(errno.EINTR, 'signal'), 3]
        self.connection.send_message('key')
        self.assertEqual(self.connection.socket.sendto.call_count, 2)
        self.assertFalse(self.connection.pending_messages)

    def test_unsendable_packet_is_dropped_instead_of_wedging_later_input(self):
        # macOS caps AF_UNIX datagrams at 2048 bytes: an oversized chat note
        # used to stay at the head of the queue and fail every later keystroke.
        sock = self.connection.socket
        sock.sendto.side_effect = [OSError(errno.EMSGSIZE, 'too big'), 5, 5]
        self.connection.send_message('x' * 4096)
        self.assertFalse(self.connection.pending_messages)
        self.connection.logger.warning.assert_called_once()
        self.connection.send_message('key')
        self.assertEqual(sock.sendto.call_args.args[0], b'key')
        self.assertFalse(self.connection.pending_messages)
        self.assertTrue(self.connection.open)

    def test_close_cancels_the_socket_wait_and_keeps_primary_on_retry(self):
        connection = WebtilesSocketConnection('/nonexistent/dcss-test/game.sock', Mock())
        self.loop.add_timeout.return_value = 'pending-connect'
        connection.connect(primary=False)
        self.assertEqual(connection.connect_timeout, 'pending-connect')
        retry = self.loop.add_timeout.call_args.args[1]
        self.assertEqual(retry.args, (False,), 'The retry must not promote a spectated game to primary')
        connection.close()
        self.loop.remove_timeout.assert_called_once_with('pending-connect')
        self.assertIsNone(connection.connect_timeout)
        retry()
        self.assertEqual(self.loop.add_timeout.call_count, 1, 'A closed connection never re-arms the wait')
        self.assertIsNone(connection.socket)

    def test_closed_game_clears_pending_input_and_notifies_once(self):
        self.connection.close_callback = Mock()
        self.connection.socket.sendto.side_effect = FileNotFoundError()
        with patch('webtiles.connection.os.remove'):
            self.connection.send_message('key')
        self.assertFalse(self.connection.open)
        self.assertFalse(self.connection.pending_messages)
        self.connection.close_callback.assert_called_once()
        self.connection.send_message('late_key')
        self.assertFalse(self.connection.pending_messages, 'Closed sessions never retain stale input')


class WebSocketLatencyTest(unittest.TestCase):
    def test_established_websocket_disables_small_packet_buffering(self):
        from webtiles.ws_handler import CrawlWebSocket
        connection = Mock()
        connection.get_extensions.return_value = []
        with patch('webtiles.ws_handler.sockets', set()), \
                patch('webtiles.ws_handler.config.get', return_value=0):
            CrawlWebSocket.open(connection)
        connection.set_nodelay.assert_called_once_with(True)


class NativeSocketBackpressureTest(AsyncTestCase):
    @gen_test(timeout=5)
    async def test_full_unix_socket_drains_without_losing_or_reordering_input(self):
        with tempfile.TemporaryDirectory(prefix='dcss-input-', dir='/tmp') as directory:
            peer = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            peer.setblocking(False)
            peer.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
            peer.bind(str(Path(directory) / 'game.sock'))
            connection = WebtilesSocketConnection(str(Path(directory) / 'game.sock'), Mock())
            connection.socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            connection.socket.setblocking(False)
            connection.socketpath = str(Path(directory) / 'web.sock')
            connection.socket.bind(connection.socketpath)
            connection.open = True
            self.io_loop.add_handler(connection.socket.fileno(), connection._handle_read, IOLoop.READ)
            packets = [(str(index) + ':' + 'x' * 100).encode() for index in range(512)]
            received = []
            finished = Future()

            def drain(fd, events):
                while len(received) < len(packets):
                    try:
                        received.append(peer.recv(2048))
                    except BlockingIOError:
                        return
                if not finished.done():
                    finished.set_result(None)

            try:
                for packet in packets:
                    connection.send_message(packet)
                self.assertTrue(connection.pending_messages, 'Exercise actual OS backpressure')
                self.io_loop.add_handler(peer.fileno(), drain, IOLoop.READ)
                await with_timeout(timedelta(seconds=3), finished)
                self.assertEqual(received, packets)
                self.assertFalse(connection.pending_messages)
                self.assertFalse(connection.write_blocked)
            finally:
                self.io_loop.remove_handler(peer.fileno())
                peer.close()
                connection.close()


if __name__ == '__main__':
    unittest.main()
