"""One reserved, serial component check; never compiles the whole game."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "crawl-ref/source"
OUTPUT = Path(__file__).with_name("core-check")
POLICY = Path.home() / "Documents/Codex/work/host-heavy/policy.json"
OWNER = "codex/01a15523-0d2a-7a92-b63a-f7e2469fd2fe"


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def worker(binding):
    for path, expected in binding["inputs"].items():
        if digest(Path(path)) != expected:
            raise RuntimeError("Bound input changed: " + path)
    binary = OUTPUT / "equipment-memory-tests"
    command = ["/usr/bin/clang++", "-std=c++17", "-O0", "-Wall", "-Wextra", "-Werror",
               "-I", str(SOURCE), "-I", str(SOURCE / "catch2-tests"),
               str(SOURCE / "equipment-memory.cc"),
               str(SOURCE / "catch2-tests/test_equipment_memory.cc"),
               str(SOURCE / "catch2-tests/catch_amalgamated.o"), "-o", str(binary)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=120)
    (OUTPUT / "compile.log").write_text(result.stdout + result.stderr)
    report = {"compileCommand": command, "compileExitCode": result.returncode,
              "componentOnly": True, "wholeGameBuild": False}
    if result.returncode == 0:
        tests = subprocess.run([str(binary), "[equipment-memory]"], capture_output=True,
                               text=True, timeout=30)
        (OUTPUT / "tests.log").write_text(tests.stdout + tests.stderr)
        report.update(testExitCode=tests.returncode, binarySha256=digest(binary))
        print(tests.stdout + tests.stderr, flush=True)
    else:
        print(result.stdout + result.stderr, flush=True)
    report["sourceUnchanged"] = all(digest(Path(path)) == expected
                                     for path, expected in binding["inputs"].items())
    report["passed"] = (report.get("testExitCode") == 0 and report["sourceUnchanged"])
    write(OUTPUT / "result.json", report)
    return 0 if report["passed"] else 1


def dispatch():
    OUTPUT.mkdir(exist_ok=True)
    policy = json.loads(POLICY.read_text())
    if policy.get("resourceHold", {}).get("active"):
        raise RuntimeError("Host resource hold is active; no phase started")
    gate = Path(policy["gateScript"])
    if digest(gate) != policy["gateSha256"]:
        raise RuntimeError("Gate script differs from policy")
    inputs = [SOURCE / name for name in [
        "equipment-memory.h", "equipment-memory.cc", "artefact-prop-type.h",
        "item-prop-enum.h", "tag-version.h", "macros.h",
        "catch2-tests/test_equipment_memory.cc", "catch2-tests/catch_amalgamated.hpp",
        "catch2-tests/catch_amalgamated.cc", "catch2-tests/catch_amalgamated.o"]]
    inputs.append(Path(__file__).resolve())
    binding = {"owner": OWNER, "preparedAt": time.time(),
               "scope": "Standalone equipment-memory core; existing hash-bound Catch2 object reused",
               "compileJobs": 1, "gateSha256": digest(gate),
               "stateDirectory": policy["stateDirectory"],
               "capacity": {"logicalCpus": os.cpu_count(), "loadAverage": os.getloadavg()},
               "inputs": {str(path): digest(path) for path in inputs}}
    binding_path = OUTPUT / "binding.json"
    write(binding_path, binding)
    request = digest(binding_path)
    prefix = [sys.executable, str(gate), "--state-dir", policy["stateDirectory"]]
    reserved = subprocess.run(prefix + ["reserve", "--owner", OWNER,
        "--label", "DCSS Oozle isolated equipment-memory core", "--request-id", request],
        capture_output=True, text=True)
    if reserved.returncode:
        write(OUTPUT / "dispatch-not-started.json", {
            "exitCode": reserved.returncode, "output": reserved.stdout + reserved.stderr,
            "nativeCommandLaunched": False})
        print(reserved.stdout + reserved.stderr)
        return reserved.returncode
    reservation = json.loads(reserved.stdout)["runId"]
    write(OUTPUT / "reservation.json", json.loads(reserved.stdout))
    command = prefix + ["run", "--owner", OWNER, "--label", binding["scope"],
        "--reservation-id", reservation, "--request-id", request, "--cwd", str(ROOT),
        "--", sys.executable, str(Path(__file__).resolve()), "--worker"]
    phase = subprocess.run(command)
    state_path = Path(policy["stateDirectory"]) / "state.json"
    state = json.loads(state_path.read_text())
    write(OUTPUT / "phase-closure.json", state)
    if (state.get("runId") != reservation or state.get("owner") != OWNER
            or state.get("supervisedProcessGroupGone") is not True
            or state.get("status") not in {"completed_held", "failed_held"}):
        raise RuntimeError("Phase closure is unresolved; reservation preserved")
    try:
        os.killpg(state["processGroup"], 0)
    except ProcessLookupError:
        pass
    else:
        raise RuntimeError("Phase process group still exists; reservation preserved")
    release = OUTPUT / "release-evidence.json"
    write(release, {"reservationId": reservation, "owner": OWNER,
        "allOwnedProcessesGone": True, "phaseClosureEvidence": str(OUTPUT / "phase-closure.json"),
        "phaseClosureSha256": digest(OUTPUT / "phase-closure.json")})
    released = subprocess.run(prefix + ["release", "--owner", OWNER,
        "--reservation-id", reservation, "--evidence", str(release)],
        capture_output=True, text=True)
    (OUTPUT / "release.log").write_text(released.stdout + released.stderr)
    if released.returncode:
        raise RuntimeError("Reservation release failed; inspect release.log")
    return phase.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", action="store_true")
    args = parser.parse_args()
    if args.worker:
        raise SystemExit(worker(json.loads((OUTPUT / "binding.json").read_text())))
    raise SystemExit(dispatch())
