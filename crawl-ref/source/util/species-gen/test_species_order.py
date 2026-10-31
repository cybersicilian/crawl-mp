#!/usr/bin/env python3
"""Check generated species and aptitude order for both supported save layouts."""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]


def active_lines(text, version):
    active = [True]
    for line in text.splitlines():
        stripped = line.strip()
        match = re.fullmatch(r'#if TAG_MAJOR_VERSION (==|!=) (\d+)', stripped)
        if match:
            same = version == int(match.group(2))
            active.append(active[-1] and (same if match.group(1) == '==' else not same))
        elif stripped.startswith('#if '):
            active.append(active[-1])
        elif stripped == '#endif':
            active.pop()
        elif active[-1]:
            yield line


with tempfile.TemporaryDirectory(prefix='species-order-') as temp:
    target = Path(temp)
    outputs = [target / name for name in ('species-data.h', 'aptitudes.h',
                                          'species-groups.h', 'species-type.h')]
    subprocess.run([sys.executable, str(root / 'util/species-gen.py'),
                    str(root / 'dat/species'), str(root / 'util/species-gen'),
                    *map(str, outputs)], check=True)
    for version in (34, 35):
        enum = []
        for line in active_lines(outputs[3].read_text(), version):
            match = re.match(r'\s*(SP_[A-Z_]+),', line)
            if match:
                enum.append(match.group(1))
        aptitude = []
        for line in active_lines(outputs[1].read_text(), version):
            match = re.match(r'\s*\{(SP_[A-Z_]+),\s*SK_FIGHTING,', line)
            if match:
                aptitude.append(match.group(1))
        assert enum == aptitude, f'TAG {version}: species and aptitude order differ'
        assert enum.count('SP_HIGH_ELF') == 1, f'TAG {version}: High Elf duplicated'
        expected = 1 if version == 34 else enum.index('SP_ENT') + 1
        assert enum.index('SP_HIGH_ELF') == expected, f'TAG {version}: wrong High Elf save ID'
    for version in (34, 35):
        (target / 'tag-version.h').write_text(f'#define TAG_MAJOR_VERSION {version}\n')
        docs = target / f'aptitudes-{version}.txt'
        subprocess.run(['perl', str(root / 'util/gen-apt.pl'), str(docs),
                        str(root.parent / 'docs/template/apt-tmpl.txt'),
                        str(outputs[0]), str(outputs[1])], check=True)
        ogre = next(line for line in docs.read_text().splitlines()
                    if line.startswith('Two Headed Ogre'))
        assert '+30%' in ogre, f'TAG {version}: two-headed ogre HP modifier missing'
print('Species and aptitude order match for legacy and modern save versions.')
