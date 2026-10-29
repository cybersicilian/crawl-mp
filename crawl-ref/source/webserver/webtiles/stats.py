"""Server-wide gameplay statistics and the engine reference encyclopedia.

Binding contract: docs/stats.md. This module owns rcs/stats/stats.sqlite (a
rebuildable cache: deleting it re-ingests everything) and
rcs/stats/reference.json (the cached ``crawl -stats-json`` dump).

Sources, in dedup priority order (per ``(name, start)``):
  hero_snapshot lines (stats_events.jsonl) > xlogfile > morgue-only > library.
Milestones, chronicle records and the library index enrich merged games.

Nothing here ever returns filesystem paths to callers.
"""
import collections
import hashlib
import json
import logging
import os
import re
import sqlite3
import subprocess
import threading
import time
import urllib.parse

from webtiles.record_visibility import is_test_account
from webtiles import stats_observations

from webtiles.stats_parse import *  # noqa: F401,F403
from webtiles.stats_parse import _branch_name, _int
from webtiles.stats_reference import *  # noqa: F401,F403
from webtiles.stats_reference import _playable_reference
from webtiles.stats_merge import *  # noqa: F401,F403
from webtiles.stats_views import *  # noqa: F401,F403
from webtiles.stats_sections import *  # noqa: F401,F403

