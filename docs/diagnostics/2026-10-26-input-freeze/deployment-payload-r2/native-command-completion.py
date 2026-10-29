"""Probe tracked native commands in a disposable two-player game.

Run native probes through the shared heavy gate on a local host. The source
directory supplies an already built engine and data; all writable state lives
in a new temporary directory. No browser, account, or existing save is used.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import selectors
import signal
import socket
import struct
import subprocess
import tempfile
import termios
import time


class NativeProbe:
    def __init__(self, source, root):
        self.root = root
        self.source = source
        self.packets = []
        self.pending = b""
        self.terminal = bytearray()
        self.party = {}
        self.ready_tokens = []
        self.mode = None
        for name in ("saves", "morgue", "library"):
            (root / name).mkdir()
        self.peer = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.peer.bind(str(root / "peer.sock"))
        self.peer.setblocking(False)
        self.address = str(root / "native.sock")
        assert len(self.address.encode()) < 100
        master, slave = pty.openpty()
        self.master = master
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
        env = dict(os.environ, TERM="xterm", CRAWL_DIR=str(source),
                   CRAWL_RC="/dev/null", CRAWL_SAVE_DIR=str(root / "saves"),
                   CRAWL_LIBRARY_DIR=str(root / "library"),
                   CRAWL_RECORD_PATH=str(root / "record.json"),
                   CRAWL_ACCOUNT_0="Probe", CRAWL_ACCOUNT_1="Peer")
        command = [str(source / "crawl"), "-dir", str(source), "-rc", "/dev/null",
                   "-name", "TokenProbe", "-species", "Human", "-background", "Conjurer",
                   "-extra-opt-last", "show_more=false",
                   "-extra-opt-last", "restart_after_game=false",
                   "-seed", "9548842358735470601", "-party",
                   "TokenProbe:Human/Conjurer,TokenPeer:Human/Conjurer,mp=on",
                   "-macro", "/dev/null", "-no-gdb", "-morgue", str(root / "morgue"),
                   "-webtiles-socket", self.address, "-await-connection"]
        self.process = subprocess.Popen(command, cwd=root, env=env, stdin=slave,
                                        stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        os.set_blocking(master, False)
        self.selector = selectors.DefaultSelector()
        self.selector.register(master, selectors.EVENT_READ, "terminal")
        self.selector.register(self.peer, selectors.EVENT_READ, "native")
        self.attached = False

    def send(self, kind, **fields):
        self.peer.sendto(json.dumps(dict(msg=kind, **fields)).encode(), self.address)

    def poll(self, timeout=0.05):
        if not self.attached and Path(self.address).exists():
            self.send("attach", primary=True)
            self.attached = True
        for key, _ in self.selector.select(timeout):
            if key.data == "terminal":
                try:
                    self.terminal.extend(os.read(self.master, 65536))
                except OSError:
                    self.selector.unregister(self.master)
                continue
            self.pending += self.peer.recv(262144)
            while b"\n" in self.pending:
                line, self.pending = self.pending.split(b"\n", 1)
                if not line:
                    continue
                packet = json.loads(line.removeprefix(b"*"))
                self.packets.append(packet)
                view = packet.get("view") is True
                payload = packet.get("payload", packet)
                if payload.get("msg") == "party_state":
                    self.party[packet.get("slot", 0)] = payload
                if payload.get("msg") == "input_mode" and not view:
                    self.mode = payload.get("mode")
                if payload.get("msg") == "party_activity_ready" and not view:
                    self.ready_tokens.append(payload["activity_id"])

    def until(self, predicate, seconds=5):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.poll()
            if predicate():
                return True
            if self.process.poll() is not None:
                raise AssertionError("Native engine exited: " + self.terminal.decode(errors="replace")[-3000:])
        return False

    def turns(self):
        return [member["turns"] for member in self.party[0]["members"]]

    def close(self):
        if self.process.poll() is None:
            os.killpg(self.process.pid, signal.SIGTERM)
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(self.process.pid, signal.SIGKILL)
                self.process.wait(timeout=5)
        self.selector.close()
        self.peer.close()
        os.close(self.master)


def verify(source, output, expect_missing):
    report = {"source": str(source), "native_sha256": hashlib.sha256(
        (source / "crawl").read_bytes()).hexdigest(), "existing_saves_used": False,
        "checks": [], "expect_missing": expect_missing}
    with tempfile.TemporaryDirectory(prefix="dcss-token-", dir="/tmp") as temporary:
        probe = NativeProbe(source, Path(temporary))
        try:
            assert probe.until(lambda: probe.mode == 1 and len(probe.party) == 2, 40), "Dungeon startup"
            assert probe.party[0]["multiplayer"] is True
            assert not probe.party[0].get("enemy_initiative"), "Fixture requires no visible enemies"
            for request, fields in enumerate((
                dict(msg="menu_action", action="primary", entry=0),
                dict(msg="target_cursor", x=-1, y=-1),
                dict(msg="inv_item_action", slot=-1),
                dict(msg="key", keycode=0),
            ), 1):
                before = probe.turns()
                probe.send(fields["msg"], **{key: value for key, value in fields.items() if key != "msg"},
                           player_id=0, activity_id=request)
                completed = probe.until(lambda: request in probe.ready_tokens, 2)
                report["checks"].append(dict(request=request, command=fields["msg"], completed=completed))
                if expect_missing:
                    assert not completed, "The original missing acknowledgement was not reproduced"
                    report["original_deadlock_reproduced"] = True
                    break
                assert completed, ("Missing exact completion token", request)
                assert probe.turns() == before, "No-op command spent a turn"
                assert probe.ready_tokens.count(request) == 1, "Duplicate completion"
            if not expect_missing:
                for slot in (1, 0, 1):
                    before = probe.turns()
                    request += 1
                    probe.send("key", keycode=46, player_id=slot, activity_id=request)
                    assert probe.until(lambda: request in probe.ready_tokens
                                       and probe.turns()[slot] > before[slot]), "Following action blocked"
                    assert probe.turns()[slot] == before[slot] + 1
                    assert probe.turns()[1 - slot] == before[1 - slot]
                report["checks"].append(dict(alternating_actions=3, actor_ownership_preserved=True))
            report["passed"] = True
        finally:
            probe.close()
            report["owned_process_exited"] = probe.process.poll() is not None
            output.mkdir(parents=True, exist_ok=True)
            (output / "terminal.log").write_bytes(probe.terminal)
            (output / "native.json").write_text(json.dumps(probe.packets))
            (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-missing", action="store_true")
    arguments = parser.parse_args()
    verify(arguments.source.resolve(), arguments.output.resolve(), arguments.expect_missing)
