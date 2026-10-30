"""Compile generated key switches against the real enum declarations in TAG34/35.

This checks the serialization contract, not the complete game executable.
"""
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def enumeration(file, name):
    text = (ROOT / file).read_text()
    return re.search(r'enum ' + name + r'\s*\{[\s\S]*?\};', text)[0]


def main():
    declarations = '\n'.join(enumeration(file, name) for file, name in [
        ('duration-type.h', 'duration_type'), ('status.h', 'status_type'),
        ('bane-type.h', 'bane_type'), ('mon-info.h', 'monster_info_flags')])
    headers = '\n'.join(re.sub(r'^#(?:include|pragma).*\n', '', (ROOT / name).read_text(), flags=re.M)
                        for name in ('web-effect-keys.h', 'web-bane-keys.h', 'web-monster-effect-keys.h'))
    checks = []
    for function, section in [('web_effect_key', headers.split('inline const char* web_bane_key')[0]),
                              ('web_bane_key', headers.split('inline const char* web_bane_key')[1].split('inline const char* web_monster_effect_key')[0]),
                              ('web_monster_effect_key', headers.split('inline const char* web_monster_effect_key')[1])]:
        for line in section.splitlines():
            if line.startswith(('#if ', '#else', '#endif')):
                checks.append(line)
            match = re.match(r'\s*case (.+?): return "([^"]+)";', line)
            if match:
                checks.append(f'assert(std::strcmp({function}({match[1]}), "{match[2]}") == 0);')
    source = '#include <cassert>\n#include <cstring>\n' + declarations + '\n' + headers
    source += '\nint main() {\n' + '\n'.join(checks) + '\nassert(!*web_effect_key(-1));\n}\n'
    with tempfile.TemporaryDirectory(prefix='dcss-effect-keys-') as directory:
        path = Path(directory) / 'keys.cc'
        path.write_text(source)
        for tag in (34, 35):
            binary = Path(directory) / f'keys-{tag}'
            subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++14', f'-DTAG_MAJOR_VERSION={tag}', str(path), '-o', str(binary)], check=True)
            subprocess.run([str(binary)], check=True)
    print('Generated effect key switches compile and round-trip real TAG34 and TAG35 enum identities.')


if __name__ == '__main__':
    main()
