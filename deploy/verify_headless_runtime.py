"""Play a throwaway game the way webtiles starts one, before activation.

The health check only proves that the web server answers, and every game starts
with -headless while ttyrecs are off. This runs the release binary on a pty over
its datagram socket and saves on hangup, as the runtime user. Everything it
writes stays in a temporary directory.
"""
import fcntl
import json
import os
from pathlib import Path
import pty
import signal
import socket
import struct
import sys
import tempfile
import termios
import threading
import time

# A new crawl directory compiles its level cache before the first game.
STARTUP_SECONDS = 300
HANGUP_SECONDS = 30
EXPECTED = {"player", "map", "input_mode"}


def spawn(command, directory, cwd):
    pid, terminal = pty.fork()
    if pid == 0:
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
        os.chdir(cwd)
        os.execve(command[0], command, dict(
            os.environ, TERM="linux", LINES="24", COLUMNS="80",
            LC_ALL=os.environ.get("LC_ALL") or os.environ.get("LANG") or "en_US.UTF-8",
            CRAWL_GAME_ID="headless-check", CRAWL_OWNER_ID="headless-check",
            CRAWL_RECORD_PATH=str(directory / "record.json")))
    return pid, terminal


def keep_tail(terminal, tail):
    # The server drains this pty too; a full one would block the engine.
    while True:
        try:
            data = os.read(terminal, 65536)
        except OSError:
            return
        if not data:
            return
        tail[:] = (bytes(tail) + data)[-800:]


def failure(reason, seen, tail):
    return "%s; saw %s; terminal: %s" % (
        reason, sorted(seen), bytes(tail).decode("utf8", "replace").strip())


def wait_for_exit(pid, seconds, client, drained):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if os.waitpid(pid, os.WNOHANG)[0] == pid:
            return True
        # Production keeps consuming WebTiles output during shutdown. A full
        # datagram queue otherwise blocks the engine before it can exit.
        try:
            drained['bytes'] += len(client.recv(256 * 1024))
            drained['packets'] += 1
        except socket.timeout:
            pass
    return False


def reached_game(pid, engine_socket, client, seen, tail):
    attached = False
    partial = b""
    deadline = time.monotonic() + STARTUP_SECONDS
    while time.monotonic() < deadline:
        if os.waitpid(pid, os.WNOHANG)[0] == pid:
            raise SystemExit(failure("engine exited during startup", seen, tail))
        if not attached and engine_socket.exists():
            client.sendto(json.dumps({"msg": "attach", "primary": True}).encode(),
                          str(engine_socket))
            attached = True
        try:
            partial += client.recv(256 * 1024)
        except socket.timeout:
            continue
        lines = partial.split(b"\n")
        partial = lines.pop()
        for line in lines:
            try:
                seen.add(json.loads(line.removeprefix(b"*")).get("msg"))
            except ValueError:
                continue
        if EXPECTED <= seen:
            return
    raise SystemExit(failure("engine reached no game", seen, tail))


def verify(source, directory):
    engine_socket = directory / "e.sock"
    rc = directory / "check.rc"
    rc.write_text("weapon = war axe\n")
    client = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    client.bind(str(directory / "c.sock"))
    client.settimeout(.2)
    # -headless stays last, as webtiles keeps it: a following argument is a script.
    pid, terminal = spawn([str(source / "crawl"), "-name", "HeadlessCheck", "-rc", str(rc),
                           "-macro", str(directory / "check.macro"),
                           "-morgue", str(directory / "morgue"), "-dir", str(directory),
                           "-species", "Minotaur", "-background", "Fighter", "-seed", "1",
                           "-no-player-bones", "-extra-opt-last", "restart_after_game=false",
                           "-webtiles-socket", str(engine_socket), "-await-connection",
                           "-headless"], directory, source)
    seen, tail = set(), bytearray()
    drained = {'packets': 0, 'bytes': 0}
    threading.Thread(target=keep_tail, args=(terminal, tail), daemon=True).start()
    try:
        reached_game(pid, engine_socket, client, seen, tail)
        os.kill(pid, signal.SIGHUP)
        if not wait_for_exit(pid, HANGUP_SECONDS, client, drained):
            raise SystemExit(failure("engine ignored hangup after draining %s" % drained, seen, tail))
        if not any(directory.glob("**/*.cs")):
            raise SystemExit(failure("hangup wrote no save", seen, tail))
        return drained
    finally:
        client.close()
        try:
            # Only signal an unreaped child; a completed child's PID may be reused.
            if os.waitpid(pid, os.WNOHANG)[0] == 0:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass


source = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix="dcss-", ignore_cleanup_errors=True) as location:
    drained = verify(source, Path(location))
print(json.dumps({"headless_launch": "playable", "hangup_save": True,
                  "shutdown_output_drained": drained, "passed": True}))
