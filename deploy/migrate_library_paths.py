#!/usr/bin/env python3
"""Normalize existing release symlinks to the stable persistent library root."""
import contextlib
import pathlib
import sqlite3
import sys
import uuid


def migrate(root):
    root = root.resolve()
    index = root / "index.sqlite"
    if not index.exists():
        return 0
    changed = 0
    with contextlib.closing(sqlite3.connect(index)) as database:
        with database:
            for identifier, previous in database.execute("SELECT id, save_dir FROM games").fetchall():
                assert str(uuid.UUID(identifier)) == identifier
                expected = root / "saves" / identifier
                if previous == str(expected):
                    continue
                if pathlib.Path(previous).resolve() != expected.resolve():
                    raise ValueError("Existing save directory is outside its expected persistent location: " + identifier)
                database.execute("UPDATE games SET save_dir=? WHERE id=?", (str(expected), identifier))
                changed += 1
    return changed


if __name__ == "__main__":
    print("Normalized save directories:", migrate(pathlib.Path(sys.argv[1])))
