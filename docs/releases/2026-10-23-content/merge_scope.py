"""Merge only bounded content edits onto the hash-verified live source baseline.

Vellum has preserved pre-implementation files. Later species edits outside that
scope are isolated by reversing this task's exact edits, never a dirty-tree diff.
"""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = ROOT / 'crawl-ref/source'
VELLUM = ROOT / 'docs/design/vellum/baseline'
LIVE = HERE / 'live-source'
OUT = HERE / 'merged-source'
BASE = HERE / 'reconstructed-base'
SCOPE = json.loads((HERE / 'scope.json').read_text())
old_vellum = {str(p.relative_to(VELLUM)): p for p in VELLUM.rglob('*')
              if p.is_file() and p.suffix != '.json' and (SOURCE / p.relative_to(VELLUM)).exists()}
texts = {name: (SOURCE / name).read_text() for name in SCOPE if name not in old_vellum}
operations = []


def undo(name, added, original=''):
    if name not in texts:
        return
    assert texts[name].count(added) == 1, (name, added[:100], texts[name].count(added))
    texts[name] = texts[name].replace(added, original)
    operations.append({'file': name, 'added_sha256': hashlib.sha256(added.encode()).hexdigest(),
                       'original_sha256': hashlib.sha256(original.encode()).hexdigest()})


def captured(filename, function='edit'):
    tree = ast.parse((HERE / 'operation-sources' / filename).read_text())
    class Recorder(ast.NodeTransformer):
        def visit_FunctionDef(self, node):
            if node.name == function:
                args = [x.arg for x in node.args.args]
                assert len(args) == 3
                node.body = ast.parse('ops.append((' + ','.join(args) + '))').body
                return node
            return self.generic_visit(node)
    env = {'ops': []}
    exec(compile(ast.fix_missing_locations(Recorder().visit(tree)), filename, 'exec'), env)
    return env['ops']

# Undo the last credit-attribution integration before earlier captured edits.
undo('mon-death.cc', 'xp_tracking_type xp_tracking, bool ordinary_kill = false)', 'xp_tracking_type xp_tracking)')
undo('mon-death.cc', '    if (exp_gain && ordinary_kill)\n        eldritch::credited_kill();\n')
undo('mon-death.cc', '''            const auto credited = gain_exp(experience);
            if (credited && ordinary_kill)
                eldritch::credited_kill();
            apply_exp();''', '''            gain_exp(experience);
            apply_exp();''')
undo('mon-death.cc', '''    vorr::on_kill(mons, killer, gives_player_xp, pet_kill);''', '''    vorr::on_kill(mons, killer, gives_player_xp, pet_kill);
    eldritch::on_kill(mons, killer, gives_player_xp, pet_kill);''')
undo('mon-death.cc', '''    const bool ordinary_kill = gives_player_xp && !mons.is_summoned()
        && !mons.is_unrewarding() && !party::is_proxy_monster(mons);''')
undo('mon-death.cc', 'was_visible, mons.xp_tracking, ordinary_kill);', 'was_visible, mons.xp_tracking);')
undo('mon-death.cc', '                            mons.xp_tracking, ordinary_kill);', '                            mons.xp_tracking);')

for name, before, after in reversed(captured('dcss-content-review.py')):
    undo(name, after, before)

# Native movement and altar entry, authored after the initial integration.
for name in ('movement.cc', 'god-prayer.cc', 'output.cc'):
    undo(name, '#include "AppHdr.h"\n#include "eldritch.h"', '#include "AppHdr.h"')
name = 'movement.cc'
if name in texts:
    added = 'if (you_worship(GOD_WU_JIAN) || eldritch::has(GOD_WU_JIAN))'
    assert texts[name].count(added) == 3
    texts[name] = texts[name].replace(added, 'if (you_worship(GOD_WU_JIAN))')
undo('god-prayer.cc', '''    if (you.species == SP_ELDRITCH)
    {
        you.turn_is_over = eldritch::profane() == spret::success;
        if (you.turn_is_over)
            you.time_taken = BASELINE_DELAY;
        return;
    }

''')
undo('output.cc', '''        if (you.species == SP_ELDRITCH)
        {
            NOWRAP_EOL_CPRINTF(" D:%d R:%d/3", eldritch::reserve(you), eldritch::rank());
            clear_to_end_of_line();
        }
        else if (you.char_class == JOB_MONK''', '        if (you.char_class == JOB_MONK')
