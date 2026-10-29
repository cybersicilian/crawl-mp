"""Measure a frozen engine using disposable native games and real completions."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import statistics
import sys
import tempfile
import time


def load_probe(path):
    spec = importlib.util.spec_from_file_location("completion_probe", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def percentile(values, fraction):
    return sorted(values)[min(len(values) - 1, int(len(values) * fraction))]


def run(source, helper, output, defaults=(), rc_options=()):
    native = load_probe(helper)
    report = dict(source=str(source), native_sha256=hashlib.sha256(
        (source / "crawl").read_bytes()).hexdigest(), existing_saves_used=False,
        commands=[], passed=False)
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="dcss-pace-", dir="/tmp") as temporary:
        launch = native.NativeLaunch(defaults=tuple(defaults), rc_options=tuple(rc_options))
        probe = native.NativeProbe(source, Path(temporary), players=2, launch=launch)
        try:
            began = time.monotonic()
            assert probe.until(lambda: probe.mode == 1 and len(probe.party) == 2, 60), "Startup"
            report["startup_ms"] = (time.monotonic() - began) * 1000
            request = 0

            def command(slot, kind, **fields):
                nonlocal request
                request += 1
                before = probe.turns()
                started = time.monotonic()
                probe.send(kind, player_id=slot, activity_id=request, **fields)
                assert probe.until(lambda: request in probe.ready_tokens, 10), (kind, slot, "completion")
                elapsed = (time.monotonic() - started) * 1000
                report["commands"].append(dict(kind=kind, slot=slot,
                    elapsed_ms=elapsed, before=before, after=probe.turns()))

            for index in range(24):
                command(index % 2, "key", keycode=46)
            for slot in (0, 1):
                command(slot, "key", keycode=ord("o"))
            previous = 1
            for _ in range(80):
                members = probe.party[0]["members"]
                eligible = [m["slot"] for m in members if m.get("activity")
                            and m.get("alive") and m.get("can_act") is not False]
                if not eligible:
                    break
                slot = next((s for s in eligible if s != previous), eligible[0])
                command(slot, "party_activity_step")
                previous = slot
            report["final_members"] = probe.party[0]["members"]
            report["native_delay_messages"] = [p.get("payload", p) for p in probe.packets
                if p.get("payload", p).get("msg") == "delay"]
            for kind in ("key", "party_activity_step"):
                values = [c["elapsed_ms"] for c in report["commands"] if c["kind"] == kind]
                if values:
                    report[kind] = dict(count=len(values), median_ms=statistics.median(values),
                        p95_ms=percentile(values, .95), total_ms=sum(values))
            report["passed"] = True
        finally:
            probe.close()
            report["owned_native_exited"] = probe.process.poll() is not None
            (output / "terminal.txt").write_bytes(probe.terminal)
            (output / "packets.json").write_text(json.dumps(probe.packets))
            (output / "result.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("passed", "native_sha256", "startup_ms",
        "key", "party_activity_step", "owned_native_exited") if key in report}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("helper", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument('--default-option', action='append', default=[])
    parser.add_argument('--rc-option', action='append', default=[])
    args = parser.parse_args()
    run(args.source.resolve(), args.helper.resolve(), args.output.resolve(),
        args.default_option, args.rc_option)
