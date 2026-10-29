"""Run a bound Oozle acceptance phase inside the shared host reservation.

No compilation: consume a completed matching build, then run native contracts,
character creation and one serial two-client gameplay scenario.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen
from phase_processes import ProcessObserver

OWNER = "codex/01a15523-0d2a-7a92-b63a-f7e2469fd2fe"
POLICY = Path.home() / "Documents/Codex/work/host-heavy/policy.json"


def digest(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def verify_tree(binding):
    if not binding.get("immutableTree"):
        return
    root = Path(binding["immutableTree"])
    files = {}
    for path in sorted(root.rglob("*")):
        if "__pycache__" in path.parts:
            continue
        assert not path.is_symlink(), "Unexpected playable symlink: " + str(path)
        if path.is_file():
            files[str(path.relative_to(root))] = digest(path)
    assert files == binding["immutableFiles"], "Playable fileset or bytes changed"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binding", type=Path)
    args = parser.parse_args()
    binding = json.loads(args.binding.read_text())
    output = Path(binding["output"])
    output.mkdir(parents=True, exist_ok=True)
    policy = json.loads(POLICY.read_text())
    gate_state = json.loads((Path(policy["stateDirectory"]) / "state.json").read_text())
    assert gate_state["owner"] == OWNER and gate_state["status"] == "running"
    assert gate_state["requestId"] == digest(args.binding), "Exact binding needs its own reservation"
    assert digest(policy["gateScript"]) == policy["gateSha256"]
    assert not policy.get("resourceHold", {}).get("active")
    build = Path(binding["build"])
    for name, expected in binding["inputs"].items():
        assert digest(name) == expected, "Input changed: " + name
    for name, expected in binding["binaries"].items():
        assert digest(build / name) == expected, "Binary changed: " + name
    verify_tree(binding)
    results = []
    server = None
    server_log = None
    playable = None
    observer = ProcessObserver()

    def run(name, command, timeout, env=None, cwd=None):
        print("START " + name, flush=True)
        log = output / (name + ".log")
        with log.open("w") as stream:
            child = subprocess.Popen(command, cwd=cwd or output, stdout=stream,
                                     stderr=subprocess.STDOUT, env=env)
            until = time.monotonic() + timeout
            while child.poll() is None:
                observer.observe()
                if time.monotonic() > until:
                    child.terminate()
                    try:
                        child.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=10)
                    raise RuntimeError(name + " exceeded its time limit")
                time.sleep(0.2)
            code = child.wait()
        results.append({"name": name, "exitCode": code, "log": str(log)})
        if code:
            raise RuntimeError(name + " failed; inspect " + str(log))
        print("PASS " + name, flush=True)

    started = time.time()
    try:
        if binding.get("reusePlayable"):
            playable = Path(binding["reusePlayable"])
            proof = json.loads(Path(binding["nativeProof"]).read_text())
            assert proof["nativeContracts"]["passed"] and proof["nativeCreationPassed"]
            assert proof["catalogGenerated"] and proof["binarySha256"] == binding["binaries"]
            results.append({"name": "unchanged-native-creation-catalog-proof", "exitCode": 0,
                            "proof": binding["nativeProof"]})
            if binding.get("playableOverrides"):
                original = playable
                playable = output / "playable"
                shutil.copytree(original, playable, ignore=shutil.ignore_patterns("__pycache__"))
                for name, source in binding["playableOverrides"].items():
                    target = playable / name
                    assert target.resolve().is_relative_to(playable.resolve())
                    shutil.copy2(source, target)
                verify_tree({"immutableTree": str(playable), "immutableFiles": binding["runtimeFiles"]})
        else:
            run("native-contracts", [str(build / "catch2-tests-executable"),
                                    "[oozle],[cooperative-delay]"], 180)
            run("character-creation", [binding["python"], binding["characterTest"],
                                       "--binary", str(build / "crawl")], 180)
            # Generate choices in an owned copy, preserving the producer.
            playable = output / "playable"
            playable.mkdir(exist_ok=False)
            for folder in ("webserver", "dat", "rltiles"):
                shutil.copytree(build / folder, playable / folder)
            for name in ("crawl", "mutation-data.h", "spl-data.h", "tilepick-p.cc"):
                shutil.copy2(build / name, playable / name)
            if binding.get("qaServerOverride"):
                shutil.copy2(binding["qaServerOverride"], playable / "webserver/util/qa_server.py")
            run("character-catalog", [binding["python"],
                str(playable / "webserver/util/generate_character_catalog.py"),
                "--binary", str(playable / "crawl")], 120)
        server_log = (output / "server.log").open("w")
        command = [binding["python"], str(playable / "webserver/util/qa_server.py"),
                   "--source", str(playable), "--build", str(playable),
                   "--runtime", binding["runtime"], "--port", str(binding["port"])]
        server = subprocess.Popen(command, stdout=server_log, stderr=subprocess.STDOUT,
                                  start_new_session=True)
        write(output / "server-process.json", {"pid": server.pid, "pgid": server.pid,
              "command": command, "startedAt": time.time()})
        address = "http://127.0.0.1:" + str(binding["port"])
        for _ in range(100):
            observer.observe()
            if server.poll() is not None:
                raise RuntimeError("QA server exited during startup")
            try:
                with urlopen(address, timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("QA server did not become ready")
        env = dict(os.environ, WEBTILES_URL=address,
                   OOZLE_PROOF_DIR=str(output / "gameplay"), NODE_PATH=binding["nodeModules"])
        run("two-client-gameplay", [binding["node"], binding["gameplayTest"]], 300, env, playable)
        for name, expected in binding["inputs"].items():
            assert digest(name) == expected, "Postflight input changed: " + name
        verify_tree(binding)
    except BaseException as error:
        results.append({"name": "phase", "exitCode": 1, "error": str(error)})
        print(str(error), flush=True)
    finally:
        if server is not None:
            observer.observe()
            if server.poll() is None:
                server.terminate()
            try:
                server.wait(timeout=15)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=10)
        closure = observer.close()
        write(output / "process-closure.json", closure)
        try:
            for name, expected in binding["inputs"].items():
                assert digest(name) == expected, "Post-teardown input changed: " + name
            verify_tree(binding)
            if binding.get("playableOverrides") and playable and playable.exists():
                verify_tree({"immutableTree": str(playable), "immutableFiles": binding["runtimeFiles"]})
            results.append({"name": "post-teardown-input-integrity", "exitCode": 0})
        except BaseException as error:
            results.append({"name": "post-teardown-input-integrity", "exitCode": 1, "error": str(error)})
        if server_log:
            server_log.close()
        report = {"owner": OWNER, "binding": str(args.binding),
                  "bindingSha256": digest(args.binding), "startedAt": started,
                  "finishedAt": time.time(), "results": results,
                  "allOwnedProcessesGone": closure["allOwnedProcessesGone"],
                  "passed": closure["allOwnedProcessesGone"] and bool(results)
                  and all(result["exitCode"] == 0 for result in results)}
        write(output / "completion.json", report)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
