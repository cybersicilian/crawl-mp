"""Bounded four-seat transport workload; timings are not hosted FPS/latency."""
import copy
import importlib.util
import json
from pathlib import Path
import statistics
import time
from types import SimpleNamespace

from webtiles.party_control import PartyControl
from webtiles.player_stream import PlayerStreams
from webtiles.state_transport import StateEncoder
from webtiles.tile_presence import TilePresence

OUT = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


old_stream = load('old_stream', OUT / 'before/player_stream.py')
old_state = load('old_state', OUT / 'before/state_transport.py')
names = ['Host', 'Guest', 'Third', 'Fourth']
inventory = {str(slot): dict(name='Item ' + str(slot), quantity=2,
    description='Known native item information. ' * 40, tile=dict(x=3, y=4)) for slot in range(52)}
players = [dict(msg='player', name=name, hp=40, hp_max=40, mp=10, mp_max=10,
    time=0, time_last_input=0, pos=dict(x=10 + slot * 12, y=20), inv=inventory)
    for slot, name in enumerate(names)]
workload = []
for turn in range(80):
    slot = turn % 4
    player = copy.deepcopy(players[slot])
    player.update(time=turn * 10, time_last_input=(turn - 1) * 10)
    player['pos']['x'] += turn // 4
    workload.append(dict(slot=slot, floor='D:1', view=True, payload=player))
    for idle in range(4):
        workload.append(dict(slot=idle, floor='D:1', view=True, payload=dict(msg='map',
            view_seq=turn + 2, view_work=dict(los=289, cells=400, sent=0), cells=[],
            vgrdc=copy.deepcopy(players[idle]['pos']), player_on_level=True)))
members = [dict(slot=slot, hp=40, inventory=list(copy.deepcopy(inventory).values())) for slot in range(4)]
states = []
for turn in range(80):
    state = dict(msg='party_state', members=copy.deepcopy(members), world_aut_clock=turn * 10)
    state['members'][-1]['hp'] = 40 - turn % 10
    states.append(state)


def stream_run(kind):
    metrics = dict(bytes=0, packets=0, inventory_packets=0, map_packets=0)

    def append(message, send):
        metrics['bytes'] += len(message.encode())
        metrics['packets'] += 1
        metrics['inventory_packets'] += '"msg":"player"' in message and '"inv":' in message
        metrics['map_packets'] += '"msg":"map"' in message

    clients = [SimpleNamespace(username=name, id=slot, append_message=append,
        send_message=lambda *args, **kwargs: None) for slot, name in enumerate(names)]
    streams = kind(PartyControl('Host', dict(zip(names, range(4)))), TilePresence())
    for envelope in workload:
        streams.ingest(envelope, clients, False)
    return metrics


def encoder_run(kind):
    encoder = kind('party_state')
    packets = [encoder.frame(state) for state in states]
    return dict(bytes=sum(len(packet.encode()) for packet in packets), packets=len(packets))


def compare(before, after):
    samples = {'before': [], 'after': []}
    result = {}
    # Alternate order to reduce warm-up and changing host-load bias.
    for repetition in range(3):
        for name, run in ([('before', before), ('after', after)] if repetition % 2 == 0
                          else [('after', after), ('before', before)]):
            start = time.perf_counter()
            result[name] = run()
            samples[name].append((time.perf_counter() - start) * 1000)
    for name in samples:
        result[name]['elapsed_ms'] = samples[name]
        result[name]['median_ms'] = statistics.median(samples[name])
    return result


result = dict(four_seat_transport=compare(lambda: stream_run(old_stream.PlayerStreams),
                                        lambda: stream_run(PlayerStreams)),
              party_encoder=compare(lambda: encoder_run(old_state.StateEncoder),
                                    lambda: encoder_run(StateEncoder)),
              scope='Synthetic local CPU/wire work only; no hosted latency or FPS claim')
assert result['four_seat_transport']['after']['bytes'] < result['four_seat_transport']['before']['bytes'] / 4
assert result['four_seat_transport']['after']['inventory_packets'] == 4
assert result['four_seat_transport']['after']['map_packets'] == 4
(OUT / 'benchmark.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result), flush=True)
