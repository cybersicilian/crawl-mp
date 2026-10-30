"""A personal projection must preserve an unloaded floor's encounter partition."""
import argparse
import json
from pathlib import Path
import tempfile

from helpers.native_party_fixture import NativePartyFixture, completion

def verify(source, output, expect_bug=False, players=3):
    evidence = dict(passed=False, expect_bug=expect_bug, players=players, existing_saves_used=False,
                    more_acknowledgements=0)
    with tempfile.TemporaryDirectory(prefix="dcss-floor-projection-", dir="/tmp") as temporary:
        launch = completion.NativeLaunch()
        if players == 4:
            launch = completion.NativeLaunch(party=launch.party + ("TokenFourth:Human/Conjurer",),
                                              accounts=launch.accounts + ("Fourth",))
        probe = completion.NativeProbe(source, Path(temporary), players=players, launch=launch)
        fixture = NativePartyFixture(probe, evidence)
        lua, project = fixture.lua, fixture.project

        def regions(slot):
            return [(member["slot"], member["region_id"], member["region_aut_clock"], member["aut_clock"])
                    for member in probe.party[slot]["members"] if member["slot"] in (0, 1)]

        def rng_count(label):
            start = len(probe.packets)
            prefix = "PROJECTION_RNG_" + label + "_"
            lua(0, "crawl.mpr('" + prefix + "'..debug.get_rng_state():match('states:%s*(%d+)'))")
            values = fixture.message_fragments(start)
            return next(int(value[len(prefix):]) for value in values if value.startswith(prefix))

        try:
            assert probe.until(lambda: len(probe.party) == players and probe.mode == 1, 40), "Party startup"
            fixture.split_floors(players)
            before = regions(0)
            assert before[0][1] != before[1][1], ("Fixture did not separate D:1 encounters", before)
            project(2)
            after = regions(2)
            evidence.update(before=before, after=after, idle_floor="D:1", viewed_floor="D:2",
                            unloaded_partition_changed=before != after)
            if expect_bug:
                assert before != after, "The suspected observation side effect was not reproduced"
                evidence["bug_reproduced"] = True
            else:
                assert before == after, "Viewing D:2 mutated D:1 encounter state"
                # Refresh every floor after setup actions finish. An unloaded
                # teammate's cached floor_time can predate the last stair cost.
                for slot in range(players):
                    project(slot)
                    assert regions(slot) == before
                rng_before = rng_count("BEFORE")
                rng_control = rng_count("CONTROL")
                evidence.update(rng_before=rng_before, rng_control=rng_control)
                assert rng_control == rng_before, "RNG measurement is not neutral without view requests"
                turns = [member["turns"] for member in probe.party[0]["members"]]
                floor_times = {view["floor"]: view["floor_time"] for view in probe.party.values()}
                global_time = max(view["global_time"] for view in probe.party.values())
                for slot in list(range(players)) + [0, 2, 0]:
                    project(slot)
                    assert regions(slot) == before, "Repeated projection regrouped an idle floor"
                    assert [member["turns"] for member in probe.party[slot]["members"]] == turns
                times_after = {view["floor"]: view["floor_time"] for view in probe.party.values()}
                evidence.update(floor_times_before=floor_times, floor_times_after=times_after)
                assert times_after == floor_times
                assert max(view["global_time"] for view in probe.party.values()) == global_time
                rng_after = rng_count("AFTER")
                evidence["rng_after"] = rng_after
                assert rng_after == rng_control, "View requests consumed gameplay RNG"
                evidence.update(repeated_views_preserved=True, turns_unchanged=True,
                                floor_times_unchanged=True, global_time_unchanged=True, gameplay_rng_unchanged=True)
            evidence["passed"] = True
        finally:
            probe.close()
            evidence["owned_process_exited"] = probe.process.poll() is not None
            output.mkdir(parents=True, exist_ok=True)
            (output / "report.json").write_text(json.dumps(evidence, indent=2) + "\n")
            (output / "terminal.log").write_bytes(probe.terminal)
            (output / "native.json").write_text(json.dumps(probe.packets))
    print(json.dumps(evidence), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expect-bug", action="store_true")
    parser.add_argument("--players", type=int, choices=(3, 4), default=3)
    args = parser.parse_args()
    verify(args.source.resolve(), args.output.resolve(), args.expect_bug, args.players)
