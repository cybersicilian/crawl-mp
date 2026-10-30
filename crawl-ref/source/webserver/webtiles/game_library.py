"""Persistent expedition records and public identities; native saves stay private.

The engine owns hero/item identity and known state. This index owns account
identity, launch configuration and save locations. Neither names nor seeds are IDs.
"""
import datetime
from contextlib import contextmanager
import glob
import json
import os
import shutil
import sqlite3
import threading
import uuid

from webtiles.record_visibility import is_test_account

BASE_DIR = os.environ.get("CRAWL_LIBRARY_DIR", "./rcs/library")
KINDS = ("games", "players", "randarts")
EXIT_STATUSES = {"dead": "fallen", "won": "won", "quit": "quit", "bailed out": "left"}
TERMINAL_STATUSES = frozenset(EXIT_STATUSES.values())
GAME_SELECT = ("SELECT games.*, deleted_saves.deleted_at AS save_deleted_at FROM games "
               "LEFT JOIN deleted_saves ON games.id = deleted_saves.game_id")
_ingested_versions = {}
# ingest() runs on the library worker and on the IOLoop (tests, callers).
_ingested_lock = threading.Lock()


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds")


def valid_id(value):
    try:
        return str(uuid.UUID(str(value))) == value
    except (ValueError, TypeError, AttributeError):
        return False


