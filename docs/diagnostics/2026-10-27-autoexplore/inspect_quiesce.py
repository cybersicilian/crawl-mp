"""Bind each production native process to its existing saved expedition."""
import hashlib
import json
from pathlib import Path
import sqlite3

OPERATION = Path('/opt/dcss/staging/autoexplore-release-01a1801a')
BASE = Path('/opt/dcss/releases/render-smoothness-01a1801a')


def run():
    assert Path('/opt/dcss/current').resolve() == BASE
    with sqlite3.connect('file:/var/lib/dcss/rcs/library/index.sqlite?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        records = [dict(row) for row in db.execute(
            'SELECT id,owner,status,save_dir FROM games WHERE status=?', ('active',))]
    plan = dict(current=str(BASE), processes=[])
    for process in Path('/proc').glob('[0-9]*'):
        try:
            if (process / 'exe').resolve().name != 'crawl':
                continue
            args = (process / 'cmdline').read_bytes().split(b'\0')
            environment = dict(item.split(b'=', 1) for item in
                (process / 'environ').read_bytes().split(b'\0') if b'=' in item)
            path = environment.get(b'CRAWL_RECORD_PATH', b'').decode()
            matches = [record for record in records if record['id'] in path]
            assert len(matches) == 1, 'Native process does not match exactly one active expedition'
            record = matches[0]
            assert hashlib.sha256((process / 'exe').read_bytes()).hexdigest() == '8adcfbcb080e95ee7c3859dd91fd570b26b8bebb6cedbc05c1c004df0fb00a37'
            plan['processes'].append(dict(pid=int(process.name),
                start_ticks=(process / 'stat').read_text().split()[21],
                name=args[args.index(b'-name') + 1].decode(),
                record_id=record['id'], owner=record['owner']))
        except (FileNotFoundError, ProcessLookupError):
            continue
    (OPERATION / 'quiesce-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    print(json.dumps(plan), flush=True)


if __name__ == '__main__':
    run()