SCHEMA = """
CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, kind TEXT NOT NULL,
    offset INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
    mtime_ns INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS games (source TEXT NOT NULL, skey TEXT NOT NULL,
    dedup TEXT NOT NULL, updated TEXT, row_json TEXT NOT NULL,
    PRIMARY KEY (source, skey));
CREATE INDEX IF NOT EXISTS games_dedup ON games(dedup);
CREATE TABLE IF NOT EXISTS milestones (dedup TEXT NOT NULL, time TEXT NOT NULL,
    type TEXT NOT NULL, text TEXT NOT NULL, br TEXT, place TEXT, god TEXT,
    PRIMARY KEY (dedup, time, type, text));
CREATE TABLE IF NOT EXISTS chronicle (origin TEXT NOT NULL, kind TEXT NOT NULL,
    ident TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY (origin, kind, ident));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


class StatsStore(object):
    def __init__(self, rcs_dir=None, stats_dir=None, binary=None, fixture_path=FIXTURE_PATH,
                 ingest_interval=INGEST_INTERVAL):
        self.rcs_dir = os.path.abspath(rcs_dir or RCS_DIR)
        self.stats_dir = os.path.abspath(stats_dir or os.path.join(self.rcs_dir, "stats"))
        self.binary = binary          # list (call base) or None -> discover from config
        self.fixture_path = fixture_path
        self.ingest_interval = ingest_interval
        self.db_path = os.path.join(self.stats_dir, "stats.sqlite")
        self.reference_path = os.path.join(self.stats_dir, "reference.json")
        self._lock = threading.Lock()
        self._ref_lock = threading.Lock()
        self._last_ingest = 0.0
        self._ingesting = False
        self._generation = 0
        self._games_cache = None
        self._ref = None
        self._ref_sig = None
        self._ref_thread = None

    # -- database ---------------------------------------------------------
    def connect(self):
        os.makedirs(self.stats_dir, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)
        stats_observations.prepare(conn)
        return conn

    # -- ingestion --------------------------------------------------------
    def maybe_ingest(self, background=None):
        """Throttled ingest. By default it runs on a worker thread so requests
        stay fast; with a cold cache (no stats.sqlite yet) the first call runs
        synchronously so the first page already shows data."""
        if time.time() - self._last_ingest < self.ingest_interval or self._ingesting:
            return
        if background is None:
            background = os.path.exists(self.db_path)
        if background:
            self._ingesting = True
            threading.Thread(target=self._safe_ingest, name="stats-ingest", daemon=True).start()
        else:
            self._safe_ingest()

    def _safe_ingest(self):
        try:
            self.ingest()
        except Exception:
            logging.warning("Stats ingest failed", exc_info=True)

    def ingest(self):
        with self._lock:
            self._ingesting = True
            try:
                changed = self._ingest_locked()
            finally:
                self._ingesting = False
                self._last_ingest = time.time()
            if changed:
                self._generation += 1
                self._games_cache = None
            return changed

    def _walk(self):
        found = collections.defaultdict(list)
        if not os.path.isdir(self.rcs_dir):
            return found
        for root, dirs, files in os.walk(self.rcs_dir):
            dirs[:] = [d for d in dirs if os.path.join(root, d) != self.stats_dir and d not in ("db", "running")]
            for name in files:
                path = os.path.join(root, name)
                if name == "stats_events.jsonl":
                    found["events"].append(path)
                elif re.match(r"^logfile(?:-[\w.-]+)?$", name) and not name.endswith(".lock"):
                    found["xlog"].append(path)
                elif re.match(r"^milestones(?:-[\w.-]+)?$", name) and not name.endswith(".lock"):
                    found["milestones"].append(path)
                elif re.match(r"^morgue-.+-\d{8}-\d{6}\.txt$", name):
                    found["morgue"].append(path)
                elif name == "coop_chronicle.jsonl":
                    found["chronicle_jsonl"].append(path)
        return found

    def _ingest_locked(self):
        found = self._walk()
        changed = False
        conn = self.connect()
        try:
            for path in found["events"]:
                changed |= self._ingest_lines(conn, path, "events", self._handle_event)
            for path in found["xlog"]:
                changed |= self._ingest_lines(conn, path, "xlog", self._handle_xlog)
            for path in found["milestones"]:
                changed |= self._ingest_lines(conn, path, "milestones", self._handle_milestone)
            for path in found["morgue"]:
                changed |= self._ingest_morgue(conn, path)
            changed |= self._ingest_chronicle(conn, found["chronicle_jsonl"])
            changed |= self._ingest_library(conn)
            conn.commit()
        finally:
            conn.close()
        return changed

    def _file_state(self, conn, path):
        row = conn.execute("SELECT * FROM files WHERE path = ?", (path,)).fetchone()
        return dict(row) if row else {"offset": 0, "size": 0, "mtime_ns": 0}

    def _set_file_state(self, conn, path, kind, offset, st):
        conn.execute("INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?)",
                     (path, kind, offset, st.st_size, st.st_mtime_ns))

    def _ingest_lines(self, conn, path, kind, handler):
        try:
            st = os.stat(path)
        except OSError:
            return False
        state = self._file_state(conn, path)
        offset = state["offset"]
        if st.st_size < offset:
            offset = 0  # truncated/rotated: re-read (upserts are idempotent)
        if st.st_size == offset and st.st_mtime_ns == state["mtime_ns"]:
            return False
        changed = False
        with open(path, "rb") as f:
            f.seek(offset)
            data = f.read()
        end = data.rfind(b"\n")
        if end < 0:
            self._set_file_state(conn, path, kind, offset, st)
            return False
        for raw in data[:end + 1].splitlines():
            line = raw.decode("utf-8", "replace")
            if line.strip():
                try:
                    changed |= bool(handler(conn, line))
                except Exception:
                    logging.debug("Skipping bad %s line", kind, exc_info=True)
        self._set_file_state(conn, path, kind, offset + end + 1, st)
        return changed

    def _upsert(self, conn, source, skey, game, newer_wins=False):
        dedup = dedup_key(game.get("name"), game.get("start_ts")) if game.get("start_ts") \
            else "%s:%s" % (source, skey)
        if newer_wins:
            row = conn.execute("SELECT updated FROM games WHERE source = ? AND skey = ?",
                               (source, skey)).fetchone()
            if row and (row["updated"] or "") > (game.get("updated") or ""):
                return False
        game["source"] = source
        conn.execute("INSERT OR REPLACE INTO games VALUES (?, ?, ?, ?, ?)",
                     (source, skey, dedup, game.get("updated"), json.dumps(game)))
        return True

    def _handle_event(self, conn, line):
        event = json.loads(line)
        if not isinstance(event, dict):
            return False
        game = snapshot_game(event)
        if not game:
            return False
        if game.get("game_id") and game.get("hero_id"):
            skey = "%s|%s" % (game["game_id"], game["hero_id"])
        else:
            skey = dedup_key(game["name"], game["start_ts"])
        changed = stats_observations.record(conn, skey, game)
        return self._upsert(conn, "snapshot", skey, game, newer_wins=True) or changed

    def _handle_xlog(self, conn, line):
        fields = parse_xlog_line(line)
        game = xlog_game(fields) if fields else None
        if not game:
            return False
        return self._upsert(conn, "xlog", dedup_key(game["name"], game["start_ts"]), game)

    def _handle_milestone(self, conn, line):
        f = parse_xlog_line(line)
        if not f or not f.get("name") or not f.get("type"):
            return False
        start = xlog_time(f.get("start"))
        when = xlog_time(f.get("time")) or ""
        cur = conn.execute("INSERT OR IGNORE INTO milestones VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (dedup_key(f["name"], start), when, f["type"], f.get("milestone", ""),
                            f.get("br", ""), f.get("place", ""), f.get("god", "")))
        return cur.rowcount > 0

    def _ingest_morgue(self, conn, path):
        try:
            st = os.stat(path)
        except OSError:
            return False
        state = self._file_state(conn, path)
        if state["size"] == st.st_size and state["mtime_ns"] == st.st_mtime_ns:
            return False
        with open(path, encoding="utf-8", errors="replace") as f:
            game = parse_morgue(f.read(), path)
        self._set_file_state(conn, path, "morgue", st.st_size, st)
        if not game.get("name"):
            return False
        return self._upsert(conn, "morgue", "%s|%s" % (game["name"].lower(), game.get("end_ts")), game)

    def _ingest_chronicle(self, conn, jsonl_paths):
        """Canonical chronicle DB (via chronicle.py) + chronicle jsonl files in
        directories chronicle.py does not watch (library save dirs)."""
        changed = False
        try:
            from webtiles import chronicle
            covered = {os.path.realpath(os.path.join(self.rcs_dir, chronicle.JSONL_FILENAME)),
                       os.path.realpath(os.path.join(self.rcs_dir, "saves", chronicle.JSONL_FILENAME))}
            if any(os.path.isfile(p) for p in covered) or os.path.isfile(
                    os.path.join(self.rcs_dir, chronicle.DB_FILENAME)):
                chronicle.ingest_jsonl_events(self.rcs_dir)
            db = os.path.join(self.rcs_dir, chronicle.DB_FILENAME)
            if os.path.isfile(db):
                st = os.stat(db)
                state = self._file_state(conn, db)
                if (state["size"], state["mtime_ns"]) != (st.st_size, st.st_mtime_ns):
                    src = sqlite3.connect("file:%s?mode=ro" % urllib.parse.quote(db), uri=True, timeout=10)
                    src.row_factory = sqlite3.Row
                    try:
                        conn.execute("DELETE FROM chronicle WHERE origin = 'db'")
                        for kind, table in (("party", "party_comps"), ("ghost", "player_ghosts"),
                                            ("item", "cool_items")):
                            try:
                                rows = src.execute("SELECT * FROM %s" % table).fetchall()
                            except sqlite3.Error:
                                continue
                            for r in rows:
                                conn.execute("INSERT OR REPLACE INTO chronicle VALUES ('db', ?, ?, ?)",
                                             (kind, str(r["id"]), json.dumps(dict(r))))
                    finally:
                        src.close()
                    self._set_file_state(conn, db, "chronicle_db", st.st_size, st)
                    changed = True
        except Exception:
            logging.warning("Stats: chronicle ingest failed", exc_info=True)
            covered = set()
        for path in jsonl_paths:
            if os.path.realpath(path) in covered:
                continue
            changed |= self._ingest_lines(conn, path, "chronicle_jsonl",
                                          lambda c, line, p=path: self._handle_chronicle_line(c, p, line))
        return changed

    def _handle_chronicle_line(self, conn, path, line):
        evt = json.loads(line)
        kind = {"party_comp": "party", "ghost": "ghost", "cool_item": "item"}.get(evt.get("type"))
        if not kind:
            return False
        if kind == "party":
            evt.setdefault("members_json", json.dumps(evt.get("members") or []))
            members = evt.get("members") or []
            evt.setdefault("host", members[0].get("name") if members and isinstance(members[0], dict) else "")
        ident = hashlib.sha1(line.encode("utf-8")).hexdigest()
        origin = "jsonl:" + os.path.relpath(path, self.rcs_dir)
        cur = conn.execute("INSERT OR IGNORE INTO chronicle VALUES (?, ?, ?, ?)",
                           (origin, kind, ident, json.dumps(evt)))
        return cur.rowcount > 0

    def _library_dir(self):
        return os.path.join(self.rcs_dir, "library")

    def _ingest_library(self, conn):
        base = self._library_dir()
        index = os.path.join(base, "index.sqlite")
        if not os.path.isfile(index):
            return False
        sig_parts = []
        for p in [index] + sorted(os.path.join(base, "events", n) for n in
                                  (os.listdir(os.path.join(base, "events"))
                                   if os.path.isdir(os.path.join(base, "events")) else [])):
            try:
                st = os.stat(p)
                sig_parts.append("%s:%d:%d" % (os.path.basename(p), st.st_size, st.st_mtime_ns))
            except OSError:
                pass
        sig = "|".join(sig_parts)
        row = conn.execute("SELECT value FROM meta WHERE key = 'library_sig'").fetchone()
        if row and row["value"] == sig:
            return False
        src = sqlite3.connect("file:%s?mode=ro" % urllib.parse.quote(index), uri=True, timeout=10)
        src.row_factory = sqlite3.Row
        try:
            games = [dict(r) for r in src.execute("SELECT * FROM games")]
            accounts = [dict(r) for r in src.execute("SELECT * FROM accounts")]
            heroes = [dict(r) for r in src.execute("SELECT id, game_id, name FROM entities WHERE kind = 'players'")]
        except sqlite3.Error:
            return False
        finally:
            src.close()
        conn.execute("DELETE FROM games WHERE source = 'library'")
        status_outcome = {"fallen": "dead", "won": "won", "quit": "quit"}
        for g in games:
            snapshot = {}
            event_path = os.path.join(base, "events", "%s.json" % g["id"])
            try:
                with open(event_path, encoding="utf-8") as f:
                    snapshot = json.load(f)
            except (OSError, ValueError):
                try:
                    snapshot = json.loads(g.get("snapshot_json") or "{}")
                except ValueError:
                    snapshot = {}
            players = snapshot.get("players") or []
            party_size = len(players) or 1
            mode_m = re.search(r"(\d)p", g.get("mode", ""))
            if mode_m:
                party_size = max(party_size, int(mode_m.group(1)))
            for hero in players:
                if not hero.get("name"):
                    continue
                row = {
                    "name": hero.get("name"), "species": hero.get("species", ""),
                    "job": hero.get("job", ""), "xl": _int(hero.get("xl")),
                    "place": hero.get("place") or snapshot.get("place", ""),
                    "branch": _branch_name(hero.get("place") or snapshot.get("place")),
                    "turns": _int(snapshot.get("turns")), "seed": str(snapshot.get("seed") or ""),
                    "game_id": g["id"], "hero_id": hero.get("id") or "",
                    "account": g.get("owner", ""), "account_id": g.get("owner_id", ""),
                    "party_size": party_size, "hp_max": _int(hero.get("hp_max")),
                    "outcome": status_outcome.get(g.get("status"), "alive"),
                    "start_ts": None, "created": iso_time(g.get("created_at")),
                    "updated": iso_time(g.get("updated_at")), "library_mode": g.get("mode", ""),
                }
                self._upsert(conn, "library", "%s|%s" % (g["id"], hero.get("id") or hero.get("name")), row)
        lib = {"accounts": {a["id"]: a["username"] for a in accounts},
               "games": {g["id"]: {"owner": g["owner"], "title": g["title"]} for g in games},
               "heroes": {h["id"]: {"game_id": h["game_id"], "name": h["name"]} for h in heroes}}
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('library', ?)", (json.dumps(lib),))
        conn.execute("INSERT OR REPLACE INTO meta VALUES ('library_sig', ?)", (sig,))
        return True

    # -- reference --------------------------------------------------------
    def binary_call(self):
        if self.binary is not None:
            return list(self.binary) or None
        env = os.environ.get("CRAWL_STATS_BINARY")
        if env:
            return [env]
        try:
            from webtiles import config
            for game in config.games.values():
                call = game.get_call_base()
                if call and os.path.isfile(call[0]):
                    return call
        except Exception:
            logging.debug("Stats: no crawl binary from config", exc_info=True)
        # Standalone CLI runs without the server config; use the conventional
        # binary in the server's working directory.
        if os.path.isfile("./crawl") and os.access("./crawl", os.X_OK):
            return ["./crawl"]
        return None

    def _binary_signature(self, call):
        try:
            st = os.stat(call[0])
            return "%s|%d|%d" % (" ".join(call), st.st_mtime_ns, st.st_size)
        except (OSError, TypeError, IndexError):
            return None

    def _run_json(self, call, flag):
        out = subprocess.run(call + [flag], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             timeout=BINARY_TIMEOUT, cwd=os.path.dirname(os.path.abspath(call[0])) or None)
        if out.returncode != 0:
            return None
        try:
            return json.loads(out.stdout.decode("utf-8", "replace"))
        except ValueError:
            return None

    def regenerate_reference(self, call=None):
        """Run the engine and refresh rcs/stats/reference.json. Blocking."""
        call = call or self.binary_call()
        sig = self._binary_signature(call) if call else None
        if not sig:
            return None
        data, source = None, None
        try:
            data = self._run_json(call, "-stats-json")
            if isinstance(data, dict) and data.get("monsters") is not None:
                source = "engine"
            else:
                playable = self._run_json(call, "-playable-json")
                if isinstance(playable, dict):
                    branches = None
                    try:
                        branches = self._run_json(call, "-branches-json")
                    except Exception:
                        pass
                    data, source = _playable_reference(playable, branches), "partial"
        except (OSError, subprocess.SubprocessError):
            logging.warning("Stats: could not run crawl for reference data", exc_info=True)
        if not source:
            return None
        os.makedirs(self.stats_dir, exist_ok=True)
        tmp = self.reference_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"signature": sig, "source": source, "data": data}, f)
        os.replace(tmp, self.reference_path)
        with self._ref_lock:
            self._ref = None
        return source

    def _load_cached(self):
        try:
            with open(self.reference_path, encoding="utf-8") as f:
                cached = json.load(f)
            return cached if isinstance(cached, dict) and isinstance(cached.get("data"), dict) else None
        except (OSError, ValueError):
            return None

    def _load_fixture(self):
        try:
            with open(self.fixture_path, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else None
        except (OSError, ValueError, TypeError):
            return None

    def reference(self, wait=False):
        """Best available reference: fresh engine dump > bundled fixture >
        partial playable-json dump > empty skeleton. Never blocks unless wait."""
        call = self.binary_call()
        sig = self._binary_signature(call) if call else None
        cached = self._load_cached()
        fresh = cached and sig and cached.get("signature") == sig
        if sig and not fresh:
            if wait:
                self.regenerate_reference(call)
                cached = self._load_cached()
                fresh = cached and cached.get("signature") == sig
            elif not (self._ref_thread and self._ref_thread.is_alive()):
                self._ref_thread = threading.Thread(target=self._safe_regenerate, args=(call,),
                                                    name="stats-reference", daemon=True)
                self._ref_thread.start()
        try:
            ref_mtime = os.stat(self.reference_path).st_mtime_ns
        except OSError:
            ref_mtime = 0
        state = (sig, ref_mtime, bool(fresh))
        with self._ref_lock:
            if self._ref is not None and self._ref_sig == state:
                return self._ref
        if cached and cached.get("source") == "engine" and (fresh or not sig):
            ref = Reference(cached["data"], "engine")
        else:
            fixture = self._load_fixture()
            if fixture:
                ref = Reference(fixture, "fixture")
            elif cached:
                ref = Reference(cached["data"], cached.get("source", "partial"))
            else:
                ref = Reference(SKELETON_REFERENCE, "none")
        with self._ref_lock:
            self._ref, self._ref_sig = ref, state
        return ref

    def _safe_regenerate(self, call):
        try:
            self.regenerate_reference(call)
        except Exception:
            logging.warning("Stats: reference regeneration failed", exc_info=True)

    # -- merged games -----------------------------------------------------
    def _load(self):
        conn = self.connect()
        try:
            rows = [dict(r) for r in conn.execute("SELECT source, skey, dedup, row_json FROM games")]
            stats_observations.attach(conn, rows)
            miles = [dict(r) for r in conn.execute("SELECT * FROM milestones")]
            chron = [dict(r) for r in conn.execute("SELECT kind, data_json FROM chronicle")]
            lib = conn.execute("SELECT value FROM meta WHERE key = 'library'").fetchone()
        finally:
            conn.close()
        library = json.loads(lib["value"]) if lib else {"accounts": {}, "games": {}, "heroes": {}}
        chronicle = {"party": [], "ghost": [], "item": []}
        for c in chron:
            try:
                chronicle[c["kind"]].append(json.loads(c["data_json"]))
            except (ValueError, KeyError):
                pass
        return rows, miles, chronicle, library

    def games(self, ref=None):
        """All merged games (unfiltered), cached per ingest generation+reference."""
        ref = ref or self.reference()
        key = (self._generation, id(ref))
        if self._games_cache and self._games_cache[0] == key:
            return self._games_cache[1]
        rows, miles, chronicle, library = self._load()
        result = [game for game in merge_games(rows, miles, chronicle, library, ref)
                  if not is_test_account(game.get("account"))]
        self._games_cache = (key, result)
        return result


_store = None


def store():
    global _store
    if _store is None:
        _store = StatsStore()
    return _store


def start_periodic():
    """Schedule background ingestion on the tornado IOLoop (call once)."""
    import tornado.ioloop

    def tick():
        s = store()
        s.maybe_ingest(background=True)
        s.reference()

    tornado.ioloop.IOLoop.current().add_callback(tick)
    pc = tornado.ioloop.PeriodicCallback(tick, PERIODIC_INTERVAL_MS)
    pc.start()
    return pc


def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description="Rebuild /stats caches.")
    parser.add_argument("--rcs", default=RCS_DIR)
    parser.add_argument("--rebuild", action="store_true", help="delete stats.sqlite and re-ingest everything")
    parser.add_argument("--reference", action="store_true", help="regenerate reference.json from the crawl binary")
    parser.add_argument("--binary", help="crawl binary (default: from games config / CRAWL_STATS_BINARY)")
    args = parser.parse_args(argv)
    s = StatsStore(args.rcs, binary=[args.binary] if args.binary else None)
    if s.binary is None:
        try:
            from webtiles import config
            config.load_game_data()
        except Exception:
            pass
    if args.rebuild and os.path.exists(s.db_path):
        os.remove(s.db_path)
    s.ingest()
    if args.reference:
        print("reference:", s.regenerate_reference() or "unavailable (using fixture/fallback)")
    ref = s.reference()
    print("games: %d, reference: %s %s" % (len(s.games(ref)), ref.source, ref.version))


if __name__ == "__main__":
    main()
