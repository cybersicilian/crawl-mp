#!/usr/bin/env python3
"""Play a seeded solo game through the WebTiles socket and count native work.

The driver speaks the same datagram protocol as the web server, so the engine
runs its production path, including every update it would send to a browser.
Instructions and CPU time come from the kernel's accounting for the crawl
process alone, so they stay comparable on a busy host where wall time does not.

The transcript hash covers everything the player is told. Two builds that agree
on it played the same game, which is what makes their costs comparable and is
the check that a performance change kept behaviour intact.

    util/engine-bench.py --crawl ./crawl --seeds 1,2,3 --commands 600 --out run.json
"""
import argparse
import collections
import ctypes
import fcntl
import hashlib
import json
import os
import pty
import re
import shutil
import signal
import socket
import statistics
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time

MODE_NORMAL, MODE_COMMAND, MODE_MORE, MODE_PROMPT, MODE_YESNO = 0, 1, 5, 7, 8
ESCAPE, TAB = 27, 9
DEFAULT_RC = """
show_more = false
autofight_stop = 25
explore_auto_rest = true
weapon = war axe
travel_delay = 1
"""


class RusageV4(ctypes.Structure):
    _fields_ = [("uuid", ctypes.c_ubyte * 16)] + [(name, ctypes.c_uint64) for name in (
        "user_time", "system_time", "pkg_idle_wkups", "interrupt_wkups", "pageins",
        "wired_size", "resident_size", "phys_footprint", "proc_start_abstime",
        "proc_exit_abstime", "child_user_time", "child_system_time",
        "child_pkg_idle_wkups", "child_interrupt_wkups", "child_pageins",
        "child_elapsed_abstime", "diskio_bytesread", "diskio_byteswritten",
        "cpu_time_qos_default", "cpu_time_qos_maintenance", "cpu_time_qos_background",
        "cpu_time_qos_utility", "cpu_time_qos_legacy", "cpu_time_qos_user_initiated",
        "cpu_time_qos_user_interactive", "billed_system_time", "serviced_system_time",
        "logical_writes", "lifetime_max_phys_footprint", "instructions", "cycles",
        "billed_energy", "serviced_energy", "interval_max_phys_footprint", "runnable_time")]


class MachTimebase(ctypes.Structure):
    _fields_ = [("numer", ctypes.c_uint32), ("denom", ctypes.c_uint32)]


class ProcessCounters:
    """Instructions, CPU time and memory of one live process."""

    def __init__(self, pid):
        self.pid = pid
        self.libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
        timebase = MachTimebase()
        self.libc.mach_timebase_info(ctypes.byref(timebase))
        self.ticks_to_ms = timebase.numer / timebase.denom / 1e6

    def read(self):
        usage = RusageV4()
        if self.libc.proc_pid_rusage(self.pid, 4, ctypes.byref(usage)):
            raise OSError(ctypes.get_errno(), "proc_pid_rusage")
        return dict(instructions=usage.instructions, cycles=usage.cycles,
                    cpu_ms=(usage.user_time + usage.system_time) * self.ticks_to_ms,
                    system_ms=usage.system_time * self.ticks_to_ms,
                    written=usage.diskio_byteswritten, footprint=usage.phys_footprint)

    @staticmethod
    def delta(before, after):
        return {key: after[key] - before[key] for key in before if key != "footprint"}


