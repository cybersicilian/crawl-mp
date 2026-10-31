"""Activate the validated data-only repair, preserving every native checkpoint."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

from backup_deployment import BASE, BINARY_SHA, GAME, LIBRARY, STATE, native_processes, sha, tree, write


def packages():
    return {str(path.relative_to(STATE)): sha(path) for path in
            (LIBRARY / "saves").rglob("*.cs") if path.is_file()}


def point(name, target):
    link = Path("/opt/dcss") / name
    temporary = link.with_name(name + ".elf3-next")
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(target)
    temporary.replace(link)


def healthy():
    for _ in range(45):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8080/status/version/", timeout=2) as response:
                if response.status == 200 and json.load(response).get("python_supported"):
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    return False


def activate(operation, snapshot_file):
    os.umask(0o077)
    locks = []
    for name in ("/opt/dcss/release-build.lock", "/run/lock/dcss-counts-activation.lock"):
        handle = open(name, "a")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(handle)
    backup = json.loads((operation / "backup.json").read_text())
    ready = json.loads((operation / "prepared.json").read_text())
    snapshot = json.loads(snapshot_file.read_text())
    release = Path(ready["release"])
    assert ready["ready"] and ready["private_load_save_reload_passed"]
    assert ready["existing_level_chunks_preserved"] and backup["backup_verified"]
    assert snapshot["status"] == "READY"
    assert snapshot["sourceDisk"].endswith("/disks/dcss-coop-server-data")
    assert Path("/opt/dcss/current").resolve() == BASE
    assert sha(BASE / "crawl-ref/source/crawl") == BINARY_SHA
    assert sha(release / "crawl-ref/source/crawl") == BINARY_SHA
    for name, expected in ready["runtime_files"].items():
        assert sha(release / name) == expected, name
    assert all((release / "crawl-ref/source" / name).resolve() == STATE / name
               for name in ("rcs", "saves"))
    assert packages() == backup["all_native_packages"], "A checkpoint changed; rebind before cutover"
    assert not native_processes(), "An active game must save and exit before cutover"
    working = subprocess.check_output([
        "systemctl", "show", "dcss-coop", "-p", "WorkingDirectory", "--value"], text=True).strip()
    assert working == "/opt/dcss/current/crawl-ref/source", working
    old_previous = Path("/opt/dcss/previous").resolve()
    old_text = (STATE / "release.txt").read_text()
    live_dir = LIBRARY / "saves" / GAME
    before = tree(live_dir)
    switched = stopped = False
    try:
        subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
        stopped = True
        assert not native_processes()
        assert Path("/opt/dcss/current").resolve() == BASE
        assert packages() == backup["all_native_packages"]
        assert tree(live_dir) == before
        point("previous", BASE)
        point("current", release)
        switched = True
        # There is no save-file replacement or native loading in this cutover.
        assert packages() == backup["all_native_packages"]
        assert tree(live_dir) == before
        (STATE / "release.txt").write_text(str(release) + "\n")
        subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
        stopped = False
        assert healthy(), "Candidate failed its startup health check"
    except BaseException as error:
        if switched:
            subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
            point("current", BASE)
            point("previous", old_previous)
            (STATE / "release.txt").write_text(old_text)
        if switched or stopped:
            subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
        write(operation / "activation-failure.json", {
            "error": repr(error), "baseline_restored": Path("/opt/dcss/current").resolve() == BASE,
            "rollback_healthy": healthy(), "save_files_never_replaced": True})
        raise
    receipt = {"deployed": True, "release": str(release), "previous": str(BASE),
               "native_sha256": BINARY_SHA, "health": True,
               "snapshot": snapshot["name"], "snapshot_id": snapshot["id"],
               "backup": str(operation), "josh_save_sha256_at_cutover": backup["save_sha256"],
               "all_native_packages_preserved_at_cutover": True,
               "complete_josh_directory_preserved_at_cutover": True,
               "save_files_never_replaced": True, "existing_players_may_resume": True,
               "activated_at": datetime.now(timezone.utc).isoformat()}
    write(operation / "activation.json", receipt)
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", type=Path)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    activate(args.operation, args.snapshot)
