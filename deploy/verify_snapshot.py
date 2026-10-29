#!/usr/bin/env python3
"""Verify an attached, read-only recovery disk against a saved deployment run."""
import contextlib
import hashlib
import json
import pathlib
import sqlite3
import sys
import uuid


def verify(restored, live, game_id):
    assert str(uuid.UUID(game_id)) == game_id
    manifest = json.loads((restored / "recovery/manifest.json").read_text())
    checked = []
    for relative in manifest["databases"]:
        path = (restored / "recovery/sqlite" / relative).resolve()
        assert path.is_relative_to(restored)
        with contextlib.closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as database:
            assert database.execute("PRAGMA integrity_check").fetchone() == ("ok",), relative
        checked.append(relative)
    index = restored / "recovery/sqlite/rcs/library/index.sqlite"
    with contextlib.closing(sqlite3.connect(index.as_uri() + "?mode=ro", uri=True)) as database:
        row = database.execute("SELECT status, snapshot_json FROM games WHERE id=?", (game_id,)).fetchone()
        assert row and row[0] == "saved"
        snapshot = json.loads(row[1])
        assert len(snapshot["players"]) == 2
    directory = pathlib.Path("rcs/library/saves") / game_id
    native = []
    for saved in sorted((restored / directory).rglob("*.cs")):
        relative = saved.relative_to(restored)
        with saved.open("rb") as backup, (live / relative).open("rb") as original:
            digest = hashlib.file_digest(backup, "sha256").hexdigest()
            assert digest == hashlib.file_digest(original, "sha256").hexdigest(), str(relative)
        native.append({"file": str(relative), "sha256": digest})
    assert native, "Snapshot must contain the actual native save package"
    return {"sqlite_integrity": checked, "game_id": game_id, "native_packages": native,
            "hero_ids": [hero["id"] for hero in snapshot["players"]], "restored_disk_verified": True}


if __name__ == "__main__":
    print(json.dumps(verify(pathlib.Path(sys.argv[1]).resolve(),
                            pathlib.Path(sys.argv[2]).resolve(), sys.argv[3]), indent=2))
