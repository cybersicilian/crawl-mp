"""Prepare and activate the authorized input fix without replacing player saves."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

BASE = Path("/opt/dcss/releases/20261026T223529Z-elf3-fix-r6")
STAGE = Path("/opt/dcss/staging/chain-01a16eb2/crawl-ref/source")
STATE = Path("/var/lib/dcss")
PREFIX = "crawl-ref/source/"
BASE_HASHES = {
    "crawl": "16ab04953766d3c53f34c1139d4b22f62f5eda89b91b603f3139d50939d35ca4",
    "tileweb.cc": "180bd6718656cffea10fea6b917babe7d5a99278dee0f25d6180740e75f73117",
    "webserver/webtiles/activity_pump.py": "26bbd64a464ec3d8a6d2e1c917c37edcdc920c494cb0f87eacd9192add5775e4",
}


def sha(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def locks():
    handles = []
    for path in ("/opt/dcss/release-build.lock", "/run/lock/dcss-counts-activation.lock"):
        handle = open(path, "a")
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        handles.append(handle)
    return handles


def baseline():
    assert Path("/opt/dcss/current").resolve() == BASE, "Current release changed"
    for name, digest in BASE_HASHES.items():
        assert sha(BASE / PREFIX / name) == digest, name


def native_processes():
    result = []
    for process in Path("/proc").glob("[0-9]*"):
        try:
            if (process / "exe").resolve().name == "crawl":
                result.append(int(process.name))
        except (FileNotFoundError, PermissionError):
            pass
    return result


def run(command, cwd, log, timeout=120):
    with log.open("w") as stream:
        result = subprocess.run(command, cwd=cwd, stdout=stream,
                                stderr=subprocess.STDOUT, timeout=timeout)
    assert result.returncode == 0, str(log) + "\n" + log.read_text()[-8000:]


def replace_file(source, target, mode):
    temporary = target.with_name(target.name + ".input-fix-new")
    assert not temporary.exists()
    shutil.copy2(source, temporary)
    temporary.chmod(mode)
    temporary.replace(target)


def state_manifest():
    # Preserve complete native save directories, including per-game caches and
    # auxiliary state, in both the library and the legacy save location.
    roots = (STATE / "rcs/library/saves", STATE / "saves")
    result = {}
    for root in roots:
        for path in sorted(root.rglob("*")):
            name = str(path.relative_to(STATE))
            if path.is_symlink():
                result[name] = {"symlink": os.readlink(path)}
            elif path.is_file():
                result[name] = sha(path)
    return result


def prepare(payload, operation):
    held = locks()
    baseline()
    manifest = json.loads((payload / "payload-manifest.json").read_text())
    for name, digest in manifest.items():
        assert sha(payload / name) == digest, name
    assert not operation.exists()
    operation.mkdir(mode=0o700)
    assert sha(STAGE / "crawl") == BASE_HASHES["crawl"]
    native_sources = {}
    for source in (BASE / PREFIX).iterdir():
        if source.suffix in {".cc", ".h"}:
            assert sha(source) == sha(STAGE / source.name), source.name
            native_sources[source.name] = sha(source)
    write(operation / "native-baseline.json", native_sources)
    build = Path("/opt/dcss/staging") / operation.name
    assert not build.exists()
    subprocess.run(["cp", "-a", "--reflink=auto", str(STAGE), str(build)], check=True, timeout=90)
    run(["patch", "--batch", "--fuzz=0", "-p1", "-i", str(payload / "native.patch")],
        build, operation / "native-patch.log")
    # Reuse the deployed binary's complete object set and exact build flags.
    # Only the patched input handler and final executable need recompilation.
    make = ["make", "-j1", "WEBTILES=y", "NOWIZARD=y", "NO_OPTIMIZE=y",
            "STDFLAG=-std=c++17", "PYTHON=python3", "crawl"]
    run(make, build, operation / "build.log", 900)
    assert sha(STAGE / "crawl") == BASE_HASHES["crawl"], "Shared build was modified"
    release = Path("/opt/dcss/releases") / operation.name
    assert not release.exists()
    subprocess.run(["cp", "-al", str(BASE), str(release)], check=True, timeout=90)
    candidate = release / PREFIX
    replace_file(build / "crawl", candidate / "crawl", 0o755)
    replace_file(build / "tileweb.cc", candidate / "tileweb.cc", 0o644)
    pump = candidate / "webserver/webtiles/activity_pump.py"
    # Break the release hard link before patching the Python source in place.
    replace_file(BASE / PREFIX / "webserver/webtiles/activity_pump.py", pump, 0o644)
    run(["patch", "--batch", "--fuzz=0", "-p1", "-i", str(payload / "backend.patch")],
        candidate, operation / "backend-patch.log")
    assert sha(pump) != BASE_HASHES["webserver/webtiles/activity_pump.py"]
    baseline()
    for name in ("rcs", "saves"):
        assert (candidate / name).resolve() == STATE / name
    account = pwd.getpwnam("dcss")
    qa = Path(tempfile.mkdtemp(prefix="input-qa-", dir="/tmp"))
    qa.chmod(0o755)
    (qa / "tests").mkdir()
    shutil.copy2(payload / "activity_pump_test.py", qa / "tests/test_activity_pump.py")
    os.chown(qa, account.pw_uid, account.pw_gid)
    native_output = qa / "native"
    before = state_manifest()
    run(["sudo", "-u", "dcss", "python3", str(payload / "native-command-completion.py"),
         str(candidate), str(native_output)], candidate, operation / "native-test.log", 100)
    native = json.loads((native_output / "report.json").read_text())
    assert native["passed"] and native["owned_process_exited"]
    run(["env", "PYTHONPATH=" + str(candidate / "webserver"), "python3", "-m", "unittest",
         "discover", "-s", str(qa / "tests"), "-q"], qa, operation / "backend-tests.log")
    # Other players may keep playing during preparation. Do not require their
    # checkpoints to stay frozen until the separately guarded cutover.
    after = state_manifest()
    changed = sorted(name for name, digest in before.items() if after.get(name) != digest)
    shutil.copy2(native_output / "report.json", operation / "native-test.json")
    allowed = {PREFIX + name for name in BASE_HASHES}
    unchanged = 0
    for old in BASE.rglob("*"):
        name = str(old.relative_to(BASE))
        target = release / name
        if old.is_symlink():
            assert target.is_symlink() and os.readlink(old) == os.readlink(target), name
        elif old.is_file() and name not in allowed and not name.endswith(".pyc"):
            assert sha(old) == sha(target), name
            unchanged += 1
    ready = {"ready": True, "baseline": str(BASE), "release": str(release),
             "runtime_files": {name: sha(candidate / name) for name in BASE_HASHES},
             "unchanged_existing_files": unchanged, "native_test_passed": True,
             "backend_tests_passed": True, "private_qa": str(qa),
             "live_checkpoint_changes_during_preparation": changed,
             "existing_saves_used_by_tests": False, "production_activated": False}
    write(operation / "prepared.json", ready)
    print(json.dumps(ready), flush=True)


def healthy():
    for _ in range(45):
        try:
            with urllib.request.urlopen("http://127.0.0.1:8080/healthz", timeout=2) as response:
                if json.load(response).get("ok") is True:
                    return True
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    return False


def point(name, target):
    link = Path("/opt/dcss") / name
    temporary = link.with_name(name + ".input-fix-next")
    assert not temporary.exists() and not temporary.is_symlink()
    temporary.symlink_to(target)
    temporary.replace(link)


def backup(operation):
    recovery = STATE / "recovery" / operation.name
    recovery.mkdir(mode=0o700)
    original = state_manifest()
    for name in ("rcs", "saves"):
        shutil.copytree(STATE / name, recovery / "files" / name, symlinks=True,
                        ignore=lambda directory, names: [n for n in names
                            if (Path(directory) / n).is_socket()])
    for name, digest in original.items():
        path = recovery / "files" / name
        assert ({"symlink": os.readlink(path)} if path.is_symlink() else sha(path)) == digest, name
    databases = {}
    for source in STATE.rglob("*"):
        if (source.is_file() and source.suffix in {".db", ".db3", ".sqlite", ".sqlite3"}
                and not source.is_relative_to(STATE / "recovery")):
            relative = source.relative_to(STATE)
            target = recovery / "databases" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as db:
                with sqlite3.connect(target) as copied:
                    db.backup(copied)
                    assert copied.execute("PRAGMA integrity_check").fetchone() == ("ok",)
            databases[str(relative)] = sha(target)
    assert state_manifest() == original
    receipt = {"backup_verified": True, "directory": str(recovery),
               "save_files": original, "databases": databases}
    write(recovery / "backup.json", receipt)
    write(operation / "backup.json", receipt)
    subprocess.run(["sync", "-f", str(recovery)], check=True, timeout=30)
    return receipt


def activate(operation):
    held = locks()
    baseline()
    ready = json.loads((operation / "prepared.json").read_text())
    assert ready["ready"] and ready["native_test_passed"] and ready["backend_tests_passed"]
    release = Path(ready["release"])
    for name, digest in ready["runtime_files"].items():
        assert sha(release / PREFIX / name) == digest
    active = native_processes()
    if active:
        print(json.dumps({"waiting_for_saved_exit": True, "active_native_processes": active}), flush=True)
        return
    old_previous = Path("/opt/dcss/previous").resolve()
    old_text = (STATE / "release.txt").read_text()
    stopped = switched = False
    try:
        assert not native_processes(), "A game started before maintenance"
        subprocess.run(["systemctl", "stop", "dcss-coop"], check=True, timeout=90)
        stopped = True
        assert not native_processes()
        baseline()
        saved = backup(operation)
        assert state_manifest() == saved["save_files"]
        point("previous", BASE)
        point("current", release)
        switched = True
        (STATE / "release.txt").write_text(str(release) + "\n")
        assert state_manifest() == saved["save_files"]
        subprocess.run(["systemctl", "start", "dcss-coop"], check=True, timeout=60)
        stopped = False
        assert healthy(), "Candidate health failed"
        assert state_manifest() == saved["save_files"], "Existing save directory changed during cutover"
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
               "runtime_files": ready["runtime_files"], "health": True,
               "backup": saved["directory"], "native_packages_preserved": sum(
                   name.endswith(".cs") for name in saved["save_files"]),
               "all_save_directory_files_preserved": True, "save_files_never_replaced": True,
               "activated_at": datetime.now(timezone.utc).isoformat()}
    write(operation / "activation.json", receipt)
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("prepare", "activate"))
    parser.add_argument("payload", type=Path)
    parser.add_argument("operation", type=Path)
    arguments = parser.parse_args()
    if arguments.mode == "prepare":
        prepare(arguments.payload.resolve(), arguments.operation.resolve())
    else:
        activate(arguments.operation.resolve())
