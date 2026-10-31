"""Compare native per-floor populations against declared progression peers."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from statistics import mean, median, quantiles


def group(records):
    floors=defaultdict(list)
    for record in records:
        floors[record['place']].append(record)
    return floors


def references(floors):
    peers={}
    for depth in range(1,5):
        values=[r['xp'] for b in ['Snake','Spider'] for r in floors[f'{b}:{depth}']]
        peers[f'Bur:{depth}']=mean(values)
    peers['Hive:1']=peers['Bur:3']
    peers['Hive:2']=peers['Bur:4']
    late=mean([r['xp'] for d in [14,15] for r in floors[f'D:{d}']])
    depths=mean([r['xp'] for r in floors['Depths:1']])
    for depth in range(1,5):
        peers[f'Worm:{depth}']=late+(depths-late)*(depth-1)/3
    return peers


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('before',type=Path)
    parser.add_argument('after',type=Path)
    parser.add_argument('output',type=Path)
    parser.add_argument('--control-xp-changes',type=Path)
    args=parser.parse_args()
    before,after=[json.loads(p.read_text()) for p in [args.before,args.after]]
    assert len(before)==len(after)==300
    previous,current=group(before),group(after)
    declared=json.loads(args.control_xp_changes.read_text()) if args.control_xp_changes else []
    xp_changes={(r['place'],r['seed']):r for r in declared}
    assert len(xp_changes)==len(declared)
    observed=set()
    for place in current:
        assert len(current[place])==12
        if place.startswith(('Snake:','Spider:','D:','Depths:')):
            old={r['seed']:r for r in previous[place]}
            for r in current[place]:
                for key in ['xp','monsters','items','gold','artefacts','roster','classes','vaults']:
                    if key=='xp' and r[key]!=old[r['seed']][key]:
                        change=xp_changes[(place,r['seed'])]
                        assert (old[r['seed']]['xp'],r['xp'])==(change['before'],change['after'])
                        assert r['roster'].get(change['species'])==change['count']
                        observed.add((place,r['seed']))
                    else:
                        assert r[key]==old[r['seed']][key],(place,r['seed'],key)
    assert observed==set(xp_changes),'Unused declared control XP changes'
    targets=references(current)
    results=[]
    for place,target in targets.items():
        rows=current[place];xp=[r['xp'] for r in rows]
        q1,_,q3=quantiles(xp,n=4)
        value=mean(xp)
        results.append(dict(place=place,before=mean(r['xp'] for r in previous[place]),
            mean=value,median=median(xp),q1=q1,q3=q3,target=target,ratio=value/target,
            within25Percent=abs(value/target-1)<=.25,
            monsters=mean(r['monsters'] for r in rows),
            items=mean(r['items'] for r in rows),gold=mean(r['gold'] for r in rows),
            honey=mean(r.get('honey',0) for r in rows)))
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'economy-comparison.json').write_text(json.dumps(results,indent=2)+'\n')
    lines=['| Floor | Before XP | Tuned XP | Peer target | Difference | Items |',
           '|---|---:|---:|---:|---:|---:|']
    for row in results:
        lines.append('| {place} | {before:,.0f} | {mean:,.0f} | {target:,.0f} | {delta:+.0%} | {items:.1f} |'.format(
            **row,delta=row['ratio']-1))
    (args.output/'economy-table.md').write_text('\n'.join(lines)+'\n')
    print('\n'.join(lines))
    print('Per-floor mean parity:',sum(r['within25Percent'] for r in results),'/ 10')


if __name__=='__main__':
    main()
