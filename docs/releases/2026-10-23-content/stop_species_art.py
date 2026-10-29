"""Close only the identified private build to correct inherited icon texture."""
from pathlib import Path
import json
import os
import signal
import time

ROOT = Path('/opt/dcss/staging/content-01a16a0f-v1')
SOURCE = ROOT / 'crawl-ref/source'
GROUP = 318690
WRAPPER = b'/tmp/dcss-species-art-01a16a0f/linux_species_art.py'
assert Path('/proc/318691/cmdline').read_bytes().split(b'\0')[:-1] == [b'python3', WRAPPER]
assert Path('/proc/318690/cmdline').read_bytes().split(b'\0')[:-1] == [b'sudo', b'-n', b'python3', WRAPPER]
assert os.getpgid(318691) == GROUP and os.getpgrp() != GROUP

def members():
    result = {}
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            pid = int(path.name)
            if os.getpgid(pid) == GROUP:
                stat = (path/'stat').read_text().rsplit(')',1)[1].split()
                result[pid] = {'parent':int(stat[1]), 'command':(path/'cmdline').read_bytes().split(b'\0')[:-1]}
        except (OSError, ProcessLookupError):
            pass
    return result

before = members()
descendants = {GROUP}
while True:
    updated = descendants | {pid for pid,row in before.items() if row['parent'] in descendants}
    if updated == descendants:
        break
    descendants = updated
assert set(before) <= descendants
outputs = set()
for row in before.values():
    args = [s.decode() for s in row['command']]
    if '-o' in args:
        name = args[args.index('-o')+1]
        if name.endswith('.o'):
            path = SOURCE/name
            assert path.resolve().is_relative_to(SOURCE)
            outputs.update([path,path.with_suffix('.d')])
os.killpg(GROUP,signal.SIGTERM)
for _ in range(200):
    if not members():
        break
    time.sleep(0.1)
assert not members()
saved = []
for path in outputs:
    if path.exists():
        target=ROOT/'species-art/interrupted-objects'/path.relative_to(SOURCE)
        target.parent.mkdir(parents=True,exist_ok=True)
        path.rename(target)
        saved.append(str(target))
receipt={'all_owned_processes_gone':True,'process_group':GROUP,'reason':
    'Source review caught disabled-fg texture inherited by appended ability icons; reset texture before final build.',
    'interrupted_object_outputs_preserved':saved,'production_mutated':False,'closed_at':time.time()}
(ROOT/'species-art/stop.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
