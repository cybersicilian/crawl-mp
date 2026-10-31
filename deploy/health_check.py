#!/usr/bin/env python3
"""Fail the systemd health unit when the app or persistent disk needs attention."""
import json
import datetime
import os
import pathlib
import shutil
import urllib.request

status = {"ok": False, "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
try:
    with urllib.request.urlopen("http://127.0.0.1:8080/status/version/", timeout=10) as response:
        status["application"] = bool(json.load(response)["python_supported"])
    disk = shutil.disk_usage("/var/lib/dcss")
    status["disk"] = disk.free / disk.total >= 0.15
    status["ok"] = status["application"] and status["disk"]
except (OSError, ValueError, KeyError):
    status["application"] = False
directory = pathlib.Path("/var/lib/dcss-health")
temporary = directory / "status.json.tmp"
temporary.write_text(json.dumps(status, separators=(",", ":")) + "\n")
temporary.chmod(0o644)
os.replace(temporary, directory / "status.json")
print(json.dumps(status))
raise SystemExit(0 if status["ok"] else 1)
