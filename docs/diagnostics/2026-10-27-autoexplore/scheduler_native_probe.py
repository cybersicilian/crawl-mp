"""Exercise actual server scheduling and native safety in an isolated game."""
import argparse
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace


def load_helper(path):
    spec = importlib.util.spec_from_file_location('completion_probe', path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


async def run(args):
    sys.path.insert(0, str(args.backend))
    from tornado.ioloop import PeriodicCallback
    from webtiles.activity_pump import ActivityPump
    from webtiles.party_control import PartyControl
    from webtiles.player_stream import PlayerStreams
    from webtiles.process_handler import CrawlProcessHandlerBase
    from webtiles.tile_presence import TilePresence
    from webtiles import config

    native = load_helper(args.helper)
    report = dict(passed=False, source=str(args.source), backend=str(args.backend),
        native_sha256=hashlib.sha256((args.source / 'crawl').read_bytes()).hexdigest(),
        existing_saves_used=False, steps=[], completions=[], stop_checks=[])
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dcss-sched-', dir='/tmp') as scratch:
        launch_process = SimpleNamespace(username='Probe',
            game_params=config.GameConfig(dict(id='probe', crawl_binary=str(args.source / 'crawl'),
                options=[]), use_template=False), config_path=lambda key: scratch,
            account_restricted=lambda: False)
        call = CrawlProcessHandlerBase._base_call(launch_process)
        defaults = tuple(call[index + 1] for index, value in enumerate(call[:-1])
                         if value == '-extra-opt-first')
        report['launch_defaults'] = defaults
        probe = native.NativeProbe(args.source, Path(scratch), players=2,
                                   launch=native.NativeLaunch(defaults=defaults))
        clients = [SimpleNamespace(username=name, id=slot,
            append_message=lambda *a: None, send_message=lambda *a, **k: None)
            for slot, name in enumerate(('Probe', 'Peer'))]
        control = PartyControl('Probe', {'Probe': 0, 'Peer': 1})
        streams = PlayerStreams(control, TilePresence())
        pump = None

        def send(slot, cancel=False):
            fields = dict(player_id=slot, activity_id=pump.request_id)
            if cancel:
                probe.send('party_activity', action='cancel', **fields)
            else:
                probe.send('party_activity_step', **fields)
            report['steps'].append(dict(slot=slot, cancel=cancel,
                request=pump.request_id, time=time.monotonic()))
            return True

        connected = set()
        pump = ActivityPump(control, streams, lambda: connected, send)
        game = SimpleNamespace(party_control=control, player_streams=streams,
            activity_pump=pump, _receivers=clients, ai_party=None)

        def receive(packet):
            if packet.get('msg') != 'party_packet':
                return
            payload = packet.get('payload', {})
            if payload.get('msg') == 'party_activity_ready' and packet.get('view') is not True:
                report['completions'].append(dict(request=payload['activity_id'],
                    time=time.monotonic()))
            CrawlProcessHandlerBase.handle_process_message(game, json.dumps(packet), False)

        probe.packet_callback = receive
        timer = PeriodicCallback(pump.tick, ActivityPump.tick_interval_ms)

        async def until(predicate, seconds=10):
            deadline = time.monotonic() + seconds
            while time.monotonic() < deadline:
                probe.poll(0)
                if predicate():
                    return True
                assert probe.process.poll() is None, 'Native process exited'
                await asyncio.sleep(.001)
            return False

        async def manual(slot, key):
            assert await until(lambda: not pump.inflight and streams.native_ready), 'Manual readiness'
            request = pump.start_manual(slot)
            probe.send('key', keycode=ord(key), player_id=slot, activity_id=request)
            assert await until(lambda: any(c['request'] == request for c in report['completions'])), 'Manual completion'

        try:
            assert await until(lambda: len(control.views) == 2 and streams.native_ready, 60), 'Startup'
            assert not control.views[0].get('enemy_initiative'), 'Safe fixture start'
            await manual(0, 'o')
            await manual(1, 'o')
            connected.update({0, 1})
            timer.start()
            started = time.monotonic()
            assert await until(lambda: len(report['steps']) >= 8, 15), 'Auto-explore did not advance'
            # Cancellation is processed at the next proven native boundary.
            cancelled_at = time.monotonic()
            pump.cancel(0)
            assert await until(lambda: any(s['cancel'] and s['slot'] == 0 for s in report['steps'])), 'Stop dispatch'
            assert await until(lambda: not next(m for m in control.views[0]['members']
                if m['slot'] == 0).get('activity')), 'Stop state'
            stop_index = next(i for i, s in enumerate(report['steps']) if s['cancel'] and s['slot'] == 0)
            stopped_turn = probe.turns()[0]
            settled_at = time.monotonic() + .2
            await until(lambda: time.monotonic() >= settled_at)
            # An already projected intent may produce a harmless rejected step;
            # cancellation must prevent any further action by this character.
            assert probe.turns()[0] == stopped_turn, 'A stopped hero spent another turn'
            report['stop_checks'].append(dict(slot=0, native_activity_cleared=True,
                no_turn_after_stop=True,
                dispatch_ms=(report['steps'][stop_index]['time'] - cancelled_at) * 1000))
            # The other owner retains their own automation and native safety.
            await until(lambda: len(report['steps']) >= 15 or not pump.inflight, 8)
            connected.clear()
            timer.stop()
            assert await until(lambda: not pump.inflight), 'Last native completion'
            report['elapsed_seconds'] = time.monotonic() - started
            completed = {c['request']: c['time'] for c in report['completions']}
            gaps = [(s['time'] - completed[s['request'] - 1]) * 1000 for s in report['steps']
                    if s['request'] - 1 in completed and not s['cancel']]
            report['completion_to_next_step_ms'] = gaps
            report['automatic_steps'] = sum(not s['cancel'] for s in report['steps'])
            report['passed'] = True
        finally:
            timer.stop()
            probe.close()
            report['owned_native_exited'] = probe.process.poll() is not None
            (args.output / 'terminal.txt').write_bytes(probe.terminal)
            (args.output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('passed', 'automatic_steps',
        'completion_to_next_step_ms', 'stop_checks', 'owned_native_exited') if k in report}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'backend', 'helper', 'output'):
        parser.add_argument(name, type=Path)
    asyncio.run(run(parser.parse_args()))
