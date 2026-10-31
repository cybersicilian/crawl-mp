"""Compare private normal-save serialization with the unchanged production engine."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile

PAYLOAD = Path("/tmp/dcss-elf3-payload-01a17a3a-r6")
OP = Path("/var/lib/dcss/recovery/elf3-20261026T223529Z")
QA = Path("/tmp/ef3-ipbbga5c")
sys.path.insert(0, str(PAYLOAD))
from backup_deployment import BASE, BINARY_SHA, GAME, LIBRARY, chunks, sha, tree, write
from prepare_deployment import FIELDS, MEMBER_FIELDS, MAP, HELPER

os.umask(0o077)
locks = []
for name in ("/opt/dcss/release-build.lock", "/run/lock/dcss-counts-activation.lock"):
    handle = open(name, "a")
    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    locks.append(handle)
backup = json.loads((OP / "backup.json").read_text())
game = json.loads((OP / "game-before.json").read_text())
manifest = json.loads((PAYLOAD / "manifest.json").read_text())
release = Path("/opt/dcss/releases/20261026T223529Z-elf3-fix-r6")
assert Path("/opt/dcss/current").resolve() == BASE
assert sha(BASE / "crawl-ref/source/crawl") == BINARY_SHA
for name in (MAP, HELPER):
    assert sha(release / name) == manifest[name]
reports = [json.loads((QA / ("r" + str(i)) / "report.json").read_text()) for i in (1, 2)]
assert all(row["exit_code"] == 0 and row["save_key_sent"] for row in reports)
assert reports[0]["identity"] == reports[1]["identity"]
assert all(reports[0]["player"].get(k) == reports[1]["player"].get(k) for k in FIELDS)
tests = [json.loads((OP / ("native-r6-" + name + ".json")).read_text())
         for name in ("builddb", "layout-coordinates", "elf3-gen")]
assert all(row["exit_code"] == 0 for row in tests)

control = Path(tempfile.mkdtemp(prefix="ef3c-", dir="/tmp"))
shutil.copytree(Path(backup["saved_directory"]), control / "save")
(control / "library").mkdir()
config = {"source": str(BASE / "crawl-ref/source"), "save": str(control / "save/JediJosh.cs"),
          "private_root": str(control), "expected_save_sha256": backup["save_sha256"],
          "expected_place": "Elven Halls", "expected_depth": 2,
          "record_environment": {"CRAWL_GAME_ID": GAME, "CRAWL_OWNER_ID": game["owner_id"],
              "CRAWL_RECORD_PATH": str(control / "record.json"),
              "CRAWL_LIBRARY_DIR": str(control / "library")}}
write(control / "config.json", config)
account = pwd.getpwnam("dcss")
for directory, _, names in os.walk(control):
    os.chown(directory, account.pw_uid, account.pw_gid)
    for name in names:
        os.chown(Path(directory) / name, account.pw_uid, account.pw_gid)
result = subprocess.run(["sudo", "-u", "dcss", "python3", str(PAYLOAD / "roundtrip_save.py"),
                         str(control / "config.json"), str(control / "r")],
                        capture_output=True, text=True, timeout=75)
write(OP / "baseline-control.json", {"exit_code": result.returncode,
      "stdout": result.stdout, "stderr": result.stderr, "private_path": str(control)})
assert result.returncode == 0, result.stderr[-2000:]
original = json.loads((control / "r/report.json").read_text())
assert original["identity"] == reports[0]["identity"]
assert all(original["player"].get(k) == reports[0]["player"].get(k) for k in FIELDS)
indexed = {row["name"]: row["id"] for row in json.loads(game["snapshot_json"])["players"]}
for row in [original, *reports]:
    members = row["party"]["members"]
    assert members and all(member["player_id"] == indexed[member["name"]] for member in members)
    assert len(members) == len(reports[0]["party"]["members"])
    assert all(a.get(k) == b.get(k) for a, b in zip(
        members, reports[0]["party"]["members"]) for k in MEMBER_FIELDS)
old = json.loads((OP / "chunks-before.json").read_text())
updated = chunks(QA / "n/crawl", QA / "save/JediJosh.cs")
baseline = chunks(BASE / "crawl-ref/source/crawl", control / "save/JediJosh.cs")
assert set(old) == set(updated) == set(baseline)
changed = lambda data: sorted(name for name in old if re.search(r":\d+$", name)
                              and old[name] != data[name])
assert changed(updated) == changed(baseline) == ["Elf:2"]
live = LIBRARY / "saves" / GAME / "JediJosh.cs"
assert sha(live) == backup["save_sha256"]
assert tree(Path(backup["saved_directory"])) == backup["full_save_directory_manifest"]
receipt = {"ready": True, "operation": str(OP), "release": str(release), "baseline": str(BASE),
           "native_sha256": BINARY_SHA, "runtime_files": {name: manifest[name] for name in (MAP, HELPER)},
           "live_save_unchanged": True, "live_save_sha256": backup["save_sha256"],
           "private_load_save_reload_passed": True, "original_engine_control_passed": True,
           "identity_preserved": True, "inventory_skills_spells_runes_preserved": True,
           "existing_level_chunks_preserved": True,
           "inactive_level_chunks_unchanged": True, "current_floor_reserialized_in_private_copies": "Elf:2",
           "current_floor_control_exact_match": baseline["Elf:2"] == updated["Elf:2"],
           "no_chunks_removed_or_added": True, "checkpoint_place": "Elf:2",
           "elf3_generation_separately_passed": True, "elf3_generations": 26,
           "private_qa": str(QA), "baseline_control": str(control),
           "player": {k: reports[1]["player"].get(k) for k in FIELDS if k != "inv"},
           "tests": tests, "prepared_at": datetime.now(timezone.utc).isoformat()}
write(OP / "prepared.json", receipt)
write(release / "elf3-release.json", {k: v for k, v in receipt.items() if k != "player"})
print(json.dumps(receipt))
