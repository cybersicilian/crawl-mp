"""Declarative native preferences and conservative, read-only RC import."""
import copy
import json
import re
from functools import lru_cache
from pathlib import Path

SCHEMA = json.loads((Path(__file__).parents[1] / 'static/game-settings.json').read_text())
FIELDS = {field['id']: field for field in SCHEMA['fields']}
ALIASES = {alias: key for key, field in FIELDS.items() for alias in field.get('aliases', [])}
DEFAULT_FILES = ('autopickup_exceptions', 'runrest_messages', 'standard_colours',
                 'menu_colours', 'glyph_colours', 'messages', 'misc', 'consumable_shortcuts')


def validate_value(key, value):
    field = FIELDS[key]
    kind = field['type']
    if kind == 'boolean':
        valid = type(value) is bool
    elif kind == 'number':
        valid = (type(value) in (int, float) and field['min'] <= value <= field['max']
                 and (field['step'] != 1 or value == int(value)))
    elif kind == 'list':
        valid = (isinstance(value, list) and len(value) <= 200 and
                 all(isinstance(item, str) and 0 < len(item) <= 512 and
                     not re.search(r'[\x00-\x1f,]', item) for item in value))
        if valid and 'options' in field:
            valid = all(item in field['options'] for item in value)
    else:
        valid = (isinstance(value, str) and len(value) <= 512 and
                 not re.search(r'[\x00-\x1f]', value))
        if valid and kind == 'choice':
            valid = value in field['options']
        if valid and field.get('pattern'):
            valid = re.fullmatch(field['pattern'], value) is not None
    if not valid:
        raise ValueError('Choose a valid value for %s.' % field['label'])
    return copy.deepcopy(value)


def validate_changes(changes):
    if not isinstance(changes, dict) or not changes or set(changes) - FIELDS.keys():
        raise ValueError('Choose supported game settings.')
    return {key: None if value is None else validate_value(key, value)
            for key, value in changes.items()}


def decode(key, raw):
    field = FIELDS[key]
    if field['type'] == 'boolean':
        lowered = raw.lower()
        if lowered not in ('true', 'false', 'yes', 'no', '1', '0'):
            raise ValueError('Not a boolean')
        value = lowered in ('true', 'yes', '1')
    elif field['type'] == 'number':
        value = float(raw)
        if value.is_integer():
            value = int(value)
    elif field['type'] == 'list':
        aliases = field.get('valueAliases', {})
        value = [aliases.get(item.strip().lower(), item.strip())
                 for item in raw.split(',') if item.strip()]
    else:
        value = raw
        if field['type'] == 'choice':
            value = value.lower()
        if key == 'show_god_gift':
            value = {'yes': 'true', 'no': 'false', 'unidentified': 'unident',
                     'unid': 'unident'}.get(value, value)
    return validate_value(key, value)


def read_values(text, initial):
    """Never execute includes/Lua or mistake conditional lines for static values."""
    values, customized, uncertain = copy.deepcopy(initial), set(), set()
    aliases = dict(ALIASES)
    script = None
    conditional = False
    for line in text.splitlines():
        line = line.strip()
        if script:
            if (script == 'lua' and line in ('}', '}Lua')) or (
                    script == 'condition' and (line.endswith('>') or line == '>L')):
                script = None
            continue
        if not line or line.startswith('#'):
            continue
        if line.startswith(('Lua{', '{')):
            uncertain.update(FIELDS)
            if not line.endswith('}'):
                script = 'lua'
            continue
        if line.startswith((':', '<', 'L<')):
            uncertain.update(FIELDS)
            conditional = True
            if line.startswith(('<', 'L<')) and not line.endswith('>'):
                script = 'condition'
            continue
        if conditional:
            continue
        match = re.fullmatch(r'([\w.]+)\s*(:=|[+^\-]?=)\s*(.*)', line)
        if not match:
            continue
        name, operator, raw = match.groups()
        name = name.lower()
        if operator == ':=':
            aliases[name] = aliases.get(raw.lower(), raw.lower())
            continue
        key = aliases.get(name, name)
        if key == 'include':
            uncertain.update(FIELDS)
        targets = {'view_lock': ['view_lock_x', 'view_lock_y'],
                   'scroll_margin': ['scroll_margin_x', 'scroll_margin_y']}.get(key, [key])
        for target in targets:
            if target not in FIELDS:
                continue
            try:
                value = decode(target, raw)
                if operator != '=':
                    if FIELDS[target]['type'] != 'list':
                        raise ValueError('Not a list')
                    old = values[target]
                    if operator == '+=':
                        value = old + [item for item in value if item not in old]
                    elif operator == '^=':
                        value = value + [item for item in old if item not in value]
                    else:
                        value = [item for item in old if item not in value]
                values[target] = value
                customized.add(target)
                uncertain.discard(target)
            except (ValueError, OverflowError):
                uncertain.add(target)
    return values, customized, uncertain


@lru_cache(maxsize=1)
def defaults():
    values = {key: copy.deepcopy(field['default']) for key, field in FIELDS.items()}
    directory = Path(__file__).parents[2] / 'dat/defaults'
    for name in DEFAULT_FILES:
        values = read_values((directory / (name + '.txt')).read_text(), values)[0]
    return values


def launch_values(call):
    base = copy.deepcopy(defaults())
    locked = {}
    for index, arg in enumerate(call[:-1]):
        if arg not in ('-extra-opt-first', '-extra-opt-last'):
            continue
        parsed, changed, _ = read_values(call[index + 1], base)
        if arg == '-extra-opt-first':
            base.update({key: parsed[key] for key in changed})
        else:
            locked.update({key: parsed[key] for key in changed})
    return base, locked


def encode(key, value):
    validate_value(key, value)
    if isinstance(value, bool):
        raw = 'true' if value else 'false'
    elif isinstance(value, list):
        raw = ', '.join(value)
    else:
        raw = str(value)
    return key + ' = ' + raw
