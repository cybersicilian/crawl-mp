"""Explicit resolutions retaining live fixes and excluding unrelated local UI work."""
import hashlib
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE / 'merged-source'
report = json.loads((HERE / 'merge-report.json').read_text())
resolutions = []
for name in report['conflicts']:
    path = ROOT / name
    text = path.read_text()
    def resolve(match):
        live, content = match.group(1), match.group(2)
        if name == 'attack.cc':
            assert 'weapon_corrosion_penalty' in live and 'effective_item_enchantment' in content
            value = '    return effective_item_enchantment(*weapon)\n        - (stat_source().is_player() ? oozle::weapon_corrosion_penalty(*weapon) : 0);\n'
        elif name.endswith('dungeon_renderer.js'):
            assert 'hero-feedback' not in live and 'chain-view' in content
            value = live.replace('"./premium-regions"],', '"./premium-regions", "./chain-view"],')
            value = value.replace('movement, effects, regions) {', 'movement, effects, regions, chains) {')
        elif '#include' in content:
            # Live removed the unused co-op adapter, but retains Oozle fixes.
            lines = list(dict.fromkeys((live + content).splitlines()))
            value = '\n'.join(line for line in lines if '"coop-content.h"' not in line) + '\n'
        elif name == 'mon-death.cc':
            assert not live.strip() and 'const bool ordinary_kill' in content
            value = content
        else:
            raise ValueError((name, live, content))
        resolutions.append({'file': name, 'live': live, 'content': content, 'result': value})
        return value
    text, count = re.subn(r'^<<<<<<< LIVE\n(.*?)^=======\n(.*?)^>>>>>>> CONTENT\n', resolve, text, flags=re.M|re.S)
    assert count and '<<<<<<<' not in text
    path.write_text(text)

# Quick casting is unrelated pending work and its native helper is not live.
p = ROOT / 'tileweb.cc'
s = p.read_text()
s = s.replace('        const JsonNode* quick = json_find_member(obj.node, "quick_cast");\n', '')
s = s.replace('            && (!quick || quick->tag == JSON_BOOL)\n', '')
s = s.replace('''                    if (quick && quick->bool_)
                    {
                        if (quiver::can_quick_cast(spell))
                            quiver::spell_to_action(spell)->trigger();
                        else
                            action_error("This spell requires manual aiming.");
                    }
                    else
                        cast_a_spell(true, spell);''', '                    cast_a_spell(true, spell);')
s = s.replace('string(kind->string_) == "ability" && (!quick || !quick->bool_)', 'string(kind->string_) == "ability"')
s = s.replace('                json_write_bool("quick_cast", quiver::can_quick_cast(sp));\n', '')
assert 'quick_cast' not in s and 'quick->' not in s
p.write_text(s)
for p in ROOT.rglob('*'):
    if p.is_file() and p.suffix in {'.cc', '.h', '.js', '.py'}:
        content = p.read_text()
        assert '<<<<<<< LIVE' not in content, str(p)
        if p.suffix == '.js':
            assert len(content.splitlines()) <= 600, str(p)
manifest = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(ROOT.rglob('*')) if p.is_file()}
(HERE / 'resolution-report.json').write_text(json.dumps(resolutions, indent=2) + '\n')
(HERE / 'overlay-manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
print('Resolved', len(resolutions), 'conflicts; froze', len(manifest), 'scoped overlay files.')
