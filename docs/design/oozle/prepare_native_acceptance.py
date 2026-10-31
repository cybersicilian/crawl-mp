"""Pin a completed compatible native build for the Oozle acceptance handoff.

This only reads inputs and writes a request. It never reserves or launches work.
"""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--completion", type=Path, required=True)
    parser.add_argument("--build", type=Path, required=True)
    args = parser.parse_args()
    docs = Path(__file__).resolve().parent
    root = docs.parents[2]
    readiness = docs / "ready-phase.json"
    ready = json.loads(readiness.read_text())
    prepared_path = Path(ready["requestPath"])
    assert digest(prepared_path) == ready["requestSha256"]
    prepared = json.loads(prepared_path.read_text())
    complete = json.loads(args.completion.read_text())
    assert any(row["name"] == "build" and row["exitCode"] == 0 for row in complete["results"])
    producer_binding = Path(complete["binding"])
    assert digest(producer_binding) == complete["bindingSha256"], "Producer binding changed"
    assert json.loads(producer_binding.read_text())["requestId"] == complete["requestId"]
    build = args.build.resolve()
    assert Path(complete["build"]).resolve() == build
    for name in ("crawl", "catch2-tests-executable"):
        identity = next(row for row in complete["results"] if row["name"] == name + "-identity")
        assert digest(build / name) == identity["sha256"], "Producer binary changed"

    # Producer source must contain the current native feature, not just an old
    # executable with the same name. Ignore web/test-only preparation changes.
    scoped = json.loads((docs / "mechanics-source-inputs.json").read_text())["inputs"]
    native_equivalence = {}
    for name in scoped:
        path = Path(name)
        if not path.is_relative_to("crawl-ref/source"):
            continue
        relative = path.relative_to("crawl-ref/source")
        if "webserver" not in relative.parts and path.suffix in (".cc", ".h", ".yaml"):
            live_hash, built_hash = digest(root / path), digest(build / relative)
            assert live_hash == built_hash, "Native Oozle drift: " + str(relative)
            native_equivalence[str(relative)] = {"liveSourceSha256": live_hash,
                                               "producerSourceSha256": built_hash}

    output = Path(prepared["output"])
    assert not output.exists(), "Use a fresh request after any launched attempt"
    inputs = dict(prepared["frozenInputs"])
    inputs[str(args.completion.resolve())] = digest(args.completion)
    inputs[str(producer_binding)] = digest(producer_binding)
    for name, proof in native_equivalence.items():
        inputs[str(build / name)] = proof["producerSourceSha256"]
    for folder in ("webserver", "dat", "rltiles"):
        for path in sorted((build / folder).rglob("*")):
            if path.is_file():
                inputs[str(path)] = digest(path)
    for name in ("mutation-data.h", "spl-data.h", "tilepick-p.cc"):
        inputs[str(build / name)] = digest(build / name)
    frozen = prepared_path.parent / "inputs"
    runtime = Path("/private/tmp") / ("dcss-oozle-" + prepared_path.parent.name)
    assert not runtime.exists(), "QA runtime must be new"
    binding = {"owner": prepared["owner"], "build": str(build), "output": str(output),
        "inputs": inputs, "binaries": {name: digest(build / name)
            for name in ("crawl", "catch2-tests-executable")},
        "python": str(root / ".venv/bin/python"),
        "node": "/Users/iancaltabiano/.nvm/versions/node/v24.14.1/bin/node",
        "nodeModules": "/Users/iancaltabiano/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules",
        "characterTest": str(frozen / "oozle-native.py"),
        "gameplayTest": str(frozen / "oozle-gameplay-native.cjs"),
        "runtime": str(runtime), "port": prepared["port"],
        "qaServerOverride": prepared.get("qaServerOverride"),
        "nativeInputEquivalence": native_equivalence,
        "capacityObserved": {"loadAverage": os.getloadavg(), "logicalCpus": os.cpu_count()},
        "preparedAt": datetime.now(timezone.utc).isoformat()}
    final_binding = prepared_path.parent / "binding.json"
    write(final_binding, binding)
    request = {**prepared, "status": "ready_waiting_explicit_fair_handoff",
        "prerequisiteRequestId": complete["requestId"],
        "bindingPath": str(final_binding), "bindingSha256": digest(final_binding),
        "requestId": digest(final_binding),
        "command": [binding["python"], prepared["runner"], str(final_binding)],
        "producerCompletion": str(args.completion.resolve()),
        "producerCompletionSha256": digest(args.completion),
        "build": str(build), "boundInputCount": len(inputs),
        "nativeInputCount": len(native_equivalence)}
    final_request = prepared_path.parent / "request.json"
    write(final_request, request)
    ready.update(status=request["status"], requestPath=str(final_request),
                 requestSha256=digest(final_request), requestId=request["requestId"],
                 prerequisiteRequestId=complete["requestId"])
    write(readiness, ready)
    print(json.dumps(ready, indent=2))


if __name__ == "__main__":
    main()