class Engine:
    """One crawl process attached over its WebTiles datagram socket."""

    def __init__(self, args, seed, workdir):
        self.workdir = workdir
        self.engine_path = os.path.join(workdir, "e.sock")
        self.client_path = os.path.join(workdir, "c.sock")
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4 * 1024 * 1024)
        self.sock.bind(self.client_path)
        self.partial = b""
        self.mode = MODE_NORMAL
        self.mode_seen = self.batch_done = False
        self.stat_prompt = False
        self.hero = self.hero_at_command = None
        self.stale_cells = 0
        self.messages = []
        self.lines = []
        self.counts = collections.Counter()
        self.bytes = collections.Counter()
        self.transcript = hashlib.sha256()
        self.player = {}
        self.dead = False
        rc = os.path.join(workdir, "bench.rc")
        with open(rc, "w") as handle:
            handle.write(DEFAULT_RC + (args.rc_extra or ""))
        with open(os.path.join(workdir, "bench.macro"), "w"):
            pass
        for name in ("saves", "morgue"):
            os.makedirs(os.path.join(workdir, name), exist_ok=True)
        command = [os.path.abspath(args.crawl), "-name", "Bench", "-rc", rc,
                   "-macro", os.path.join(workdir, "bench.macro"),
                   "-morgue", os.path.join(workdir, "morgue"),
                   "-dir", os.path.join(workdir, "saves"),
                   "-species", args.species, "-background", args.background,
                   "-seed", str(seed), "-no-player-bones",
                   "-extra-opt-last", "restart_after_game=false",
                   "-webtiles-socket", self.engine_path, "-await-connection"]
        command += args.engine_arg or []
        if args.cache and os.path.isdir(args.cache):
            shutil.copytree(args.cache, os.path.join(workdir, "saves", "saves"), copy_function=shutil.copy2)
        # Production runs the engine on a pty that the server drains, and an
        # always-readable stdin would make the engine spin on console input.
        self.terminal, follower = pty.openpty()
        fcntl.ioctl(follower, termios.TIOCSWINSZ, struct.pack("HHHH", 24, 80, 0, 0))
        self.terminal_bytes = 0
        self.tail = b""
        threading.Thread(target=self.read_terminal, daemon=True).start()
        # The server's launch environment, including the record the library reads.
        environment = dict(os.environ, LC_ALL="en_US.UTF-8", LANG="en_US.UTF-8", TERM="xterm",
                           CRAWL_GAME_ID="bench", CRAWL_OWNER_ID="bench",
                           CRAWL_RECORD_PATH=os.path.join(workdir, "record.json"))
        self.process = subprocess.Popen(command, cwd=os.path.dirname(os.path.abspath(args.crawl)),
                                        stdin=follower, stdout=follower, stderr=follower, start_new_session=True,
                                        env=environment)
        os.close(follower)
        self.counters = ProcessCounters(self.process.pid)
        deadline = time.monotonic() + 60
        while not os.path.exists(self.engine_path):
            if self.process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("engine did not open its socket: " + self.log_tail())
            time.sleep(.002)
        self.send(dict(msg="attach", primary=True))

    def read_terminal(self):
        while True:
            try:
                data = os.read(self.terminal, 65536)
            except OSError:
                return
            if not data:
                return
            self.terminal_bytes += len(data)
            self.tail = (self.tail + data)[-800:]

    def log_tail(self):
        return self.tail.decode("utf8", "replace")

    def send(self, message):
        self.sock.sendto(json.dumps(message).encode(), self.engine_path)

    def key(self, keycode):
        self.drain(0)
        self.mode_seen = self.batch_done = False
        self.send(dict(msg="key", keycode=keycode))

    def note(self, message):
        kind = message.get("msg", "?")
        self.counts[kind] += 1
        if kind == "input_mode":
            self.mode = message.get("mode", 0)
            if self.mode != MODE_NORMAL:
                self.mode_seen = True
            if self.mode == MODE_COMMAND:
                self.hero_at_command = self.hero
        elif kind == "msgs":
            for line in message.get("messages", []):
                text = re.sub(r"<[^>]*>", "", line.get("text", ""))
                self.messages.append(text)
                self.stat_prompt = self.stat_prompt or "(S)trength" in text
                self.transcript.update(text.encode("utf8", "replace") + b"\n")
                self.lines.append(text)
        elif kind == "player":
            self.player.update({key: value for key, value in message.items()
                                 if key in ("hp", "hp_max", "turn", "time", "depth", "place", "xl")})
        elif kind == "party_state":
            members = message.get("members") or [{}]
            self.hero = members[0].get("pos")
        elif kind == "flush_messages":
            # The engine flushes right before it blocks, so everything the
            # next decision depends on has arrived once this follows the mode.
            self.batch_done = self.mode_seen
            # The client recentres its camera on the hero the moment it sees
            # the command mode. Ordinary steps are one cell behind until the
            # redraw that follows; a run must not leave it any further back.
            if self.batch_done and self.mode == MODE_COMMAND and self.hero and self.hero_at_command:
                self.stale_cells = max(self.stale_cells, max(abs(self.hero["x"] - self.hero_at_command["x"]),
                                                             abs(self.hero["y"] - self.hero_at_command["y"])))
        elif kind == "game_ended":
            self.dead = True

    def feed(self, data):
        self.partial += data
        lines = self.partial.split(b"\n")
        self.partial = lines.pop()
        for line in lines:
            if not line:
                continue
            body = line[1:] if line.startswith(b"*") else line
            try:
                message = json.loads(body)
            except ValueError:
                self.counts["undecoded"] += 1
                self.bytes["undecoded"] += len(line)
                continue
            self.bytes[message.get("msg", "?")] += len(line)
            self.note(message)

    def drain(self, timeout):
        """Read every pending datagram; returns False once the socket stays quiet."""
        self.sock.settimeout(timeout if timeout > 0 else 0)
        received = False
        while True:
            try:
                data = self.sock.recv(65536)
            except (BlockingIOError, socket.timeout):
                return received
            received = True
            self.feed(data)
            self.sock.settimeout(0)

    def wait_ready(self, limit=120):
        """Wait until the engine is blocked on the next input."""
        start = last = time.monotonic()
        before = self.counters.read()["instructions"]
        while time.monotonic() - start < limit:
            if self.process.poll() is not None:
                self.dead = True
                return
            if self.drain(.02):
                last = time.monotonic()
                if self.batch_done:
                    return
                continue
            now = time.monotonic()
            # Screens without a mode change, such as menus: quiet and not running.
            if now - last > .4:
                current = self.counters.read()["instructions"]
                if current == before:
                    return
                before, last = current, now
        raise RuntimeError("engine stayed busy past %ds" % limit)

    def close(self):
        if self.process.poll() is None:
            self.process.send_signal(signal.SIGHUP)
            try:
                self.process.wait(30)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.sock.close()


