"""Check friendly-fire rules across disposable native party saves and reloads.

Run through the shared heavy gate. Optionally provide an older engine to create
real saves that predate the persisted rule and verify launch-setting fallback.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from helpers.native_party_fixture import NativePartyFixture, completion


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def launch(name, enabled):
    return completion.NativeLaunch(
        name=name,
        party=(name + ":Human/Conjurer", "Peer:Human/Conjurer"),
        rc_options=("party_friendly_fire = " + ("true" if enabled else "false"),))


def start(engine, root, config, previous=None):
    root.mkdir()
    probe = completion.NativeProbe(engine, root, launch=config, restore_from=previous)
    try:
        assert probe.until(lambda: probe.mode == 1 and len(probe.party) == 2, 40), "Party startup"
    except BaseException:
        diagnostic(probe)
        probe.close()
        raise
    return probe


def diagnostic(probe):
    (probe.root / "terminal.log").write_bytes(probe.terminal)
    (probe.root / "packets.json").write_text(json.dumps(probe.packets))


def state(probe, expected):
    assert probe.until(lambda: probe.party.get(0, {}).get("friendly_fire") == expected, 10), (
        "Wrong friendly-fire rule", probe.party.get(0))


def make_save(engine, root, config, desired):
    probe = start(engine, root, config)
    try:
        state(probe, not desired)
        probe.send("toggle_friendly_fire")
        state(probe, desired)
        fixture = NativePartyFixture(probe, {})
        # record_save itself does not select its player_id; select the other
        # hero with a no-op first so this actually covers a non-leader save.
        fixture.command(1, keycode=0)
        fixture.save(exit=True, slot=1)
        assert list((root / "saves").rglob("*.cs")), "Missing native save"
    except BaseException:
        diagnostic(probe)
        raise
    finally:
        probe.close()


def check_restore(engine, root, saved, config, expected):
    probe = start(engine, root, config, saved)
    try:
        state(probe, expected)
    except BaseException:
        diagnostic(probe)
        raise
    finally:
        probe.close()


def verify(engine, old_engine, root):
    try:
        for name, desired in (("SafeParty", False), ("ClassicParty", True)):
            # A runtime toggle must override the initial rc and be saved even
            # when the save is requested from the other party member.
            config = launch(name, not desired)
            save = root / (name + "-save")
            make_save(engine, save, config, desired)
            check_restore(engine, root / (name + "-restore"), save, config, desired)
        if old_engine:
            for desired in (False, True):
                name = "Legacy" + ("Classic" if desired else "Safe")
                config = launch(name, not desired)
                save = root / (name + "-save")
                make_save(old_engine, save, config, desired)
                # Old saves have no rule. The current launch rc must win.
                check_restore(engine, root / (name + "-restore"), save, config, not desired)
    except BaseException:
        # Keep disposable saves, rc files and native diagnostics for inspection.
        raise
    else:
        shutil.rmtree(root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--old-engine", type=Path)
    args = parser.parse_args()
    engine = args.engine.resolve()
    old_engine = args.old_engine.resolve() if args.old_engine else None
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    files = [Path(__file__).resolve(), Path(__file__).parent / "helpers/native_party_fixture.py",
             Path(__file__).parent / "native-command-completion.py", engine / "crawl"]
    files += [p for p in (engine / "dat").rglob("*") if p.is_file()]
    if old_engine:
        files += [old_engine / "crawl"] + [p for p in (old_engine / "dat").rglob("*") if p.is_file()]
    source = {str(p.resolve()): digest(p) for p in files}
    (output / "binding.json").write_text(json.dumps(dict(source=source, resources=dict(
        native_games=8 if old_engine else 4, simultaneous_native_games=1,
        browsers=0, builds=0, existing_saves_used=False)), indent=2) + "\n")
    # UNIX socket paths must stay short even when the report directory is deep.
    scratch = Path(tempfile.mkdtemp(prefix="dcss-ff-save-", dir="/tmp"))
    report = dict(passed=False, legacy_checked=bool(old_engine),
                  failure_evidence=str(scratch))
    try:
        verify(engine, old_engine, scratch)
        report["passed"] = True
        report["failure_evidence"] = None
    finally:
        report["source_unchanged"] = source == {str(p.resolve()): digest(p) for p in files}
        report["passed"] = report["passed"] and report["source_unchanged"]
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    raise SystemExit(0 if report["passed"] else 1)
