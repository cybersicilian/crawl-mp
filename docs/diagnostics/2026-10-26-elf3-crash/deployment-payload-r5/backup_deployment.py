"""Back up the authorized DCSS deployment state before changing game files."""
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess

GAME = "819cea1b-55e8-4c89-a28c-4e360aff7efe"
STATE = Path("/var/lib/dcss")
LIBRARY = STATE / "rcs/library"
BASE = Path("/opt/dcss/releases/20261024T170515Z-render-assets")
BINARY_SHA = "16ab04953766d3c53f34c1139d4b22f62f5eda89b91b603f3139d50939d35ca4"
OLD_MAP_SHA = "28e608eb5a06757af491710792de8d0538e1f43ce16cd1aa0eadd96403fa35fd"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def native_processes():
    found = []
    for proc in Path("/proc").glob("[0-9]*"):
        try:
            if (proc / "exe").resolve().name == "crawl":
                found.append(int(proc.name))
        except (FileNotFoundError, PermissionError):
            pass
    return found


def tree(path):
    return {str(p.relative_to(path)): sha(p) for p in sorted(path.rglob("*"))
            if p.is_file() and not p.is_symlink()}


def chunks(binary, path):
    command = [str(binary), "-edit-save", str(path)]
    names = subprocess.check_output(command + ["ls"], text=True).splitlines()
    return {name: hashlib.sha256(subprocess.check_output(
        command + ["get", name, "-"])).hexdigest() for name in names}


def backup():
    os.umask(0o077)
    locks = []
    for name in ("/opt/dcss/release-build.lock", "/run/lock/dcss-counts-activation.lock"):
        handle = open(name, "a")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    assert Path("/opt/dcss/current").resolve() == BASE
    binary = BASE / "crawl-ref/source/crawl"
    assert sha(binary) == BINARY_SHA
    assert sha(BASE / "crawl-ref/source/dat/des/builder/layout_geoelf_castle.des") == OLD_MAP_SHA
    assert not native_processes(), "An active game must save and exit before maintenance"
    assert subprocess.check_output(["systemctl", "is-active", "dcss-coop"], text=True).strip() == "active"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    operation = STATE / "recovery" / ("elf3-" + stamp)
    operation.mkdir(mode=0o700)
    stopped = False
    try:
        subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
        stopped = True
        assert not native_processes(), "A game started during preparation"
        assert Path("/opt/dcss/current").resolve() == BASE
        with sqlite3.connect((LIBRARY / "index.sqlite").as_uri() + "?mode=ro", uri=True) as db:
            db.row_factory = sqlite3.Row
            games = [dict(row) for row in db.execute(
                "SELECT * FROM games WHERE owner = ? COLLATE NOCASE", ("JediJosh",))]
        game = next(row for row in games if row["id"] == GAME)
        assert game["owner"] == "JediJosh" and game["status"] not in ("fallen", "won", "quit")
        save_dir = LIBRARY / "saves" / GAME
        assert Path(game["save_dir"]).resolve() == save_dir
        originals = {"rcs/library/saves/" + row["id"] for row in games
                     if (LIBRARY / "saves" / row["id"]).is_dir()}
        for relative in ("rcs/JediJosh", "rcs/JediJosh.rc", "rcs/JediJosh.macro"):
            if (STATE / relative).exists():
                originals.add(relative)
        # Preserve every existing native package, including other players.
        originals.update(str(p.relative_to(STATE)) for p in
                         (LIBRARY / "saves").rglob("*.cs") if p.is_file())
        copied = {}
        for relative in sorted(originals, key=len):
            source, target = STATE / relative, operation / "files" / relative
            if any(target.is_relative_to(operation / "files" / prior)
                   for prior in copied):
                continue
            assert not source.is_symlink()
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_dir():
                before = tree(source)
                shutil.copytree(source, target)
                assert before == tree(target) == tree(source), relative
                copied[relative] = before
            else:
                before = sha(source)
                shutil.copy2(source, target)
                assert before == sha(target) == sha(source), relative
                copied[relative] = before
        databases = {}
        for relative in ("accounts.db3", "settings.db3", "rcs/library/index.sqlite",
                         "rcs/coop_chronicle.db"):
            source = STATE / relative
            if not source.is_file():
                continue
            target = operation / "databases" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as db:
                with sqlite3.connect(target) as copy:
                    db.backup(copy)
                    assert copy.execute("PRAGMA integrity_check").fetchone() == ("ok",)
            databases[relative] = sha(target)
        event = LIBRARY / "events" / (GAME + ".json")
        if event.exists():
            shutil.copy2(event, operation / "event-before.json")
        write(operation / "game-before.json", game)
        save = save_dir / "JediJosh.cs"
        saved_copy = operation / "files/rcs/library/saves" / GAME / "JediJosh.cs"
        assert sha(save) == sha(saved_copy)
        old_chunks = chunks(binary, saved_copy)
        write(operation / "chunks-before.json", old_chunks)
        native = {str(p.relative_to(STATE)): sha(p) for p in
                  (LIBRARY / "saves").rglob("*.cs") if p.is_file()}
        receipt = {"backup_verified": True, "operation": str(operation), "stamp": stamp,
                   "baseline": str(BASE), "native_sha256": BINARY_SHA,
                   "game_id": GAME, "save_sha256": sha(save),
                   "saved_directory": str(saved_copy.parent),
                   "full_save_directory_manifest": tree(save_dir),
                   "backups": copied, "databases": databases,
                   "all_native_packages": native, "existing_chunks": len(old_chunks),
                   "created_at": datetime.now(timezone.utc).isoformat()}
        write(operation / "backup.json", receipt)
        subprocess.run(["sync", "-f", str(operation)], check=True, timeout=30)
    finally:
        if stopped:
            subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
    assert sha(save) == receipt["save_sha256"]
    print(json.dumps({key: receipt[key] for key in (
        "backup_verified", "operation", "stamp", "baseline", "native_sha256",
        "game_id", "save_sha256", "saved_directory", "existing_chunks", "created_at")}))


if __name__ == "__main__":
    backup()
