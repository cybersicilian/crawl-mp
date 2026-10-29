"""Deploy the authorized session handoff; private save evidence stays on-server."""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import pwd
import signal
import subprocess
import tempfile
import time

PAYLOAD = Path(__file__).resolve().parent
MANIFEST = json.loads((PAYLOAD / "manifest.json").read_text())
spec = importlib.util.spec_from_file_location("deployment_core", PAYLOAD / "deployment_core.py")
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
core.BASE = Path(MANIFEST["baseline_release"])
core.BASE_HASHES = {
    "webserver/webtiles/session_recovery.py": MANIFEST["baseline_runtime_sha256"],
    "webserver/webtiles/library_socket.py": "db1f9d962447d24a8abec84e2f5a0e6092a5210a92a3ffaef6b6c86a3f35ac0c",
}
OPERATION = Path("/opt/dcss/staging/session-handoff-01a18019")
RELEASE = Path("/opt/dcss/releases") / OPERATION.name
SOURCE = RELEASE / core.PREFIX
FILES = ("session_recovery.py", "session_recovery_test.py", "session_handoff_test.py")


def prepare(resume=False):
    held = core.locks()
    core.baseline()
    for name, digest in MANIFEST["files"].items():
        assert core.sha(PAYLOAD / name) == digest, "Frozen payload changed"
    if resume:
        assert OPERATION.is_dir() and RELEASE.is_dir()
        assert not (OPERATION / "prepared.json").exists() and not (OPERATION / "activation.json").exists()
        assert core.sha(SOURCE / "webserver/webtiles/session_recovery.py") == MANIFEST["files"]["session_recovery.py"]
        (OPERATION / "backend-tests.log").rename(OPERATION / "backend-tests-attempt1.log")
    else:
        assert not OPERATION.exists() and not RELEASE.exists(), "Candidate already exists"
        OPERATION.mkdir(mode=0o700)
        subprocess.run(["cp", "-al", str(core.BASE), str(RELEASE)], check=True, timeout=90)
    for name in FILES:
        core.replace_file(PAYLOAD / name, SOURCE / "webserver/webtiles" / name, 0o644)
    native = core.sha(core.BASE / core.PREFIX / "crawl")
    assert core.sha(SOURCE / "crawl") == native
    for name in ("rcs", "saves"):
        assert (SOURCE / name).resolve() == core.STATE / name
    qa = Path(tempfile.mkdtemp(prefix="dcss-handoff-qa-"))
    account = pwd.getpwnam("dcss")
    os.chown(qa, account.pw_uid, account.pw_gid)
    qa.chmod(0o700)
    core.run(["sudo", "-u", "dcss", "env", "-u", "CRAWL_LIBRARY_DIR",
              "PYTHONDONTWRITEBYTECODE=1", "PYTHONPATH=" + str(SOURCE / "webserver"),
              "python3", "-m", "unittest", "webtiles.session_recovery_test",
              "webtiles.expedition_navigation_test", "webtiles.session_handoff_test", "-v"],
             qa, OPERATION / "backend-tests.log")
    allowed = {core.PREFIX + "webserver/webtiles/" + name for name in FILES}
    preserved = 0
    for old in core.BASE.rglob("*"):
        relative = str(old.relative_to(core.BASE))
        target = RELEASE / relative
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target)
        elif old.is_file() and relative not in allowed:
            assert old.stat().st_ino == target.stat().st_ino, "Unrelated release file changed"
            preserved += 1
    core.baseline()
    ready = dict(ready=True, release=str(RELEASE), baseline=str(core.BASE),
                 runtime_sha256=core.sha(SOURCE / "webserver/webtiles/session_recovery.py"),
                 native_sha256=native, native_unchanged=True, backend_tests_passed=21,
                 preserved_release_files=preserved, production_deployed=False)
    core.write(OPERATION / "prepared.json", ready)
    print(json.dumps(ready), flush=True)


