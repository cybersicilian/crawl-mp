"""Native output must share the event loop with WebSocket input and pings."""
import errno
import socket
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from tornado.ioloop import IOLoop
from tornado.testing import AsyncTestCase, gen_test

from webtiles.connection import WebtilesSocketConnection


class NativeReadBudgetTest(unittest.TestCase):
    def setUp(self):
        self.connection = WebtilesSocketConnection('/tmp/game.sock', Mock())
        self.connection.socket = Mock()
        self.connection.socket.recv.side_effect = [b'first\n', b'second\n',
                                                   BlockingIOError()]
        self.received = []
        self.connection.message_callback = self.received.append

    def test_small_response_is_delivered_immediately_in_order(self):
        self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, ['first\n', 'second\n'])

    def test_expensive_response_yields_before_draining_the_backlog(self):
        # One expensive message must not be followed by an unlimited number
        # of expensive messages in the same event-loop turn.
        with patch('webtiles.connection.time.monotonic', side_effect=[0, 1]):
            self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, ['first\n'])
        self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, ['first\n', 'second\n'])

    def test_packet_limit_yields_even_when_clock_does_not_advance(self):
        packets = [f'{index}\n'.encode() for index in range(256)]
        self.connection.socket.recv.side_effect = packets + [BlockingIOError()]
        with patch('webtiles.connection.time.monotonic', return_value=0):
            self.connection._handle_read(1, IOLoop.READ)
        self.assertGreater(len(self.received), 0)
        self.assertLess(len(self.received), len(packets))
        while len(self.received) < len(packets):
            self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, [packet.decode() for packet in packets])

    def test_fragment_is_retained_across_receive_passes(self):
        self.connection.socket.recv.side_effect = [b'hel', b'lo\n', BlockingIOError()]
        with patch('webtiles.connection.time.monotonic', side_effect=[0, 1]):
            self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, [])
        self.connection._handle_read(1, IOLoop.READ)
        self.assertEqual(self.received, ['hello\n'])

    def test_yielding_reader_does_not_skip_ready_outgoing_input(self):
        self.connection._flush_pending_messages = Mock()
        with patch('webtiles.connection.time.monotonic', side_effect=[0, 1]):
            self.connection._handle_read(1, IOLoop.READ | IOLoop.WRITE)
        self.assertEqual(self.received, ['first\n'])
        self.connection._flush_pending_messages.assert_called_once_with()

    def test_callback_can_close_the_socket(self):
        self.connection.message_callback = lambda message: setattr(self.connection, 'socket', None)
        self.connection._handle_read(1, IOLoop.READ)
        self.assertIsNone(self.connection.socket)


class NativeReadFairnessTest(AsyncTestCase):
    @gen_test(timeout=5)
    async def test_real_readable_socket_keeps_servicing_other_callbacks(self):
        with tempfile.TemporaryDirectory(prefix='dcss-read-', dir='/tmp') as directory:
            receiver = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            sender = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            receiver.bind(str(Path(directory) / 'read.sock'))
            receiver.setblocking(False)
            sender.setblocking(False)
            connection = WebtilesSocketConnection('unused', Mock())
            connection.socket = receiver
            # Fit within the platform's initial datagram queue limit.
            sent = []
            try:
                for index in range(256):
                    packet = f'{index}\n'.encode()
                    try:
                        sender.sendto(packet, receiver.getsockname())
                    except OSError as error:
                        if error.errno in (errno.EAGAIN, errno.EWOULDBLOCK, errno.ENOBUFS):
                            break
                        raise
                    sent.append(packet.decode())
                self.assertGreater(len(sent), 2)
                received, serviced = [], []
                done = self.io_loop.asyncio_loop.create_future()

                def receive(message):
                    received.append(message)
                    if len(received) == 1:
                        self.io_loop.add_callback(lambda: serviced.append(len(received)))
                    # Model native projection/fan-out work on the server loop.
                    time.sleep(0.006)
                    if len(received) == len(sent):
                        done.set_result(None)

                connection.message_callback = receive
                self.io_loop.add_handler(receiver.fileno(), connection._handle_read, IOLoop.READ)
                await done
                self.assertEqual(received, sent, 'Yielding must not lose or reorder native output')
                self.assertTrue(serviced, 'The other socket callback must run')
                self.assertLess(serviced[0], len(sent),
                                'A busy game must yield before all native output is drained')
            finally:
                self.io_loop.remove_handler(receiver.fileno())
                receiver.close()
                sender.close()


if __name__ == '__main__':
    unittest.main()