def play(args, seed):
    # Socket paths have a short length limit, so this stays under /tmp by default.
    workdir = tempfile.mkdtemp(prefix="eb", dir=args.tmp)
    engine = Engine(args, seed, workdir)
    samples, started = [], time.monotonic()
    result = dict(seed=seed)

    def step(kind, keycode):
        engine.messages = []
        before = engine.counters.read()
        turn_before = engine.player.get("time", 0)
        bytes_before, wall = sum(engine.bytes.values()), time.monotonic()
        engine.key(keycode)
        engine.wait_ready()
        # Leaving a menu reports no mode of its own, so travel can still be
        # starting. A key sent now would interrupt it and change the game.
        if kind == "descend":
            while engine.drain(.3):
                pass
        if engine.dead:
            return engine.messages
        delta = engine.counters.delta(before, engine.counters.read())
        samples.append(dict(kind=kind, wall_ms=(time.monotonic() - wall) * 1000,
                            aut=engine.player.get("time", 0) - turn_before,
                            bytes=sum(engine.bytes.values()) - bytes_before,
                            place=engine.player.get("place"), **delta))
        return engine.messages

    try:
        engine.wait_ready(180)
        settle = 0
        # Dismiss anything character creation left open.
        while engine.mode != MODE_COMMAND and settle < 8:
            step("setup", ESCAPE)
            settle += 1
        result["startup"] = engine.counters.read()
        result["startup"]["wall_ms"] = (time.monotonic() - started) * 1000
        samples.clear()
        if args.cache and not os.path.isdir(args.cache):
            shutil.copytree(os.path.join(workdir, "saves", "saves"), args.cache, copy_function=shutil.copy2,
                            ignore=shutil.ignore_patterns("*.cs", "*.lck", "*.tmp"))

        blocked = 0
        while len(samples) < args.commands and not engine.dead:
            if engine.stat_prompt:
                engine.stat_prompt = False
                step("level_up", ord("S"))
                continue
            if engine.mode in (MODE_MORE, MODE_PROMPT, MODE_YESNO):
                step("dismiss", ESCAPE)
                continue
            hp, hp_max = engine.player.get("hp", 1), engine.player.get("hp_max", 1)
            text = " ".join(step("explore", ord("o"))).lower()
            if engine.dead:
                break
            if any(word in text for word in ("done exploring", "explored", "unexplored")):
                place = engine.player.get("depth")
                step("find_stairs", ord("G"))
                step("descend", ord(">"))
                if engine.mode != MODE_COMMAND:
                    step("dismiss", ESCAPE)
                if engine.player.get("depth") == place:
                    step("descend", ord(">"))
                blocked = 0
            elif any(word in text for word in ("nearby", "in view", "not with", "can't explore")):
                for _ in range(args.fight):
                    line = " ".join(step("fight", TAB)).lower()
                    if engine.dead or "no target" in line or "can't" in line:
                        break
                if hp * 2 < hp_max and not engine.dead:
                    step("rest", ord("5"))
                blocked += 1
                if blocked > 12 and not engine.dead:
                    step("flee", ord("<"))
                    blocked = 0
            else:
                blocked = 0
    finally:
        result["alive_at_end"] = not engine.dead
        if not engine.dead:
            try:
                result["totals"] = engine.counters.read()
            except OSError:
                pass
        exit_started = time.monotonic()
        engine.close()
        result["exit_wall_ms"] = (time.monotonic() - exit_started) * 1000
        saves = os.path.join(workdir, "saves", "saves")
        result["save_bytes"] = sum(os.path.getsize(os.path.join(saves, name))
                                   for name in os.listdir(saves) if name.endswith(".cs"))
        result["transcript"] = engine.transcript.hexdigest()
        result["lines"] = engine.lines
        result["keys"] = [(sample["kind"], sample["aut"]) for sample in samples]
        result["player"] = engine.player
        result["terminal_bytes"] = engine.terminal_bytes
        result["stale_cells"] = engine.stale_cells
        result["message_counts"] = dict(engine.counts)
        result["message_bytes"] = dict(engine.bytes)
        result["samples"] = samples
        if args.keep:
            result["workdir"] = workdir
        else:
            shutil.rmtree(workdir, ignore_errors=True)
    return result


