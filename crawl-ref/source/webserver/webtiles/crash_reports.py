"""Owner-only crash diagnostics; never expose native packages or arbitrary paths."""
from pathlib import Path
import asyncio
import json
import os
import re
from urllib.parse import unquote

import tornado.web

from webtiles import auth, config, game_library

_reports = {}
MAX_REPORT_BYTES = 256 * 1024


def public_base(value):
    if not isinstance(value, str) or value.strip().lower() in {"", "none", "null"}:
        return None
    return value


def capture(process, line):
    match = re.search(r"(?:crash report:|Writing crash info to)\s*(.+?\.txt)", line, re.I)
    if not match:
        return
    root = process.game_params.templated("morgue_path", username=process.username)
    if not root:
        return
    root = Path(root).resolve()
    path = Path(match.group(1).strip())
    if not path.is_absolute():
        path = Path.cwd() / path
    path = path.resolve()
    if path.parent == root and path.name.startswith("crash-"):
        process.crash_report_path = path


def register(process):
    identifier = getattr(process, "record_id", None)
    path = getattr(process, "crash_report_path", None)
    if not identifier or not path or not path.is_file():
        return None
    _reports[identifier] = (process.username, path)
    # The normal exit-dialog adapter adds .txt for native dump URLs.
    return "/api/crash-report/" + identifier


def read(identifier, username):
    entry = _reports.get(identifier)
    if not entry or not username or entry[0].lower() != username.lower():
        return None
    try:
        with entry[1].open("rb") as stream:
            content = stream.read(MAX_REPORT_BYTES + 1)
    except OSError:
        return None
    suffix = "\n[Report truncated at 256 KiB.]\n" if len(content) > MAX_REPORT_BYTES else ""
    return content[:MAX_REPORT_BYTES].decode("utf-8", errors="replace") + suffix


async def checkpoint_loadable(game):
    """Require a confirmed checkpoint and the engine's read-only save check."""
    files = game_library.save_files(game)
    definition = config.games.get(game["mode"])
    if not game.get("saved_at") or len(files) != 1 or definition is None:
        return False
    process = None
    try:
        call = definition.get_call_base() + ["-rc", os.devnull, "-save-json", files[0]]
        process = await asyncio.create_subprocess_exec(*call, stdout=asyncio.subprocess.PIPE,
                                                       stderr=asyncio.subprocess.DEVNULL)
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=8)
        if process.returncode or len(stdout) > 64 * 1024:
            return False
        payload = json.loads(stdout)
        return isinstance(payload, dict) and any(
            isinstance(entry, dict) and entry.get("loadable") is True for entry in payload.values())
    except (OSError, ValueError, asyncio.TimeoutError):
        if process and process.returncode is None:
            process.kill()
            await process.communicate()
        return False


class CrashReportHandler(tornado.web.RequestHandler):
    def get(self, identifier):
        cookie = self.get_cookie("login", "")
        username, valid = auth.check_login_cookie(cookie)
        if not valid:
            # jquery.cookie URI-encodes the existing %20 delimiter once more.
            username, valid = auth.check_login_cookie(unquote(cookie))
        report = read(identifier, username) if valid else None
        if report is None:
            raise tornado.web.HTTPError(404)
        self.set_header("Cache-Control", "no-store")
        self.set_header("Content-Type", "text/plain; charset=utf-8")
        self.set_header("X-Content-Type-Options", "nosniff")
        self.set_header("Content-Disposition", 'attachment; filename="crash-report.txt"')
        self.write(report)