undo('mon-act.cc', '''        if (!_monster_move(mons, mmov))
        {
            chains::strain(*mons);
            mons->speed_increment -= non_move_energy;
        }''', '''        if (!_monster_move(mons, mmov))
            mons->speed_increment -= non_move_energy;''')
undo('bloodcraft-curses.cc', '!bound(*mon) && !chains::held(*mon) && !binding_recovery(*mon)',
     '!bound(*mon) && !binding_recovery(*mon) && !chains::held(*mon)')

# Species presentation and typed snapshot consumers.
name = 'webserver/game_data/static/party-status-model.js'
if name in texts:
    start = texts[name].index('        if (member.species === "Eldritch"')
    end = texts[name].index('        var god = member.god', start)
    undo(name, texts[name][start:end])
undo('webserver/game_data/static/party-faith.js',
     'faith.worships || faith.kind === "defiance" ? "abilities" : "overview"',
     'faith.worships ? "abilities" : "overview"')
undo('webserver/game_data/static/party-inspector-render.js',
     'faith.worships || faith.kind === "defiance" ? " · " + faith.summary : ""',
     'faith.worships ? " · " + faith.summary : ""')
undo('webserver/game_data/static/party-inspector-render.js', '''        if (m.elder_summary || m.chain_summary)
            $bannerLeft.append($("<div class='party-insp-hero-meta'></div>")
                .text(m.elder_summary || m.chain_summary));
''')
name = 'webserver/game_data/static/party-card-status.js'
if name in texts:
    start = texts[name].index('        if (Number.isFinite(hero.defiance))')
    end = texts[name].index('        return $root;', start)
    undo(name, texts[name][start:end])
undo('webserver/game_data/static/dungeon_renderer.js', '"./premium-regions", "./chain-view"],', '"./premium-regions"],')
undo('webserver/game_data/static/dungeon_renderer.js', 'movement, effects, regions, chains) {', 'movement, effects, regions) {')
undo('webserver/game_data/static/dungeon_renderer.js', '    chains.attach(renderer);\n')
undo('webserver/util/generate_character_catalog.py', '''    traits.extend(clean(trait["long"]) for trait in definition.get("fake_mutations", [])
                  if trait.get("long"))
''')
for name, marker in [('dat/descript/species.txt', '%%%%\nChain Devil\n'),
                     ('webserver/tests/party-status.cjs', '\nconst eldritch = model.faith(')]:
    if name in texts:
        undo(name, texts[name][texts[name].index(marker):])
undo('ability.h', '\n// Explicit native voice requirement, independent of current worship.\nbool ability_permits_silence(ability_type ability);\n')

# Restore the original duration table before its declarative append.
name = 'duration-data.h'
if name in texts:
    start = texts[name].index('    { DUR_CHAIN_RECOVERY,')
    end = texts[name].index('#if TAG_MAJOR_VERSION == 34\n    // And removed ones', start)
    undo(name, texts[name][start:end])
undo('duration-type.h', '    DUR_ELDER_HEAL_DRAIN,\n    DUR_ELDER_CHAOS,', '    DUR_ELDER_HEAL_DRAIN,')

for name, before, after in reversed(captured('dcss-content-effects.py')):
    undo(name, after, before)
for name, before, after in reversed(captured('dcss-content-integrate.py', 'change')):
    undo(name, after, before)

# Initial append-only identities and demonic capability.
undo('util/species-gen/species-type-header.txt', '    SP_OOZLE,\n    SP_CHAIN_DEVIL,\n    SP_ELDRITCH,', '    SP_OOZLE,')
undo('duration-type.h', '''    DUR_PALADIN_INTERVENE_COOLDOWN,
    DUR_CHAIN_RECOVERY,
    DUR_ELDER_SHIELD,
    DUR_ELDER_HEROISM,
    DUR_ELDER_ARMOUR,
    DUR_ELDER_UNRAVEL,
    DUR_ELDER_SAP,
    DUR_ELDER_EVO_DRAIN,
    DUR_ELDER_HEAL_DRAIN,''', '    DUR_PALADIN_INTERVENE_COOLDOWN,')
