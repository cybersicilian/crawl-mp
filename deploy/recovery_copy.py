#!/usr/bin/env python3
"""Create verified SQLite online backups alongside state for disk snapshots.

Native saves remain in rcs/library/saves. Scheduled disk snapshots capture the
last on-disk native checkpoint; these copies add independently verified DB files.
"""
import datetime
import contextlib
import json
import os
import pathlib
import sqlite3


def copy_databases(root):
    destination = root / "recovery" / "sqlite"
    destination.mkdir(parents=True, exist_ok=True)
    records = []
    for source in sorted(root.rglob("*")):
        if not source.is_file() or source.is_relative_to(root / "recovery"):
            continue
        if source.suffix not in {".db3", ".db", ".sqlite"}:
            continue
        target = destination / source.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".tmp")
        with contextlib.closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with contextlib.closing(sqlite3.connect(temporary)) as backup:
                original.backup(backup)
                assert backup.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        os.replace(temporary, target)
        records.append(str(source.relative_to(root)))
    manifest = {"created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "databases": records}
    temporary = root / "recovery" / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(temporary, root / "recovery" / "manifest.json")
    print(json.dumps(manifest))


if __name__ == "__main__":
    copy_databases(pathlib.Path("/var/lib/dcss"))
