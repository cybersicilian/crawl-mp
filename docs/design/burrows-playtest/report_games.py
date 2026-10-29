"""Summarise retained native outcomes without counting crashes as deaths."""
import json
from pathlib import Path
import re
import sys


def summarise(path):
    result=json.loads(path.read_text())
    last=result['audits'][-1] if result['audits'] else {}
    outcome='reached Depths:1' if result['completed'] else 'died' if result['death'] else last.get('tag','no telemetry')
    if result['exitCode']!=0:
        outcome='harness/native failure (exit '+str(result['exitCode'])+')'
    actions={}
    for morgue in path.parent.glob('morgue-*.txt'):
        text=morgue.read_text()
        section=text.split('Action ',1)[-1].split('Table legend:',1)[0]
        for name in ['Heal wounds','Curing','Haste','Might','Fear','Blinking','Magic','Heroism','Finesse','Bombard']:
            for line in section.splitlines():
                if re.search(r'\b'+name+r'\s*\|',line):
                    actions[name]=int(line.rsplit('||',1)[1].strip())
    return dict(series=path.parents[2].name,build=result['build'],seed=result['seed'],
        start=result.get('start','Bur:1'),outcome=outcome,place=last.get('where',''),
        turn=last.get('turn',0),xl=last.get('xl',0),
        explored=sorted({a['where'] for a in result['audits'] if a['tag']=='explored'}),
        fullRoute=result.get('fullRoute',False),actions=actions,
        nativeSha256=result['nativeSha256'],source=str(path))


def main():
    output=Path(sys.argv[1]);rows=[]
    for folder in map(Path,sys.argv[2:]):
        paths=sorted(folder.glob('*/result.json'))
        assert paths,folder
        rows.extend(summarise(p) for p in paths)
    output.write_text(json.dumps(rows,indent=2)+'\n')
    print('| Series | Build | Outcome | Place | XL | Explored floors |')
    print('|---|---|---|---|---:|---:|')
    for r in rows:
        print('| {series} | {build} | {outcome} | {place} | {xl} | {n} |'.format(**r,n=len(r['explored'])))


if __name__=='__main__':
    main()