undo('species.h', '    bool is_undead(species_type species);\n    bool is_demonic(species_type species);', '    bool is_undead(species_type species);')
undo('species.cc', '''bool is_demonic(species_type value)
{
    return value == SP_DEMONSPAWN || value == SP_CHAIN_DEVIL;
}
''')
undo('ng-restr.cc', '(species::is_undead(species) || species::is_demonic(species))',
     '(species::is_undead(species) || species == SP_DEMONSPAWN)')
undo('tilepick-p.cc', '''    case SP_DEMONSPAWN:
    case SP_CHAIN_DEVIL:
        return TILEP_BASE_DEMONSPAWN;
    case SP_ELDRITCH:
        return TILEP_BASE_DEMIGOD;''', '''    case SP_DEMONSPAWN:
        return TILEP_BASE_DEMONSPAWN;''')

BASE.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True)
report = {'operations': operations, 'merged': [], 'conflicts': [], 'added': [], 'unchanged': []}
for name in SCOPE:
    ours = (SOURCE / name).read_bytes()
    # The workflow file also has unrelated local quick-cast work. Strip only
    # that unrelated addition from this merge input, retaining it in workspace.
    if name == 'webserver/game_data/static/workflow-actions.js':
        text = ours.decode().replace('function power(member, entry, kind, quickCast)', 'function power(member, entry, kind)')
        text = text.replace('''        if (!unavailable && quickCast && (kind !== "spell" || entry.quick_cast !== true))
            unavailable = "Quick cast is unavailable for this spell. Use manual aiming.";
''', '')
        text = text.replace('''        var fields = { expected_slot: member.slot, id: entry.id,
            letter: kind === "spell" ? entry.letter : entry.hotkey, kind: kind };
        if (quickCast) fields.quick_cast = true;
        comm.send_message("power_action", fields);''', '''        comm.send_message("power_action", { expected_slot: member.slot, id: entry.id,
            letter: kind === "spell" ? entry.letter : entry.hotkey, kind: kind });''')
        ours = text.encode()
    old = old_vellum[name].read_bytes() if name in old_vellum else texts[name].encode()
    old_path = BASE / name
    old_path.parent.mkdir(parents=True, exist_ok=True)
    old_path.write_bytes(old)
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    live = LIVE / name
    if not live.exists():
        target.write_bytes(ours)
        report['added'].append(name)
        continue
    with tempfile.TemporaryDirectory(prefix='dcss-scope-', dir='/private/tmp') as temporary:
        current = Path(temporary) / 'ours'
        current.write_bytes(ours)
        merged = subprocess.run(['git', 'merge-file', '-p', '-L', 'LIVE', '-L', 'OWNED_BASE', '-L', 'CONTENT',
                                  str(live), str(old_path), str(current)], capture_output=True)
        assert merged.returncode in (0, 1), (name, merged.stderr.decode())
        target.write_bytes(merged.stdout)
        report['conflicts' if merged.returncode else 'unchanged' if merged.stdout == live.read_bytes() else 'merged'].append(name)

new_names = []
for pattern in ['actor-displacement.*', 'chain-devil.*', 'eldritch*.cc', 'eldritch.h',
                'god-vellum*.cc', 'god-vellum.h', 'enchantment-transfer.*',
                'catch2-tests/test_vellum*.cc', 'catch2-tests/test_vellum*.h', 'catch2-tests/test_new_species.cc']:
    new_names.extend(str(p.relative_to(SOURCE)) for p in SOURCE.glob(pattern) if p.suffix in ('.cc', '.h'))
new_names += ['dat/species/chain-devil.yaml', 'dat/species/eldritch.yaml', 'webserver/game_data/static/chain-view.js']
for name in sorted(set(new_names) - set(SCOPE)):
    assert name not in json.loads((HERE / 'live-manifest.json').read_text())['files'], name
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((SOURCE / name).read_bytes())
    report['added'].append(name)
(HERE / 'merge-report.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
print(json.dumps({key: report[key] if key == 'conflicts' else len(report[key])
                  for key in ('merged', 'added', 'unchanged', 'conflicts')}))
