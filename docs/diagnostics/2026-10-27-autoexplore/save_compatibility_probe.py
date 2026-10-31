"""Round-trip one disposable expedition between baseline and optimized engines."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import sys
import tempfile


def run(args):
    spec = importlib.util.spec_from_file_location('completion_probe', args.helper)
    native = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = native
    spec.loader.exec_module(native)
    report = dict(passed=False, existing_saves_used=False, stages=[])
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='dcss-save-perf-', dir='/tmp') as temporary:
        previous, expected = None, [0, 0]
        for index, source in enumerate((args.baseline, args.candidate, args.baseline)):
            root = Path(temporary) / str(index)
            root.mkdir()
            probe = native.NativeProbe(source, root, players=2, restore_from=previous)
            try:
                assert probe.until(lambda: probe.mode == 1 and len(probe.party) == 2, 60), 'Load'
                assert probe.turns() == expected, ('Restored turns', probe.turns(), expected)
                for offset in range(4):
                    slot = offset % 2
                    expected[slot] += 1
                    request = offset + 1
                    probe.send('key', keycode=46, player_id=slot, activity_id=request)
                    assert probe.until(lambda: request in probe.ready_tokens
                        and probe.turns() == expected, 10), 'Restored owner action'
                probe.process.send_signal(signal.SIGHUP)
                assert probe.until(lambda: probe.process.poll() is not None, 15), 'Saved exit'
                packages = list(root.rglob('*.cs'))
                assert packages, 'No native save package'
                report['stages'].append(dict(native_sha256=hashlib.sha256(
                    (source / 'crawl').read_bytes()).hexdigest(), turns=list(expected),
                    native_packages=len(packages), saved=True, restored=index > 0))
                previous = root
            finally:
                probe.close()
                (args.output / ('terminal-' + str(index) + '.txt')).write_bytes(probe.terminal)
        report['passed'] = True
    (args.output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('baseline', 'candidate', 'helper', 'output'):
        parser.add_argument(name, type=Path)
    run(parser.parse_args())
