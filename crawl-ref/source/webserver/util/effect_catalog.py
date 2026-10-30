"""Native effect identities and aliases, including save compatibility entries."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def title(key):
    return key.split('_', 1)[1].replace('_', ' ').title()


def durations():
    source = (ROOT / 'duration-data.h').read_text()
    matches = list(re.finditer(r'\{\s*(DUR_[A-Z_0-9]+),', source))
    result = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        header = re.match(r'\s*(?://[^\n]*\n\s*)?([A-Z_0-9]+),\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"',
                          source[match.end():end])
        if not header:
            raise ValueError('Unparsed duration: ' + match[1])
        result.append({'key': match[1], 'name': header[3] or header[2] or header[4] or title(match[1]),
                       'aliases': list(dict.fromkeys(filter(None, [header[2], header[3], header[4]]))),
                       'kind': 'duration'})
    native = set(re.findall(r'^\s*(DUR_\w+)\b', (ROOT / 'duration-type.h').read_text(), re.M))
    if native != {row['key'] for row in result}:
        raise ValueError('Duration enum and duration declarations differ')
    return result


def catalogue():
    result = durations()
    source = (ROOT / 'status.cc').read_text()
    keys = re.findall(r'^\s+(STATUS_\w+)(?:\s*=\s*NUM_DURATIONS\s*\+\s*1)?,',
                      (ROOT / 'status.h').read_text(), re.M)
    for key in keys:
        blocks = []
        for match in re.finditer(r'case ' + key + r':', source):
            block = source[match.end():]
            end = re.search(r'\n\s*case (?:STATUS|DUR)_|\n\s*default:', block)
            blocks.append(block[:end.start() if end else 0])
        aliases = re.findall(r'inf\.(?:light_text|short_text)\s*=\s*"([^"]+)"', '\n'.join(blocks))
        result.append({'key': key, 'name': title(key), 'aliases': list(dict.fromkeys(aliases)), 'kind': 'status'})
    for match in re.finditer(r'\{\s*(BANE_\w+),\s*(?:BANE_DUR_\w+|0),\s*"([^"]+)"',
                             (ROOT / 'bane-data.h').read_text()):
        name = 'Bane of ' + match[2]
        result.append({'key': match[1], 'name': name, 'aliases': [name], 'kind': 'bane'})
    for match in re.finditer(r'\{\s*(MB_\w+),\s*"([^"]*)",\s*"([^"]*)",\s*"([^"]*)"',
                             (ROOT / 'mon-info-flag-name.h').read_text()):
        result.append({'key': match[1], 'name': match[2] or match[3],
                       'aliases': list(dict.fromkeys(filter(None, [match[2], match[3], match[4]]))),
                       'kind': 'monster'})
    result.extend([{'key': 'MON_AIM_IMPAIRED', 'name': 'Aim impaired', 'aliases': ['aim impaired'], 'kind': 'monster'},
                   {'key': 'MON_MEMORIES', 'name': 'Memories', 'aliases': ['memories'], 'kind': 'monster'}])
    if len({row['key'] for row in result}) != len(result):
        raise ValueError('Duplicate native effect identity')
    return result
