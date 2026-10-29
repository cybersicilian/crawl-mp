"""Prepare the two-file Elf:3 release and validate only private save copies."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile
import time

from backup_deployment import BASE, BINARY_SHA, GAME, LIBRARY, OLD_MAP_SHA, chunks, sha, tree, write

MAP = "crawl-ref/source/dat/des/builder/layout_geoelf_castle.des"
HELPER = "crawl-ref/source/dat/dlua/layout/coordinates.lua"
FIELDS = ("name", "species", "xl", "god", "hp", "hp_max", "mp", "mp_max", "gold",
          "turn", "time", "str", "int", "dex", "progress", "form", "piety_rank",
          "inv", "weapon_index", "offhand_index", "place", "depth")
MEMBER_FIELDS = ("player_id", "name", "species", "job", "xl", "hp", "hp_max", "mp",
                 "mp_max", "gold", "piety", "turns", "elapsed_aut", "exp_pool",
                 "runes", "gems", "inventory", "skills", "spells", "mutations")


def prepare(payload, operation):
    os.umask(0o077)
    locks = []
    for name in ("/opt/dcss/release-build.lock", "/run/lock/dcss-counts-activation.lock"):
        handle = open(name, "a")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    backup = json.loads((operation / "backup.json").read_text())
    manifest = json.loads((payload / "manifest.json").read_text())
    assert backup["backup_verified"] and backup["baseline"] == str(BASE)
    assert Path("/opt/dcss/current").resolve() == BASE
    assert sha(BASE / "crawl-ref/source/crawl") == BINARY_SHA
    assert sha(BASE / MAP) == OLD_MAP_SHA
    for name, expected in manifest.items():
        assert sha(payload / name) == expected, name
    saved_dir = Path(backup["saved_directory"])
    assert tree(saved_dir) == backup["full_save_directory_manifest"]
    live_save = LIBRARY / "saves" / GAME / "JediJosh.cs"
    assert sha(live_save) == backup["save_sha256"], "Live checkpoint changed; take a fresh backup"
    release = Path("/opt/dcss/releases") / (backup["stamp"] + "-elf3-fix")
    assert not release.exists()
    subprocess.run(["cp", "-al", str(BASE), str(release)], check=True, timeout=60)
    for name in (MAP, HELPER):
        target = release / name
        temporary = target.with_name(target.name + ".elf3-new")
        shutil.copy2(payload / name, temporary)
        temporary.chmod(0o644)
        temporary.replace(target)
        # Saved per-game .des caches must observe the new map without deletion.
        later = time.time() + 2
        os.utime(target, (later, later))
    same = 0
    for old in BASE.rglob("*"):
        relative = old.relative_to(BASE)
        new = release / relative
        if old.is_symlink():
            assert new.is_symlink() and os.readlink(old) == os.readlink(new), str(relative)
        elif old.is_file() and str(relative) != MAP:
            assert old.stat().st_ino == new.stat().st_ino, str(relative)
            same += 1
    assert sha(release / "crawl-ref/source/crawl") == BINARY_SHA
    assert sha(BASE / MAP) == OLD_MAP_SHA
    account = pwd.getpwnam("dcss")
    qa = Path(tempfile.mkdtemp(prefix="ef3-", dir="/tmp"))
    native = qa / "n"
    native.mkdir()
    shutil.copy2(release / "crawl-ref/source/crawl", native / "crawl")
    shutil.copytree(release / "crawl-ref/source/dat", native / "dat")
    shutil.copytree(saved_dir, qa / "save")
    for name in ("scripts", "library", "test-saves"):
        (native / name).mkdir()
    for name in ("layout-coordinates.lua", "elf3-gen.lua"):
        shutil.copy2(payload / "crawl-ref/source/test" / name, native / "scripts" / name)
    for directory, _, names in os.walk(qa):
        os.chown(directory, account.pw_uid, account.pw_gid)
        for name in names:
            os.chown(Path(directory) / name, account.pw_uid, account.pw_gid)
    tests = []
    test_env = dict(os.environ, TERM="xterm", CRAWL_DIR=str(native), CRAWL_RC="/dev/null",
                    CRAWL_SAVE_DIR=str(native / "test-saves"),
                    CRAWL_LIBRARY_DIR=str(native / "library"),
                    CRAWL_RECORD_PATH=str(qa / "test-record.json"))
    for name in ("layout-coordinates", "elf3-gen"):
        command = ["sudo", "-u", "dcss", "--", "env", *(key + "=" + test_env[key]
                   for key in ("TERM", "CRAWL_DIR", "CRAWL_RC", "CRAWL_SAVE_DIR",
                               "CRAWL_LIBRARY_DIR", "CRAWL_RECORD_PATH")),
                   str(native / "crawl"), "-dir", str(native), "-rc", "/dev/null",
                   "-name", "ElfProbe", "-no-gdb", "-script", name]
        result = subprocess.run(command, cwd=native, capture_output=True, text=True, timeout=90)
        row = {"name": name, "exit_code": result.returncode,
               "stdout": result.stdout, "stderr": result.stderr}
        tests.append(row)
        write(operation / ("native-" + name + ".json"), row)
        assert result.returncode == 0, row
    game = json.loads((operation / "game-before.json").read_text())
    config = {"source": str(native), "save": str(qa / "save/JediJosh.cs"),
              "private_root": str(qa), "expected_save_sha256": backup["save_sha256"],
              "record_environment": {"CRAWL_GAME_ID": GAME, "CRAWL_OWNER_ID": game["owner_id"],
                  "CRAWL_RECORD_PATH": str(qa / "record.json"),
                  "CRAWL_LIBRARY_DIR": str(native / "library")}}
    reports = []
    for number in (1, 2):
        config_path = qa / ("config-" + str(number) + ".json")
        write(config_path, config)
        os.chown(config_path, account.pw_uid, account.pw_gid)
        output = qa / ("r" + str(number))
        result = subprocess.run(["sudo", "-u", "dcss", "python3", str(payload / "roundtrip_save.py"),
                                 str(config_path), str(output)], capture_output=True, text=True, timeout=75)
        write(operation / ("private-roundtrip-" + str(number) + ".json"),
              {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
        assert result.returncode == 0, result.stderr[-6000:]
        report = json.loads((output / "report.json").read_text())
        reports.append(report)
        config["expected_save_sha256"] = report["save_sha256"]
    assert reports[0]["identity"] == reports[1]["identity"]
    assert all(reports[0]["player"].get(key) == reports[1]["player"].get(key) for key in FIELDS)
    first, second = reports[0]["party"].get("members", []), reports[1]["party"].get("members", [])
    assert first and len(first) == len(second)
    assert all(a.get(key) == b.get(key) for a, b in zip(first, second) for key in MEMBER_FIELDS)
    indexed = {row["name"]: row["id"] for row in
               json.loads(game["snapshot_json"]).get("players", [])}
    assert all(member["player_id"] == indexed[member["name"]] for member in first), indexed
    old_chunks = json.loads((operation / "chunks-before.json").read_text())
    new_chunks = chunks(native / "crawl", qa / "save/JediJosh.cs")
    removed = sorted(set(old_chunks) - set(new_chunks))
    changed_levels = [name for name in old_chunks if re.search(r":\d+$", name)
                      and old_chunks[name] != new_chunks.get(name)]
    added = sorted(set(new_chunks) - set(old_chunks))
    assert not removed and not changed_levels
    assert "Elf:3" in new_chunks and set(added) <= {"Elf:3"}, added
    assert sha(live_save) == backup["save_sha256"], "Live checkpoint changed during private validation"
    assert tree(saved_dir) == backup["full_save_directory_manifest"]
    receipt = {"ready": True, "operation": str(operation), "release": str(release),
               "baseline": str(BASE), "native_sha256": BINARY_SHA,
               "runtime_files": {name: manifest[name] for name in (MAP, HELPER)},
               "unchanged_existing_files": same, "private_qa": str(qa),
               "live_save_sha256": backup["save_sha256"], "live_save_unchanged": True,
               "private_load_save_reload_passed": True, "identity_preserved": True,
               "inventory_skills_spells_runes_preserved": True, "existing_level_chunks_preserved": True,
               "added_chunks": added, "removed_chunks": removed,
               "player": {key: reports[1]["player"].get(key) for key in FIELDS if key != "inv"},
               "tests": tests, "prepared_at": datetime.now(timezone.utc).isoformat()}
    write(operation / "prepared.json", receipt)
    write(release / "elf3-release.json", {key: value for key, value in receipt.items() if key != "player"})
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("payload", type=Path)
    parser.add_argument("operation", type=Path)
    args = parser.parse_args()
    prepare(args.payload, args.operation)
