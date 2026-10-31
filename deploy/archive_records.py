#!/usr/bin/env python3
"""Archive records outside an explicit account allowlist without restarting play.

Run without --apply first. Applying requires a new private archive directory outside rcs.
Authentication and settings are changed only when their database paths are supplied.
Shared bones and application files are never changed.
SQLite online backups and original source files make every change recoverable.
"""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import sqlite3
import subprocess
import sys


def rows(path, table):
    if not path.exists():
        return []
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=30)) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute('SELECT rowid AS _archive_rowid, * FROM "' + table + '"')]


def decoded(value, fallback):
    return json.loads(value) if value else fallback


def normalized(value):
    return str(value or "").strip().casefold()


def members(record):
    return record.get("members") or decoded(record.get("members_json"), [])


def party_accounts(game):
    party = decoded(game.get("party_json"), {})
    result = {game.get("owner", ""), *party.get("slot_users", {})}
    result.update(slot.get("username", "") for slot in party.get("room", {}).get("slots", []))
    return {normalized(name) for name in result if name}


class Archive:
    def __init__(self, root, keep, accounts_db=None, settings_db=None):
        self.root = Path(root).resolve(strict=True)
        self.keep = {normalized(name) for name in keep}
        if not self.keep or "" in self.keep:
            raise ValueError("Supply exact account names to preserve")
        self.library = self.root / "library/index.sqlite"
        self.chronicle = self.root / "coop_chronicle.db"
        self.stats = self.root / "stats/stats.sqlite"
        self.accounts_db = Path(accounts_db).resolve(strict=True) if accounts_db else None
        self.settings_db = Path(settings_db).resolve(strict=True) if settings_db else None
        self.auth_users = rows(self.accounts_db, "dglusers") if self.accounts_db else []
        self.games = rows(self.library, "games")
        self.accounts = rows(self.library, "accounts")
        self.kept_games = {g["id"] for g in self.games if party_accounts(g) & self.keep}
        self.kept_owners = {g["owner_id"] for g in self.games if g["id"] in self.kept_games}
        self.removed_games = {g["id"] for g in self.games} - self.kept_games
        self.parties = rows(self.chronicle, "party_comps")
        self.kept_parties = [p for p in self.parties if self.keep_party(p)]
        self.pairs = set()
        self.ghost_times = set()
        for party in self.kept_parties:
            for member in members(party):
                name = normalized(member.get("name"))
                self.pairs.add((name, str(party.get("seed") or "")))
                self.ghost_times.add((name, party.get("timestamp")))
        for game in self.games:
            if game["id"] in self.kept_games:
                snapshot = decoded(game.get("snapshot_json"), {})
                for player in snapshot.get("players", []):
                    self.pairs.add((normalized(player.get("name")), str(snapshot.get("seed") or "")))
        self.paths = set()
        self.rewrites = {}
        self.removals = {}
        self._plan_library()
        self._plan_chronicle()
        self._plan_sources()
        self._plan_stats()
        self._plan_accounts()

    def databases(self):
        return [p for p in (self.library, self.chronicle, self.stats,
                            self.accounts_db, self.settings_db) if p and p.exists()]

    def label(self, path):
        return str(path.relative_to(self.root)) if path.is_relative_to(self.root) else "identity/" + path.name

    def _plan_accounts(self):
        if self.accounts_db:
            retained = {u["id"] for u in self.auth_users if normalized(u["username"]) in self.keep}
            self.select(self.accounts_db, "recovery_tokens", lambda r: r["user_id"] in retained,
                        "_archive_rowid")
            self.select(self.accounts_db, "dglusers", lambda u: u["id"] in retained)
        if self.settings_db:
            with closing(sqlite3.connect(self.settings_db)) as conn:
                tables = {row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'")}
            for table in ("mutesettings", "profile_graphics", "profile_appearance"):
                if table in tables:
                    self.select(self.settings_db, table,
                                lambda u: normalized(u["username"]) in self.keep, "username")

    def keep_party(self, record):
        host = record.get("host")
        people = members(record)
        if not host and people:
            host = people[0].get("username") or people[0].get("name")
        return normalized(host) in self.keep or any(
            normalized(member.get("username")) in self.keep for member in people)

    def keep_game(self, game):
        identifier = game.get("game_id")
        if identifier in self.kept_games:
            return True
        if identifier in self.removed_games:
            return False
        account = game.get("account") or game.get("owner")
        if account:
            return normalized(account) in self.keep
        name = normalized(game.get("name"))
        return name in self.keep or bool(game.get("seed") and
            (name, str(game["seed"])) in self.pairs)

    def keep_chronicle(self, record, kind):
        if kind in ("party_comp", "party"):
            return self.keep_party(record)
        name = record.get("hero_name") or record.get("finder_name") or record.get("username")
        return normalized(name) in self.keep or (normalized(name), record.get("timestamp")) in self.ghost_times

    def select(self, path, table, predicate, key="id"):
        self.removals[(path, table, key)] = [r[key] for r in rows(path, table) if not predicate(r)]

    def move(self, path):
        if path.exists():
            if path.is_symlink() or not path.resolve().is_relative_to(self.root):
                raise ValueError("Unsafe archive source: " + str(path))
            self.paths.add(path)

    def _plan_library(self):
        self.select(self.library, "games", lambda g: g["id"] in self.kept_games)
        self.select(self.library, "entities", lambda e: e["game_id"] in self.kept_games)
        self.select(self.library, "accounts", lambda a: normalized(a["username"]) in self.keep
                    or a["id"] in self.kept_owners,
                    key="username")
        self.select(self.library, "deleted_saves", lambda d: d["game_id"] in self.kept_games,
                    key="game_id")
        for game in self.games:
            if game["id"] not in self.removed_games:
                continue
            expected = self.root / "library/saves" / game["id"]
            if Path(game["save_dir"]).resolve() != expected.resolve():
                raise ValueError("Unrecognized save directory: " + game["save_dir"])
            self.move(expected)
            self.move(self.root / "library/events" / (game["id"] + ".json"))

    def _plan_chronicle(self):
        for table, kind in (("party_comps", "party"), ("player_ghosts", "ghost"), ("cool_items", "item")):
            self.select(self.chronicle, table, lambda row: self.keep_chronicle(row, kind))

    def _plan_sources(self):
        owners = {normalized(a["username"]) for a in self.accounts}
        owners.update(normalized(p["host"]) for p in self.parties)
        owners.update(normalized(a["username"]) for a in self.auth_users)
        if self.accounts_db:
            owners.update(normalized(p.stem) for p in self.root.iterdir()
                          if p.suffix in (".rc", ".macro"))
        # Without explicit account cleanup, rc/macro preferences remain.
        for path in self.root.iterdir():
            if path.is_dir() and normalized(path.name) in owners - self.keep:
                self.move(path)
            elif self.accounts_db and path.suffix in (".rc", ".macro") and normalized(path.stem) not in self.keep:
                self.move(path)
        if self.accounts_db:
            for folder in (self.root / "ttyrecs", self.root / "running"):
                if folder.is_dir():
                    for path in folder.iterdir():
                        if normalized(path.stem) in owners - self.keep:
                            self.move(path)
        for path in (self.root / "saves").glob("*.cs"):
            if normalized(path.stem) not in self.keep:
                self.move(path)
        for root, dirs, files in os.walk(self.root):
            directory = Path(root)
            dirs[:] = [d for d in dirs if directory / d not in self.paths and d not in ("db", "des", "running")]
            if directory == self.root / "stats":
                dirs[:] = []
                continue
            for name in files:
                path = directory / name
                if name.startswith("morgue-") and name.endswith(".txt"):
                    from webtiles.stats_parse import parse_morgue
                    if not self.keep_game(parse_morgue(path.read_text(), str(path))):
                        self.move(path)
                        self.move(path.with_suffix(".lst"))
                if name in ("stats_events.jsonl", "coop_chronicle.jsonl") or re.fullmatch(
                        r"(?:logfile|milestones)(?:-[\w.-]+)?", name):
                    self.filter_source(path)

    def filter_source(self, path):
        if self.source_game(path.relative_to(self.root)) in self.kept_games:
            return
        original = path.read_bytes()
        result = []
        current_party = False
        for raw in original.splitlines(keepends=True):
            if not raw.strip():
                result.append(raw)
                continue
            line = raw.decode("utf-8")
            if path.name == "coop_chronicle.jsonl":
                event = json.loads(line)
                kind = event.get("type")
                if kind == "party_comp":
                    current_party = self.keep_party(event)
                    keep = current_party
                else:
                    keep = current_party or self.keep_chronicle(event, kind)
            elif path.name == "stats_events.jsonl":
                event = json.loads(line)
                keep = self.keep_game(event)
            else:
                from webtiles.stats_parse import parse_xlog_line
                keep = self.keep_game(parse_xlog_line(line))
            if keep:
                result.append(raw)
        updated = b"".join(result)
        if updated != original:
            self.rewrites[path] = (hashlib.sha256(original).hexdigest(), updated)

    def _plan_stats(self):
        for table in ("games", "landmarks"):
            self.select(self.stats, table, lambda row: self.keep_game(json.loads(row["row_json"])),
                        "_archive_rowid")
        self.select(self.stats, "chronicle", self.keep_cached_chronicle, "_archive_rowid")

    @staticmethod
    def source_game(path):
        parts = Path(path).parts
        return parts[2] if len(parts) >= 4 and parts[:2] == ("library", "saves") else None

    def keep_cached_chronicle(self, row):
        origin = row["origin"]
        identifier = self.source_game(origin[6:]) if origin.startswith("jsonl:") else None
        if identifier in self.kept_games:
            return True
        if identifier in self.removed_games:
            return False
        return self.keep_chronicle(json.loads(row["data_json"]), row["kind"])

    def summary(self):
        return {"keep": sorted(self.keep), "games_kept": len(self.kept_games),
                "games_archived": len(self.removed_games),
                "rows_archived": {self.label(path) + ":" + table: len(ids)
                                  for (path, table, _), ids in self.removals.items()},
                "paths_archived": len(self.paths), "shared_sources_filtered": len(self.rewrites)}

    def active_games(self):
        """Ignore native processes explicitly bound to a different state tree."""
        commands = subprocess.check_output(["ps", "-eo", "args="], text=True)
        active = []
        for command in commands.splitlines():
            try:
                args = shlex.split(command)
            except ValueError:
                if re.match(r"(?:\S*/)?crawl\s", command.strip()):
                    raise ValueError("Cannot inspect a native game command")
                continue
            if not args or Path(args[0]).name != "crawl" or "-name" not in args:
                continue
            if "-dir" in args:
                directory = Path(args[args.index("-dir") + 1])
                if directory.is_absolute() and not directory.resolve().is_relative_to(self.root):
                    continue
            active.append(args[args.index("-name") + 1])
        return active

    def apply(self, destination):
        if any(normalized(name) not in self.keep for name in self.active_games()):
            raise ValueError("A non-preserved native game is running; save and exit it first")
        destination = Path(destination).resolve()
        if destination.is_relative_to(self.root):
            raise ValueError("Archive must be outside the ingestion tree")
        destination.mkdir(mode=0o700, parents=True, exist_ok=False)
        # Online backup handles live SQLite/WAL state without interrupting players.
        for path in self.databases():
            if path.exists():
                backup = destination / "databases" / self.label(path)
                backup.parent.mkdir(parents=True, exist_ok=True)
                with closing(sqlite3.connect(path)) as source, closing(sqlite3.connect(backup)) as target:
                    source.backup(target)
                    if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise ValueError("Backup failed integrity check")
        # Recheck the plan immediately before mutation, including live append logs.
        fresh = Archive(self.root, self.keep, self.accounts_db, self.settings_db)
        if fresh.removals != self.removals or fresh.paths != self.paths or fresh.rewrites != self.rewrites:
            raise ValueError("Records changed during backup; rerun with a fresh archive path")
        manifest = self.summary() | {"root": str(self.root), "status": "applying",
                                    "kept_game_ids": sorted(self.kept_games),
                                    "paths": [], "filtered": [], "rows": []}
        protected = {p for game in self.games if game["id"] in self.kept_games
                     for p in (self.root / "library/saves" / game["id"]).rglob("*") if p.is_file()}
        protected.update(self.root / "library/events" / (identifier + ".json")
                         for identifier in self.kept_games
                         if (self.root / "library/events" / (identifier + ".json")).is_file())
        protected.update(p for p in self.root.iterdir()
                         if p.is_file() and p.suffix in (".rc", ".macro") and normalized(p.stem) in self.keep)
        protected.update(p for p in (self.root / "saves").glob("*.cs")
                         if normalized(p.stem) in self.keep)
        protected.update(p for name in self.keep for folder in self.root.iterdir()
                         if folder.is_dir() and normalized(folder.name) == name
                         for p in folder.rglob("*") if p.is_file())
        hashes = {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in protected}
        (destination / "plan.json").write_text(json.dumps({
            "summary": self.summary(), "paths": [str(p.relative_to(self.root)) for p in sorted(self.paths)],
            "filtered": [str(p.relative_to(self.root)) for p in self.rewrites]}, indent=2) + "\n")
        for path in sorted(self.paths):
            target = destination / "files" / path.relative_to(self.root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), target)
            manifest["paths"].append(str(path.relative_to(self.root)))
        for path, (digest, data) in self.rewrites.items():
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                raise ValueError("Source changed while archiving: " + str(path))
            target = destination / "originals" / path.relative_to(self.root)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            # Preserve inode for native append handles; only stopped/unowned logs qualify.
            with path.open("r+b") as stream:
                stream.write(data)
                stream.truncate()
            manifest["filtered"].append(str(path.relative_to(self.root)))
        for (path, table, key), ids in self.removals.items():
            if not ids:
                continue
            with closing(sqlite3.connect(path, timeout=30)) as conn, conn:
                column = "rowid" if key == "_archive_rowid" else key
                conn.executemany('DELETE FROM "' + table + '" WHERE "' + column + '" = ?', [(i,) for i in ids])
            manifest["rows"].append({"database": self.label(path), "table": table,
                                     "key": key, "values": ids})
        self._refresh_derived()
        for path in self.databases():
            if path.exists():
                with closing(sqlite3.connect(path)) as conn:
                    if conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise ValueError("Post-cleanup integrity check failed")
        manifest["status"] = "complete"
        manifest["protected_file_hashes"] = hashes
        manifest["protected_files_unchanged"] = all(
            (self.root / path).is_file() and hashlib.sha256((self.root / path).read_bytes()).hexdigest() == digest
            for path, digest in hashes.items())
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        return manifest

    def _refresh_derived(self):
        # Canonical Chronicle already contains retained shared-source events. Advance
        # its offsets so shorter filtered streams cannot duplicate retained ghosts.
        if self.chronicle.exists():
            with closing(sqlite3.connect(self.chronicle, timeout=30)) as conn, conn:
                for path in (self.root / "coop_chronicle.jsonl", self.root / "saves/coop_chronicle.jsonl"):
                    if path in self.rewrites:
                        aliases = {"offset:" + str(path)}
                        aliases.update(key for (key,) in conn.execute("SELECT key FROM chronicle_meta")
                                       if key.startswith("offset:") and Path(key[7:]).resolve() == path)
                        conn.executemany("INSERT OR REPLACE INTO chronicle_meta VALUES (?, ?)",
                                         [(key, str(path.stat().st_size)) for key in aliases])
        if self.stats.exists():
            with closing(sqlite3.connect(self.stats, timeout=30)) as conn, conn:
                conn.execute("DELETE FROM milestones WHERE dedup NOT IN (SELECT dedup FROM games)")
                conn.execute("DELETE FROM files")
                conn.execute("DELETE FROM meta WHERE key IN ('library', 'library_sig')")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rcs", required=True)
    parser.add_argument("--keep", action="append", required=True)
    parser.add_argument("--webserver", required=True, help="Path containing the webtiles package")
    parser.add_argument("--archive")
    parser.add_argument("--accounts-db", help="Also archive other login accounts and their preferences")
    parser.add_argument("--settings-db", help="Also archive settings belonging to other accounts")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, args.webserver)
    archive = Archive(args.rcs, args.keep, args.accounts_db, args.settings_db)
    print(json.dumps(archive.summary(), indent=2), flush=True)
    if args.apply:
        if not args.archive:
            parser.error("--apply requires --archive")
        archive.apply(args.archive)
        print(json.dumps({"archive": str(Path(args.archive).resolve()), "status": "complete"}))


if __name__ == "__main__":
    main()
