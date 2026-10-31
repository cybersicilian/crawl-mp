"""Exercise the exact production-based scheduler with its existing contracts."""
import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from tornado.ioloop import PeriodicCallback

parser = argparse.ArgumentParser()
parser.add_argument('candidate', type=Path)
parser.add_argument('tests', type=Path)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('webtiles.activity_pump', args.candidate)
candidate = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = candidate
spec.loader.exec_module(candidate)
test_spec = importlib.util.spec_from_file_location('activity_contracts', args.tests)
tests = importlib.util.module_from_spec(test_spec)
test_spec.loader.exec_module(tests)
names = [
    'test_four_players_take_round_robin_steps_across_floors',
    'test_one_in_flight_and_native_prompt_blocks_automation',
    'test_recovering_downed_disconnected_and_completed_tasks_are_skipped',
    'test_solo_and_failed_delivery_do_not_consume_readiness',
    'test_manual_buffer_is_ordered_bounded_and_cancellable',
    'test_independent_queued_manual_action_does_not_wait_for_animation',
    'test_safe_exploration_has_no_presentation_wait_for_idle_regional_peers',
    'test_combat_or_unknown_safety_keeps_pacing_and_native_recovery_still_gates',
    'test_disconnected_queued_actions_are_discarded',
    'test_peer_activity_never_substitutes_for_own_native_intent',
    'test_old_command_packets_cannot_acknowledge_a_new_step',
    'test_exact_completion_restores_readiness_without_an_input_mode_packet',
    'test_local_noops_do_not_strand_later_buffered_input',
]
result = unittest.TextTestRunner(verbosity=1).run(unittest.TestSuite(
    tests.ActivityPumpTest(name) for name in names))
assert result.wasSuccessful()


async def cadence(interval):
    dispatched = []
    control = SimpleNamespace(multiplayer=True, views={})
    streams = SimpleNamespace(native_ready=True)
    for slot in range(4):
        control.views[slot] = dict(members=[dict(slot=slot, activity='explore', alive=True, can_act=True)])
    loop = asyncio.get_running_loop()

    def send(slot):
        assert not pump.inflight, 'At most one command may be in flight'
        dispatched.append(slot)
        request = pump.request_id
        loop.call_later(.02, lambda: pump.command_boundary(request))
        loop.call_later(.005, pump.tick)  # Busy polling cannot acquire another owner.
        return True

    pump = candidate.ActivityPump(control, streams, lambda: {0, 1, 2, 3}, send)
    timer = PeriodicCallback(pump.tick, interval)
    timer.start()
    try:
        await asyncio.sleep(.52)
    finally:
        timer.stop()
    await asyncio.sleep(.025)
    assert dispatched == [i % 4 for i in range(len(dispatched))]
    assert not pump.inflight
    return dispatched


async def compare():
    before = await cadence(150)
    after = await cadence(candidate.ActivityPump.tick_interval_ms)
    assert len(after) >= len(before) * 2
    return dict(before_ticks=len(before), after_ticks=len(after),
                interval_ms=candidate.ActivityPump.tick_interval_ms,
                fair_rotation=True, native_ack_required=True)


print(json.dumps(dict(passed=True, exact_candidate_contract_tests=len(names),
                     controlled_timer=asyncio.run(compare()), native_engine_test=False)))
