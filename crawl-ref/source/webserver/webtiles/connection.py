import fcntl
import errno
import os
import os.path
import socket
import tempfile
import time
import warnings
from collections import deque

from tornado.escape import json_encode
from tornado.escape import to_unicode
from tornado.escape import utf8
from tornado.ioloop import IOLoop

from webtiles import config, util


class WebtilesSocketConnection(object):
    def __init__(self, socketpath, logger):
        self.crawl_socketpath = socketpath
        self.logger = logger
        self.message_callback = None
        self.socket = None
        self.socketpath = None
        self.open = False
        self.close_callback = None
        self.username = ""

        self.msg_buffer = None
        self.pending_messages = deque()
        self.write_blocked = False

    def connect(self, primary = True):
        if not os.path.exists(self.crawl_socketpath):
            # Wait until the socket exists
            IOLoop.current().add_timeout(time.time() + 1, self.connect)
            return

        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.socket.setblocking(False)

        # Set close-on-exec
        flags = fcntl.fcntl(self.socket.fileno(), fcntl.F_GETFD)
        fcntl.fcntl(self.socket.fileno(), flags | fcntl.FD_CLOEXEC)

        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if (self.socket.getsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF) < 2048):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 2048)
        # on linux, the following may have no effect (setting SO_RCVBUF is
        # often documented as having no effect), but on other unixes, it
        # matters quite a bit. The choice of 212992 is based on the linux
        # default.
        if (self.socket.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF) < 212992):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 212992)

        # Bind to a temp path
        # there's a race condition here...
        # note that mktmp here is deprecated, and we may eventually need to
        # do something different. One simple idea is to keep sockets in a
        # temporary directory generated from tempfile calls (i.e
        # tempfile.mkdtemp), but use our own naming scheme. Because this is a
        # socket, regular calls in tempfile are not appropriate.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self.socketpath = tempfile.mktemp(dir=config.get('server_socket_path'),
                                              prefix="crawl", suffix=".socket")
        self.socket.bind(self.socketpath)

        # Install handler
        IOLoop.current().add_handler(self.socket.fileno(),
                                     self._handle_read,
                                     IOLoop.ERROR | IOLoop.READ)

        msg = json_encode({
                "msg": "attach",
                "primary": primary
                })

        self.open = True

        self.send_message(utf8(msg))

    def _handle_read(self, fd, events):
        if events & IOLoop.READ:
            while self.socket is not None:
                try:
                    data = self.socket.recv(128 * 1024, socket.MSG_DONTWAIT)
                except BlockingIOError:
                    break
                if not data:
                    break
                self._handle_data(data)

        if events & IOLoop.WRITE:
            self._flush_pending_messages()

        if events & IOLoop.ERROR:
            pass

    def _handle_data(self, data): # type: (bytes) -> None
        if self.msg_buffer is not None:
            data = self.msg_buffer + data

        # TODO: is this check safe? Decoding won't always work for
        # fragmented messages...
        if data[-1] != b'\n'[0]:
            # All messages from crawl end with \n.
            # If this one doesn't, it's fragmented.
            self.msg_buffer = data
        else:
            self.msg_buffer = None

            if self.message_callback:
                self.message_callback(to_unicode(data))

    def send_message(self, data): # type: (str) -> None
        if not self.open:
            return
        self.pending_messages.append(utf8(data))
        self._flush_pending_messages()

    def _flush_pending_messages(self):
        while self.socket is not None and self.pending_messages:
            try:
                self.socket.sendto(self.pending_messages[0], self.crawl_socketpath)
            except OSError as error:
                if error.errno == errno.EINTR:
                    continue
                if error.errno in (errno.EAGAIN, errno.EWOULDBLOCK, errno.ENOBUFS):
                    # Backpressure must not discard keystrokes or reorder hero
                    # selection and the input that follows it. Retry on writable.
                    if not self.write_blocked:
                        self.write_blocked = True
                        IOLoop.current().update_handler(self.socket.fileno(),
                            IOLoop.READ | IOLoop.ERROR | IOLoop.WRITE)
                    return
                if (isinstance(error, (socket.timeout, FileNotFoundError))
                        or error.errno == errno.ECONNREFUSED):
                    self.logger.warning("Game socket closed during sendto", exc_info=True)
                    self.close()
                    return
                raise
            self.pending_messages.popleft()
        if self.socket is not None and self.write_blocked:
            self.write_blocked = False
            IOLoop.current().update_handler(self.socket.fileno(), IOLoop.READ | IOLoop.ERROR)

    def close(self):
        self.open = False
        self.pending_messages.clear()
        self.write_blocked = False
        if self.socket:
            IOLoop.current().remove_handler(self.socket.fileno())
            self.socket.close()
            os.remove(self.socketpath)
            self.socket = None
        if self.close_callback:
            self.close_callback()
