"""Compare old/new transports on the same disposable three-owner native run."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace

from webtiles.map_snapshot import MapSnapshot
from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.tile_presence import TilePresence

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
SOURCE = Path('/private/tmp/dcss-prompt-ownership-01a17b3b/source')


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


completion = load('native_completion', ROOT / 'crawl-ref/source/webserver/tests/native-command-completion.py')
before = load('previous_player_stream', OUT / 'before/player_stream.py')


def transport(stream_type):
    clients, players, maps, trace = [], {}, {}, {}
    totals = dict(bytes=0, packets=0, player_bytes=0, maps=0)
    for slot, name in enumerate(('Probe', 'Peer', 'Third')):
        players[slot], maps[slot], trace[slot] = {}, MapSnapshot(), []

        def append(message, send, slot=slot):
            packet = json.loads(message)
            totals['bytes'] += len(message.encode())
            totals['packets'] += 1
            if packet['msg'] == 'player':
                trace[slot].append(packet)
                totals['player_bytes'] += len(message.encode())
                state = players[slot]
                inventory = state.setdefault('inv', {})
                for key, item in packet.get('inv', {}).items():
                    inventory.setdefault(key, {}).update(item)
                state.update({key: value for key, value in packet.items() if key != 'inv'})
            elif packet['msg'] == 'map':
                totals['maps'] += 1
                maps[slot].update(packet, packet['floor'])

        clients.append(SimpleNamespace(username=name, id=slot, append_message=append,
                                       send_message=lambda *args, **kwargs: None))
    control = PartyControl('Probe', {client.username: slot for slot, client in enumerate(clients)})
    return SimpleNamespace(streams=stream_type(control, TilePresence()), clients=clients,
                           players=players, maps=maps, trace=trace, totals=totals)


def run():
    old, new = transport(before.PlayerStreams), transport(PlayerStreams)
    report = dict(passed=False, existing_saves_used=False, native_source=str(SOURCE), actions=0)
    with tempfile.TemporaryDirectory(prefix='dcss-perf-', dir='/tmp') as temporary:
        probe = completion.NativeProbe(SOURCE, Path(temporary), players=3)

        def receive(packet):
            if packet.get('msg') == 'party_packet':
                for target in (old, new):
                    target.streams.ingest(packet, target.clients, False)
                assert new.players == old.players, 'Player state differs after native projection'

        probe.packet_callback = receive
        try:
            assert probe.until(lambda: probe.mode == 1 and len(probe.party) == 3, 40), 'Native startup'
            assert not probe.party[0].get('enemy_initiative'), 'Fixture requires a safe start'
            for request in range(1, 25):
                slot = (request - 1) % 3
                turns = probe.turns()
                probe.send('key', keycode=46, player_id=slot, activity_id=request)
                assert probe.until(lambda: request in probe.ready_tokens
                                   and probe.turns()[slot] == turns[slot] + 1, 8), 'Native turn completion'
                report['actions'] += 1
            # The receiver states must match despite suppressing no-op maps.
            for slot in range(3):
                assert new.maps[slot].cells == old.maps[slot].cells, ('Map differs', slot)
                meaningful = lambda mapping: {key: value for key, value in mapping.items()
                    if key not in {'view_seq', 'view_work', 'clear'}}
                assert meaningful(new.maps[slot].metadata) == meaningful(old.maps[slot].metadata)
                reconnect = SimpleNamespace(username=new.clients[slot].username, id=90 + slot,
                    append_message=lambda *args: None, send_message=lambda *args, **kwargs: None)
                new.streams.restore(reconnect)
                assert reconnect.personal_packets['player'][1] == new.players[slot]
            report.update(passed=True, before=old.totals, after=new.totals,
                          native_sha256=completion.hashlib.sha256((SOURCE / 'crawl').read_bytes()).hexdigest())
            (OUT / 'native-player-trace.json').write_text(json.dumps(dict(before=old.trace, after=new.trace)))
        finally:
            probe.close()
            report['native_process_exited'] = probe.process.poll() is not None
            (OUT / 'native-result.json').write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report), flush=True)


if __name__ == '__main__':
    run()