def summarize(runs):
    table = collections.defaultdict(list)
    for run in runs:
        for sample in run["samples"]:
            table[sample["kind"]].append(sample)
    lines = ["%-14s %6s %10s %9s %9s %9s %10s" % ("kind", "n", "Minstr/cmd", "med ms", "p95 ms", "KB/cmd", "total G")]
    for kind, samples in sorted(table.items(), key=lambda item: -sum(s["instructions"] for s in item[1])):
        cpu = sorted(sample["cpu_ms"] for sample in samples)
        instructions = sum(sample["instructions"] for sample in samples)
        lines.append("%-14s %6d %10.2f %9.2f %9.2f %9.1f %10.2f" % (
            kind, len(samples), instructions / len(samples) / 1e6, statistics.median(cpu),
            cpu[int(len(cpu) * .95)], sum(s["bytes"] for s in samples) / len(samples) / 1024, instructions / 1e9))
    aut = sum(sample["aut"] for samples in table.values() for sample in samples)
    instructions = sum(sample["instructions"] for samples in table.values() for sample in samples)
    lines.append("total %.2f G instructions, %.0f game turns, %.2f M/turn" % (
        instructions / 1e9, aut / 10, instructions / 1e6 / max(aut / 10, 1)))
    for run in runs:
        lines.append("seed %s: %s %s startup %.0f Minstr, camera at most %d cells behind, transcript %s" % (
            run["seed"], run["player"].get("place"), "alive" if run["alive_at_end"] else "ended",
            run.get("startup", {}).get("instructions", 0) / 1e6, run["stale_cells"], run["transcript"][:12]))
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--crawl", default="./crawl")
    parser.add_argument("--seeds", default="1,2,3")
    parser.add_argument("--commands", type=int, default=400)
    parser.add_argument("--fight", type=int, default=6)
    parser.add_argument("--species", default="Minotaur")
    parser.add_argument("--background", default="Fighter")
    parser.add_argument("--rc-extra", default="")
    parser.add_argument("--engine-arg", action="append")
    parser.add_argument("--tmp", default="/tmp")
    parser.add_argument("--cache", help="directory that keeps compiled level data between runs")
    parser.add_argument("--keep", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args()
    runs = [play(args, int(seed)) for seed in args.seeds.split(",")]
    if args.out:
        with open(args.out, "w") as handle:
            json.dump(dict(crawl=args.crawl, commands=args.commands, runs=runs), handle)
    print(summarize(runs))


if __name__ == "__main__":
    sys.exit(main())