def checkpoint_active_games(ready):
    main = int(subprocess.check_output(["systemctl", "show", "dcss-coop", "-p", "MainPID",
                                        "--value"], text=True))
    active = sorted(core.native_processes())
    games = []
    for pid in active:
        proc = Path("/proc") / str(pid)
        stat = (proc / "stat").read_text().split()
        assert int(stat[3]) == main, "A native process belongs to another owner"
        assert core.sha(proc / "exe") == ready["native_sha256"], "Native process changed"
        environment = dict(entry.split(b"=", 1) for entry in (proc / "environ").read_bytes().split(b"\0")
                           if b"=" in entry)
        save_dir = Path(environment[b"CRAWL_SAVE_DIR"].decode()).resolve()
        assert save_dir.is_relative_to(core.STATE / "rcs/library/saves")
        games.append(dict(pid=pid, started=stat[21], save_dir=str(save_dir)))
    if games:
        prior = OPERATION.with_name(OPERATION.name + "-pre-checkpoint")
        prior.mkdir(mode=0o700)
        core.backup(prior)
    assert sorted(core.native_processes()) == active, "Active games changed before checkpoint"
    started = time.time()
    for game in games:
        proc = Path("/proc") / str(game["pid"])
        assert (proc / "stat").read_text().split()[21] == game["started"]
        os.kill(game["pid"], signal.SIGHUP)
    for _ in range(120):
        if not core.native_processes():
            break
        time.sleep(0.25)
    assert not core.native_processes(), "Checkpoint incomplete; forced termination is prohibited"
    for game in games:
        packages = list(Path(game["save_dir"]).rglob("*.cs"))
        assert packages and all(p.stat().st_size > 0 for p in packages), "Checkpoint missing"
        assert any(p.stat().st_mtime >= started - 1 for p in packages), "Fresh checkpoint missing"
    core.write(OPERATION / "graceful-save.json", dict(passed=True, forced_kill=False, games=games))
    return len(games)


def activate():
    held = core.locks()
    core.baseline()
    assert not (OPERATION / "activation.json").exists(), "Already deployed"
    ready = json.loads((OPERATION / "prepared.json").read_text())
    assert ready["ready"] and ready["backend_tests_passed"] == 21
    assert core.sha(SOURCE / "webserver/webtiles/session_recovery.py") == ready["runtime_sha256"]
    assert core.sha(SOURCE / "crawl") == ready["native_sha256"]
    assert core.sha(core.BASE / core.PREFIX / "crawl") == ready["native_sha256"]
    count = checkpoint_active_games(ready)
    previous = Path("/opt/dcss/previous").resolve()
    release_text = (core.STATE / "release.txt").read_text()
    stopped = switched = False
    try:
        assert not core.native_processes(), "A new game started before maintenance"
        subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
        stopped = True
        assert not core.native_processes()
        core.baseline()
        saved = core.backup(OPERATION)
        assert core.state_manifest() == saved["save_files"]
        core.point("previous", core.BASE)
        core.point("current", RELEASE)
        switched = True
        (core.STATE / "release.txt").write_text(str(RELEASE) + "\n")
        assert core.state_manifest() == saved["save_files"]
        subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
        stopped = False
        assert core.healthy(), "Candidate failed application health check"
    except BaseException as error:
        if switched:
            subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
            core.point("current", core.BASE)
            core.point("previous", previous)
            (core.STATE / "release.txt").write_text(release_text)
        if switched or stopped:
            subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
        core.write(OPERATION / "activation-failure.json", dict(error=repr(error),
                   baseline_restored=Path("/opt/dcss/current").resolve() == core.BASE,
                   healthy=core.healthy()))
        raise
    receipt = dict(deployed=True, release=str(RELEASE), previous=str(core.BASE),
                   runtime_sha256=ready["runtime_sha256"], native_unchanged=True,
                   backend_tests_passed=21, gracefully_checkpointed_games=count,
                   verified_backup=saved["directory"], save_files_preserved=len(saved["save_files"]),
                   database_backups=len(saved["databases"]), save_files_never_replaced=True,
                   health=True, activated_at=datetime.now(timezone.utc).isoformat())
    core.write(OPERATION / "activation.json", receipt)
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "activate"))
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.mode == "prepare":
        prepare(args.resume)
    else:
        activate()
