"""Checkpoint and restore a party distributed across native floors."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

from helpers.native_party_fixture import NativePartyFixture, completion
from webtiles.map_snapshot import MapSnapshot

MEMBER_FIELDS = ("slot", "name", "species", "job", "place", "pos", "hp", "hp_max", "mp", "mp_max",
                 "turns", "alive", "ghost_haunting", "aut_clock", "region_id", "region_aut_clock",
                 "last_action_aut", "zot_clock")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capture(fixture, players):
    probe, members, floors, maps = fixture.probe, [], {}, []
    for slot in range(players):
        packet = fixture.project(slot)
        state = probe.party[slot]
        own = next(member for member in state["members"] if member["slot"] == slot)
        member = {key: own.get(key) for key in MEMBER_FIELDS}
        member["inventory"] = [{key: item.get(key) for key in ("slot", "name", "qty")}
                               for item in own.get("inventory", [])]
        members.append(member)
        floors[state["floor"]] = {key: state.get(key) for key in ("floor_time", "world_aut_clock")}
        snapshot = MapSnapshot()
        snapshot.update(packet, state["floor"])
        cells = []
        for (x, y), cell in sorted(snapshot.cells.items()):
            if not cell.get("f"):
                continue
            bg = cell.get("t", {}).get("bg", 0)
            low = bg[0] if isinstance(bg, list) else bg
            cells.append([x, y, cell["f"], low & 0x60000, cell.get("item_name", "")])
        maps.append(cells)
    return dict(members=members, floors=floors, maps=maps,
                global_time=max(state["global_time"] for state in probe.party.values()))


def difference(before, after):
    changes = []
    for key in before:
        if before[key] == after[key]:
            continue
        if key == "maps":
            for slot, (old, new) in enumerate(zip(before[key], after[key])):
                if old != new:
                    old_cells = {(c[0], c[1]): c[2:] for c in old}
                    new_cells = {(c[0], c[1]): c[2:] for c in new}
                    changed = [list(pos) for pos in sorted(old_cells.keys() | new_cells.keys())
                               if old_cells.get(pos) != new_cells.get(pos)]
                    changes.append(dict(field="map", slot=slot, cells_before=len(old), cells_after=len(new),
                                        changed_count=len(changed), examples=changed[:12]))
        else:
            changes.append(dict(field=key, before=before[key], after=after[key]))
    return changes


def verify(engine, output, players, evidence, fixture_checkpoint=None, expected=None):
    launch = completion.NativeLaunch()
    if players == 4:
        launch = completion.NativeLaunch(party=launch.party + ("TokenFourth:Human/Conjurer",),
                                         accounts=launch.accounts + ("Fourth",))
    with tempfile.TemporaryDirectory(prefix="dcss-distributed-checkpoint-", dir="/tmp") as temporary:
        root = Path(temporary)
        if fixture_checkpoint is not None:
            saved_root = fixture_checkpoint
            saved = json.loads(expected.read_text())
            evidence.update(fixture_checkpoint_reused=True, saved_floors=sorted(saved["floors"]))
            (output / "before.json").write_text(json.dumps(saved, indent=2) + "\n")
        else:
            saved_root = root / "before"
            saved_root.mkdir()
            probe = completion.NativeProbe(engine, saved_root, players=players, launch=launch)
            try:
                assert probe.until(lambda: probe.mode == 1 and len(probe.party) == players, 40), "Party startup"
                fixture = NativePartyFixture(probe, evidence)
                fixture.split_floors(players)
                saved = capture(fixture, players)
                assert len(saved["floors"]) == players - 1, "Distributed fixture floors"
                evidence["saved_floors"] = sorted(saved["floors"])
                (output / "before.json").write_text(json.dumps(saved, indent=2) + "\n")
                # The final view belongs to the remote hero. Host saving must select
                # and checkpoint the right floor without changing personal state.
                fixture.save()
                after_checkpoint = capture(fixture, players)
                evidence["checkpoint_differences"] = difference(saved, after_checkpoint)
                assert not evidence["checkpoint_differences"], "Non-exiting checkpoint changed party state"
                fixture.save(exit=True)
                assert list((saved_root / "saves").rglob("*.cs")), "Missing native checkpoint"
                for name in ("saves", "library"):
                    shutil.copytree(saved_root / name, output / "checkpoint" / name)
                if (saved_root / "record.json").exists():
                    shutil.copy2(saved_root / "record.json", output / "checkpoint/record.json")
                evidence["normal_save_exit"] = True
            finally:
                (output / "before-terminal.log").write_bytes(probe.terminal)
                (output / "before-native.json").write_text(json.dumps(probe.packets))
                probe.close()
                evidence["native_closeouts"].append(dict(pid=probe.process.pid,
                    exited=probe.process.poll() is not None, exit_code=probe.process.returncode))
        restored_root = root / "after"
        restored_root.mkdir()
        probe = completion.NativeProbe(engine, restored_root, players=players, launch=launch,
                                        restore_from=saved_root)
        try:
            assert probe.until(lambda: probe.mode == 1 and probe.party.get(0, {}).get("player_count") == players, 40), "Restored startup"
            fixture = NativePartyFixture(probe, evidence)
            # A fresh process has no old command token. Establish a proven no-op
            # fence before making pure view requests; it must spend no turn.
            fixture.command(0, keycode=0)
            restored = capture(fixture, players)
            (output / "after.json").write_text(json.dumps(restored, indent=2) + "\n")
            evidence["restore_differences"] = difference(saved, restored)
            assert not evidence["restore_differences"], "Distributed checkpoint restore changed party state"
            turns = [member["turns"] for member in restored["members"]]
            fixture.command(2, keycode=46)
            # Completion can precede the next rendered party packet. Request
            # fresh personal projections before inspecting post-action state.
            after_action = capture(fixture, players)
            assert [member["turns"] for member in after_action["members"]] == [
                turn + int(slot == 2) for slot, turn in enumerate(turns)], "Wrong hero acted after restore"
            assert after_action["floors"]["D:1"] == restored["floors"]["D:1"], "Remote action advanced idle floor"
            evidence.update(passed=True, personal_state_preserved=True, personal_maps_preserved=True,
                            floor_clocks_preserved=True, remote_action_after_restore=True,
                            idle_floor_unchanged=True)
        finally:
            evidence["restore_mode"] = probe.mode
            evidence["restore_party_count"] = len(probe.party)
            (output / "after-terminal.log").write_bytes(probe.terminal)
            (output / "after-native.json").write_text(json.dumps(probe.packets))
            probe.close()
            evidence["native_closeouts"].append(dict(pid=probe.process.pid,
                exited=probe.process.poll() is not None, exit_code=probe.process.returncode))
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("engine", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--players", type=int, choices=(3, 4), default=3)
    parser.add_argument("--fixture-checkpoint", type=Path)
    parser.add_argument("--expected", type=Path)
    args = parser.parse_args()
    assert bool(args.fixture_checkpoint) == bool(args.expected), "Checkpoint replay requires its captured expected state"
    engine, output = args.engine.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    scripts = [Path(__file__).resolve(), Path(__file__).with_name("helpers") / "native_party_fixture.py",
               Path(__file__).with_name("native-command-completion.py")]
    scripts.append(Path(__file__).resolve().parents[1] / "webtiles/map_snapshot.py")
    files = [path.resolve() for path in scripts] + [engine / "crawl"]
    files += [path for path in (engine / "dat").rglob("*") if path.is_file()]
    if args.fixture_checkpoint:
        files += [path for path in args.fixture_checkpoint.resolve().rglob("*") if path.is_file()]
        files.append(args.expected.resolve())
    source = {str(path): digest(path) for path in files}
    (output / "binding.json").write_text(json.dumps(dict(engine=str(engine), source=source,
        resources=dict(native_games=1 if args.fixture_checkpoint else 2, simultaneous_native_games=1, browsers=0, builds=0,
                       existing_saves_used=False)), indent=2) + "\n")
    evidence = dict(passed=False, players=args.players, existing_saves_used=False, native_closeouts=[])
    try:
        verify(engine, output, args.players, evidence,
               args.fixture_checkpoint.resolve() if args.fixture_checkpoint else None,
               args.expected.resolve() if args.expected else None)
    finally:
        evidence["source_unchanged"] = source == {str(path): digest(path) for path in files}
        evidence["engine_sha256"] = digest(engine / "crawl")
        evidence["owned_process_exited"] = bool(evidence.get("native_closeouts")) and all(
            item["exited"] for item in evidence.get("native_closeouts", []))
        evidence["passed"] = evidence["passed"] and evidence["source_unchanged"] and evidence["owned_process_exited"]
        (output / "report.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence))
    raise SystemExit(0 if evidence["passed"] else 1)
