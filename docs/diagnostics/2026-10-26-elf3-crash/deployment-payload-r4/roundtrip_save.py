"""Load a private native checkpoint and save through the normal game command."""
import argparse
import copy
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
import termios
import time


def merge(target, update):
    for key, value in update.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            merge(target[key], value)
        else:
            target[key] = copy.deepcopy(value)


def verify(config, output):
    source, save = Path(config["source"]), Path(config["save"])
    assert save.is_file() and save.name == "JediJosh.cs"
    assert hashlib.sha256(save.read_bytes()).hexdigest() == config["expected_save_sha256"]
    assert save.resolve().is_relative_to(Path(config["private_root"]).resolve())
    assert not save.resolve().is_relative_to(Path("/var/lib/dcss/rcs"))
    output.mkdir(mode=0o700, exist_ok=False)
    (output / "morgue").mkdir()
    peer = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    peer.bind(str(output / "peer.sock"))
    peer.setblocking(False)
    native_socket = output / "engine.sock"
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    env = dict(os.environ, TERM="xterm", CRAWL_DIR=str(source), CRAWL_RC="/dev/null",
               CRAWL_SAVE_DIR=str(save.parent), **config["record_environment"])
    command = [str(source / "crawl"), "-dir", str(source), "-rc", "/dev/null",
               "-name", "JediJosh", "-macro", "/dev/null", "-no-gdb",
               "-morgue", str(output / "morgue"),
               "-extra-opt-last", "restart_after_game=false",
               "-webtiles-socket", str(native_socket), "-await-connection"]
    process = subprocess.Popen(command, cwd=output, env=env, stdin=slave,
                               stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    os.set_blocking(master, False)
    selector = selectors.DefaultSelector()
    selector.register(master, selectors.EVENT_READ, "terminal")
    selector.register(peer, selectors.EVENT_READ, "native")
    attached, saved = False, False
    state, identity, progress, party = {}, {}, None, {}
    pending, terminal, messages = b"", bytearray(), []
    failure = None
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if not attached and native_socket.exists():
                peer.sendto(b'{"msg":"attach","primary":true}', str(native_socket))
                attached = True
            for key, _ in selector.select(0.05):
                if key.data == "terminal":
                    try:
                        terminal.extend(os.read(master, 65536))
                    except OSError:
                        selector.unregister(master)
                    continue
                pending += peer.recv(262144)
                if not pending.endswith(b"\n"):
                    continue
                packet, pending = pending, b""
                for line in packet.decode().splitlines():
                    try:
                        obj = json.loads(line.removeprefix("*"))
                    except json.JSONDecodeError:
                        continue
                    messages.append(obj)
                    if obj.get("msg") == "player":
                        merge(state, obj)
                    if obj.get("msg") == "record_identity":
                        identity.update(obj)
                    if obj.get("msg") == "party_state":
                        party = copy.deepcopy(obj)
                    if obj.get("msg") == "input_mode" and obj.get("mode") == 1 and not saved:
                        assert state.get("name") == "JediJosh"
                        assert (state.get("place"), state.get("depth")) == (
                            config["expected_place"], config["expected_depth"]), (
                                state.get("place"), state.get("depth"))
                        assert identity.get("game_id") == config["record_environment"]["CRAWL_GAME_ID"]
                        assert state.get("hp", 0) > 0
                        progress = copy.deepcopy(state)
                        peer.sendto(b'{"msg":"key","keycode":19}', str(native_socket))
                        saved = True
            if process.poll() is not None:
                break
    except BaseException as error:
        failure = repr(error)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
        selector.close()
        peer.close()
        os.close(master)
        (output / "terminal.log").write_bytes(terminal)
        (output / "native.json").write_text(json.dumps(messages))
        report = {"exit_code": process.returncode, "save_key_sent": saved,
                  "player": progress or state, "identity": identity, "party": party,
                  "native_pid": process.pid, "process_exited": process.poll() is not None,
                  "failure": failure,
                  "save_sha256": hashlib.sha256(save.read_bytes()).hexdigest()}
        (output / "report.json").write_text(json.dumps(report, indent=2))
    assert report["exit_code"] == 0 and saved and failure is None, {
        key: report[key] for key in ("exit_code", "save_key_sent", "failure")}
    print(json.dumps({"passed": True, "save_sha256": report["save_sha256"],
                      "player": {key: report["player"].get(key) for key in
                                 ("name", "species", "xl", "hp", "hp_max", "gold", "turn", "place", "depth")}}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    verify(json.loads(args.config.read_text()), args.output)
