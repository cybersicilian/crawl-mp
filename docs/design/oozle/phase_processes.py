"""Observe descendants across sessions; signal only unchanged process identities.

Uses the same PID/start-time/command binding as the existing DCSS menu QA
supervisor. Process groups alone miss native games and browser subprocesses
that create a new session.
"""
import os
import signal
import subprocess
import time


class ProcessObserver:
    def __init__(self):
        self.owned = {}

    def observe(self):
        probe = subprocess.Popen(["ps", "-axo", "pid=,ppid=,pgid=,lstart=,command="],
                                 stdout=subprocess.PIPE, text=True)
        try:
            output = probe.communicate(timeout=15)[0]
        except BaseException:
            # Reap the observation process even when the host stalls or the
            # phase is interrupted; closure must include the monitor itself.
            probe.kill()
            probe.communicate(timeout=5)
            raise
        if probe.returncode:
            raise RuntimeError("Process observation failed; preserve reservation")
        current = {}
        for line in output.splitlines():
            parts = line.split(None, 8)
            if len(parts) == 9:
                current[int(parts[0])] = {"pid": int(parts[0]), "ppid": int(parts[1]),
                    "pgid": int(parts[2]), "started": " ".join(parts[3:8]), "command": parts[8]}
        current.pop(probe.pid, None)
        found = {os.getpid()}
        while True:
            more = {pid for pid, row in current.items() if row["ppid"] in found}
            if more <= found:
                break
            found |= more
        for pid in found - {os.getpid()}:
            if pid in current:
                self.owned[pid] = current[pid]
        return current

    def live(self):
        current = self.observe()
        return [pid for pid, row in self.owned.items() if pid in current
                and current[pid]["started"] == row["started"]
                and current[pid]["command"] == row["command"]]

    def close(self):
        for signum in (signal.SIGTERM, signal.SIGKILL):
            for pid in self.live():
                try:
                    os.kill(pid, signum)
                except ProcessLookupError:
                    pass
            until = time.monotonic() + 10
            while self.live() and time.monotonic() < until:
                time.sleep(0.2)
        remaining = self.live()
        return {"ownedProcesses": list(self.owned.values()),
                "remainingMatchingOwnedPids": remaining,
                "allOwnedProcessesGone": not remaining}
