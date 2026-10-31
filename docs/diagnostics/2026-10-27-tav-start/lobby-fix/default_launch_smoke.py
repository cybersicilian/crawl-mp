import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time

spec = importlib.util.spec_from_file_location('native_commands',
    Path('/tmp/dcss-tav-lobby-fix-01a17f43-r3/native-command-completion.py'))
native = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = native
spec.loader.exec_module(native)
with tempfile.TemporaryDirectory(prefix='tav-default-contract-', dir='/tmp') as scratch:
    probe = native.NativeProbe(Path(sys.argv[1]), Path(scratch))
    try:
        assert probe.until(lambda: probe.mode == 1 and bool(probe.party), 45)
        members = probe.party[0]['members']
        assert [member['name'] for member in members] == ['TokenProbe', 'TokenPeer']
        assert all(member['species'] == 'Human' for member in members)
        assert all(not any('acquirement' in item['name'] for item in member['inventory']) for member in members)
        probe.send('record_save', exit=True)
        deadline = time.monotonic() + 15
        while probe.process.poll() is None and time.monotonic() < deadline:
            probe.poll()
        assert probe.process.poll() == 0
    finally:
        probe.close()
Path(sys.argv[2]).write_text(json.dumps({'passed': True, 'default_launch_preserved': True,
                                      'normal_save_and_exit': True}) + '\n')