@contextmanager
def connect(base_dir=BASE_DIR):
    os.makedirs(base_dir, exist_ok=True)
    conn = sqlite3.connect(os.path.join(base_dir, "index.sqlite"), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS accounts (
            username TEXT PRIMARY KEY COLLATE NOCASE, id TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS games (
            id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, owner TEXT NOT NULL,
            mode TEXT NOT NULL, title TEXT NOT NULL, party_json TEXT NOT NULL,
            save_dir TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL, saved_at TEXT, snapshot_json TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS games_owner ON games(owner_id, updated_at);
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL, game_id TEXT NOT NULL,
            name TEXT NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS entities_game ON entities(game_id, kind);
        CREATE TABLE IF NOT EXISTS deleted_saves (
            game_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
    """)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def account_id(username, base_dir=BASE_DIR):
    with connect(base_dir) as conn:
        conn.execute("INSERT OR IGNORE INTO accounts VALUES (?, ?)",
                     (username, str(uuid.uuid4())))
        return conn.execute("SELECT id FROM accounts WHERE username = ?",
                            (username,)).fetchone()["id"]


def create_game(owner, mode, title="", party=None, base_dir=BASE_DIR):
    identifier = str(uuid.uuid4())
    save_dir = os.path.abspath(os.path.join(base_dir, "saves", identifier))
    os.makedirs(save_dir, exist_ok=True)
    timestamp = now()
    owner_id = account_id(owner, base_dir)
    with connect(base_dir) as conn:
        conn.execute("INSERT INTO games VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (identifier, owner_id, owner, mode, title or owner + "'s expedition",
                      json.dumps(party or {}), save_dir, "starting", timestamp,
                      timestamp, None, "{}"))
    return get_game(identifier, base_dir)


def get_game(identifier, base_dir=BASE_DIR):
    with connect(base_dir) as conn:
        row = conn.execute(GAME_SELECT + " WHERE games.id = ?", (identifier,)).fetchone()
        return dict(row) if row else None


def save_files(game):
    # .cs packages include all hero chunks, visited levels and RNG state.
    if game["save_deleted_at"] or game["status"] in TERMINAL_STATUSES:
        return []
    return glob.glob(os.path.join(game["save_dir"], "**", "*.cs"), recursive=True)


def delete_save(identifier, owner, active_ids=(), base_dir=BASE_DIR):
    """Remove only the owner's isolated native save, retaining public history."""
    if not owner or not valid_id(identifier):
        raise ValueError("That saved game ID is invalid.")
    game = get_game(identifier, base_dir)
    if not game or game["owner"].casefold() != owner.casefold():
        raise ValueError("This saved game is not owned by your account.")
    if identifier in active_ids:
        raise ValueError("This expedition is running. Save and return to the lobby before deleting it.")
    expected = os.path.join(os.path.realpath(os.path.join(base_dir, "saves")), identifier)
    if os.path.realpath(game["save_dir"]) != expected or os.path.islink(game["save_dir"]):
        raise ValueError("This save's storage location could not be verified.")
    ingest(identifier, base_dir)
    if os.path.exists(expected):
        shutil.rmtree(expected)
    with connect(base_dir) as conn:
        conn.execute("INSERT OR IGNORE INTO deleted_saves VALUES (?, ?)", (identifier, now()))


def purge_fallen_saves(owner, active_ids=(), base_dir=BASE_DIR):
    """Discard confirmed dead runs' checkpoints, retaining their history.

    A downed party member, low HP, missing package or stale 'active' status is
    never death evidence. Only the engine's terminal 'fallen' outcome qualifies.
    The caller supplies current process identities, including detached engines.
    """
    with connect(base_dir) as conn:
        rows = conn.execute(GAME_SELECT + " WHERE owner = ? COLLATE NOCASE "
                            "AND status = 'fallen' AND deleted_saves.game_id IS NULL",
                            (owner,)).fetchall()
    deleted, failed = [], []
    for row in rows:
        if row["id"] in active_ids:
            continue
        try:
            delete_save(row["id"], owner, active_ids, base_dir)
        except (OSError, ValueError):
            failed.append(row["id"])
        else:
            deleted.append(row["id"])
    return {"deleted": deleted, "failed": failed}


def latest_game(owner, mode, base_dir=BASE_DIR):
    with connect(base_dir) as conn:
        rows = conn.execute(GAME_SELECT + " WHERE owner = ? COLLATE NOCASE "
                            "AND mode = ? ORDER BY updated_at DESC", (owner, mode)).fetchall()
        return next((dict(r) for r in rows if save_files(r)), None)


def import_legacy(owner, mode, root, base_dir=BASE_DIR):
    """Copy an existing native package on first use; never remove its original."""
    subdir = "sprint" if mode.startswith("sprint-") else "descent" if mode.startswith("descent-") else ""
    source = os.path.join(root, "saves", subdir, owner + ".cs")
    if not os.path.isfile(source):
        return None
    game = create_game(owner, mode, owner + "'s existing game", base_dir=base_dir)
    target = os.path.join(game["save_dir"], subdir)
    os.makedirs(target, exist_ok=True)
    shutil.copy2(source, os.path.join(target, owner + ".cs"))
    finish_game(game["id"], "saved", base_dir)
    return get_game(game["id"], base_dir)


def update_party(identifier, party, base_dir=BASE_DIR):
    with connect(base_dir) as conn:
        conn.execute("UPDATE games SET party_json = ?, updated_at = ? WHERE id = ?",
                     (json.dumps(party), now(), identifier))


def finish_game(identifier, reason, base_dir=BASE_DIR):
    game = get_game(identifier, base_dir)
    if not game:
        return
    # Shutdown/reconnect callbacks must never resurrect an ended expedition.
    status = game["status"] if game["status"] in TERMINAL_STATUSES else EXIT_STATUSES.get(reason)
    if not status:
        status = "saved" if save_files(game) else "unfinished"
    timestamp = now()
    with connect(base_dir) as conn:
        conn.execute("UPDATE games SET status = ?, updated_at = ?, "
                     "saved_at = CASE WHEN ? = 'saved' THEN ? ELSE saved_at END WHERE id = ?",
                     (status, timestamp, reason, timestamp, identifier))


def mark_active(identifier, base_dir=BASE_DIR):
    with connect(base_dir) as conn:
        conn.execute("UPDATE games SET status = 'active', updated_at = ? WHERE id = ?",
                     (now(), identifier))


def ingest(identifier, base_dir=BASE_DIR):
    if not valid_id(identifier):
        return
    path = os.path.join(base_dir, "events", identifier + ".json")
    try:
        version = os.stat(path).st_mtime_ns
        with _ingested_lock:
            if _ingested_versions.get(os.path.abspath(path)) == version:
                return
        with open(path, encoding="utf-8") as source:
            snapshot = json.load(source)
    except (OSError, ValueError):
        return
    if snapshot.get("id") != identifier:
        return
    with connect(base_dir) as conn:
        if not conn.execute("SELECT 1 FROM games WHERE id = ?", (identifier,)).fetchone():
            return False
        timestamp = now()
        conn.execute("UPDATE games SET snapshot_json = ?, updated_at = ? WHERE id = ?",
                     (json.dumps(snapshot), timestamp, identifier))
        for kind, key in (("players", "players"), ("randarts", "randarts")):
            for entity in snapshot.get(key, []):
                if not valid_id(entity.get("id")):
                    continue
                existing = conn.execute("SELECT game_id FROM entities WHERE id = ?",
                                        (entity["id"],)).fetchone()
                if existing and existing["game_id"] != identifier:
                    continue
                conn.execute("INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?, ?, ?)",
                             (entity["id"], kind, identifier, entity.get("name", "Unknown"),
                              json.dumps(entity), timestamp))
        saved_at = snapshot.get("saved_at")
        if saved_at:
            conn.execute("UPDATE games SET saved_at = ? WHERE id = ?", (saved_at, identifier))
    with _ingested_lock:
        _ingested_versions[os.path.abspath(path)] = version
    return True


def public_game(game):
    snapshot = json.loads(game["snapshot_json"])
    return {**{key: game[key] for key in
               ("id", "owner_id", "owner", "mode", "title", "status", "created_at", "updated_at", "saved_at", "save_deleted_at")},
            "kind": "games", "name": game["title"], "state": snapshot,
            "loadable": bool(save_files(game))}


def list_games(owner=None, base_dir=BASE_DIR, include_test=False):
    with connect(base_dir) as conn:
        if owner is None:
            rows = conn.execute(GAME_SELECT + " ORDER BY updated_at DESC").fetchall()
        else:
            # Filter in SQL instead of walking every account's rows in Python.
            rows = conn.execute(GAME_SELECT + " WHERE owner = ? COLLATE NOCASE "
                                "ORDER BY updated_at DESC", (owner,)).fetchall()
    result = []
    for row in rows:
        if owner is None and not include_test and is_test_account(row["owner"]):
            continue
        if ingest(row["id"], base_dir):
            # Only re-read the row when a newer event snapshot was just merged.
            row = get_game(row["id"], base_dir)
        result.append(public_game(row))
    return result


def list_entities(kind, base_dir=BASE_DIR):
    games = list_games(base_dir=base_dir)
    if kind == "games":
        return games
    if kind not in KINDS:
        return []
    visible_games = {game["id"] for game in games}
    with connect(base_dir) as conn:
        records = [{"id": row["id"], "name": row["name"], "kind": kind,
                    "game_id": row["game_id"]} for row in conn.execute(
                        "SELECT * FROM entities WHERE kind = ? ORDER BY updated_at DESC", (kind,))
                   if row["game_id"] in visible_games]
        if kind == "players":
            records = [{"id": row["id"], "name": row["username"], "kind": kind,
                        "type": "account"} for row in conn.execute("SELECT * FROM accounts")
                       if not is_test_account(row["username"])] + records
    return records


def get_entity(kind, identifier, base_dir=BASE_DIR):
    if kind not in KINDS or not valid_id(identifier):
        return None
    game = get_game(identifier, base_dir) if kind == "games" else None
    if game:
        ingest(identifier, base_dir)
        game = get_game(identifier, base_dir)
        result = public_game(game)
        with connect(base_dir) as conn:
            result["randarts"] = [dict(id=r["id"], name=r["name"]) for r in conn.execute(
                "SELECT id, name FROM entities WHERE game_id = ? AND kind = 'randarts'", (identifier,))]
        return result
    with connect(base_dir) as conn:
        if kind == "players":
            account = conn.execute("SELECT username FROM accounts WHERE id = ?", (identifier,)).fetchone()
            if account:
                return {"id": identifier, "kind": kind, "name": account["username"],
                        "type": "account", "games": list_games(account["username"], base_dir)}
        row = conn.execute("SELECT * FROM entities WHERE kind = ? AND id = ?",
                           (kind, identifier)).fetchone()
    if not row:
        # A hero's first direct link can precede the first library refresh.
        list_games(base_dir=base_dir, include_test=True)
        with connect(base_dir) as conn:
            row = conn.execute("SELECT * FROM entities WHERE kind = ? AND id = ?",
                               (kind, identifier)).fetchone()
    if not row:
        return None
    ingest(row["game_id"], base_dir)
    with connect(base_dir) as conn:
        row = conn.execute("SELECT * FROM entities WHERE id = ?", (identifier,)).fetchone()
    return {**json.loads(row["data_json"]), "kind": kind, "game_id": row["game_id"]}
