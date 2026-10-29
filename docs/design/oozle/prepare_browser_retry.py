"""Freeze a browser-only Oozle retry using unchanged successful native evidence.

Preparation only. Fair admission and a fresh exact reservation remain required.
"""
from datetime import datetime, timezone
import argparse
from hashlib import sha256
import json
from pathlib import Path
import shutil


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


docs = Path(__file__).resolve().parent
repo = docs.parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("native_phase", type=Path)
parser.add_argument("target", type=Path)
parser.add_argument("negative", type=Path, nargs="?")
parser.add_argument("--override", action="append", default=[])
args = parser.parse_args()
previous = args.native_phase.resolve()
target = args.target.resolve()
negative = args.negative.resolve() if args.negative else previous
target.mkdir(exist_ok=False)
frozen = target / "inputs"
frozen.mkdir()
old = json.loads((previous / "binding.json").read_text())
playable = previous / "result/playable"
proof = previous / "native-passed.json"
closure = json.loads((previous / "result/process-closure.json").read_text())
assert closure["allOwnedProcessesGone"]
inputs = dict(old["inputs"])
for path, expected in inputs.items():
    assert digest(Path(path)) == expected, "Prior input drift: " + path
for name, expected in old["binaries"].items():
    assert digest(Path(old["build"]) / name) == expected
for name, expected in old["nativeInputEquivalence"].items():
    path = repo / "crawl-ref/source" / name
    assert digest(path) == expected["liveSourceSha256"]
    inputs[str(path)] = digest(path)
for name in ("run_native_acceptance.py", "phase_processes.py"):
    shutil.copy2(docs / name, frozen / name)
for name in ("oozle-gameplay-native.cjs", "multiplayer-native-client.cjs"):
    shutil.copy2(repo / "crawl-ref/source/webserver/tests" / name, frozen / name)
overrides = {}
for name in args.override:
    relative = Path(name)
    assert not relative.is_absolute() and ".." not in relative.parts
    target_file = frozen / "overrides" / relative
    target_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(repo / "crawl-ref/source" / relative, target_file)
    overrides[name] = str(target_file)
    inputs[str(target_file)] = digest(target_file)
for path in frozen.iterdir():
    if path.is_file():
        inputs[str(path)] = digest(path)
for name in ("native-passed.json", "phase-closure.json", "release-evidence.json",
             "producer-restoration.json", "playable-init-normalization.json"):
    inputs[str(previous / name)] = digest(previous / name)
inputs[str(previous / "result/process-closure.json")] = digest(previous / "result/process-closure.json")
if negative != previous:
    assert json.loads((negative / "result/process-closure.json").read_text())["allOwnedProcessesGone"]
    for name in ("release-evidence.json", "phase-closure.json", "postflight.json",
                 "result/process-closure.json", "result/completion.json", "result/gameplay/evidence.json"):
        inputs[str(negative / name)] = digest(negative / name)
for name in ("native-contracts.log", "character-creation.log", "character-catalog.log"):
    inputs[str(previous / "result" / name)] = digest(previous / "result" / name)
files = {}
for path in sorted(playable.rglob("*")):
    if "__pycache__" in path.parts:
        continue
    assert not path.is_symlink(), "Playable symlink: " + str(path)
    if path.is_file():
        files[str(path.relative_to(playable))] = digest(path)
assert files["crawl"] == old["binaries"]["crawl"]
runtime = Path("/private/tmp/dcss-oozle-" + target.name)
assert not runtime.exists()
binding = {**old, "output": str(target / "result"), "inputs": inputs,
    "reusePlayable": str(playable), "nativeProof": str(proof),
    "immutableTree": str(playable), "immutableFiles": files,
    "runtime": str(runtime), "gameplayTest": str(frozen / "oozle-gameplay-native.cjs"),
    "preparedAt": datetime.now(timezone.utc).isoformat()}
if overrides:
    binding["playableOverrides"] = overrides
    binding["runtimeFiles"] = {**files, **{name: digest(Path(path)) for name, path in overrides.items()}}
write(target / "binding.json", binding)
request = {"owner": old["owner"], "status": "ready_waiting_explicit_fair_handoff",
    "preparedAt": binding["preparedAt"], "requestId": digest(target / "binding.json"),
    "bindingPath": str(target / "binding.json"),
    "bindingSha256": digest(target / "binding.json"),
    "command": [old["python"], str(frozen / "run_native_acceptance.py"), str(target / "binding.json")],
    "scope": ["One native browser with two authenticated owners: cancel/5-turn whole-bundle assimilation, armor AC, weapon wear/dissolution/FIFO/unarmed, save/resume and independent peer movement during work"],
    "compile": False, "rerunNativeTests": False, "reusedNativeProof": str(proof),
    "nativeCases": 30, "nativeAssertions": 466, "legalStarts": 35,
    "browserInstances": 1, "browserContexts": 2, "maximumPhaseSeconds": 380,
    "boundInputCount": len(inputs), "immutablePlayableFiles": len(files),
    "change": "Retain canonical armor fixture and wait for native inventory equip acknowledgement before wear read. Preserve original mechanics assertions; add measured full-card panel/slot-width assertion for observed cramped UI. Stage an own playable copy during the assigned phase, apply only frozen overrides, verify original and runtime immutable files after complete teardown. No native source, binary or catalog changes.",
    "previousNegativePreserved": str(negative / "result/completion.json"),
    "closure": "All descendants across sessions and gate group must be gone, followed by explicit reservation release. No automatic retry."}
write(target / "request.json", request)
ready_path = docs / "ready-phase.json"
ready = json.loads(ready_path.read_text())
ready.update(status=request["status"], requestPath=str(target / "request.json"),
             requestSha256=digest(target / "request.json"), requestId=request["requestId"],
             noNativeResultsClaimed=False, firstPhase=request["scope"][0],
             nativeAcceptance={"passed": True, "cases": 30, "assertions": 466,
                               "legalStarts": 35, "proof": str(proof)})
write(ready_path, ready)
print(json.dumps({**request, "requestSha256": digest(target / "request.json")}, indent=2))
