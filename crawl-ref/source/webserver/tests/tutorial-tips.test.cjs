/* Which tip fits a moment, what counts as already learned, and proof the catalog is complete. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
function load(file) {
    let result;
    const code = fs.readFileSync(path.join(__dirname, '../game_data/static', file), 'utf8');
    vm.runInNewContext(code, { define(dependencies, factory) { result = factory(); } });
    return result;
}
const model = load('tutorial-tips-model.js');
const { tips: catalog } = JSON.parse(fs.readFileSync(path.join(__dirname, '../static/tutorial-tips.json'), 'utf8'));
const known = new Set(catalog.map(tip => tip.id));
const view = (overrides = {}) => ({ mode: 'play', health: 1, magic: 1, level: 1, turns: 40, place: 'D:1', species: 'Minotaur',
    background: 'Fighter', god: '', stairs: '', multiplayer: false, combat: false, explored: false, enemies: [], allies: 0,
    harmless: 0, clouds: 0, items: 0, features: {}, inventory: [], floorItems: 0, statuses: [], badStatuses: 0, signals: {},
    spells: 0, abilities: 0, memorisable: 0, library: 0, canTrain: true, kills: 0, resource: 'mp', gold: 0, penance: false, resists: false,
    mutations: 0, banes: 0, runes: 0, gems: 0, zot: 0, party: 1, canTrade: false, canExclude: false, teammateDown: false,
    teammateAway: false, aiTeammate: false, ...overrides });
const ids = (overrides, seen = {}, level = 'all') => Array.from(model.eligible(catalog, view(overrides), seen, level), tip => tip.id);
const orc = { name: 'orc', threat: 1, distance: 3 };

/* Every event in the native hint system, mapped to the tip that teaches it. A new native
   event fails this test until someone decides what it should do. */
const nativeHints = {
    SEEN_FIRST_OBJECT: 'floor_item', SEEN_POTION: 'potion', SEEN_SCROLL: 'scroll', SEEN_WAND: 'wand', SEEN_SPBOOK: 'book',
    SEEN_JEWELLERY: 'jewellery', SEEN_MISC: 'evoke', SEEN_STAFF: 'equip', SEEN_WEAPON: 'equip', SEEN_MISSILES: 'missile',
    SEEN_ARMOUR: 'equip', SEEN_GOLD: 'gold', SEEN_STAIRS: 'stairs', SEEN_ESCAPE_HATCH: 'hatch', SEEN_BRANCH: 'branch',
    SEEN_PORTAL: 'portal', SEEN_TRAP: 'trap', SEEN_ALTAR: 'altar', SEEN_SHOP: 'shop', SEEN_DOOR: 'door', SEEN_RUNED_DOOR: 'runed_door',
    SEEN_MONSTER: 'fight', SEEN_ZERO_EXP_MON: 'harmless', MONSTER_UNUSUAL: 'inspect', MONSTER_FRIENDLY: 'ally', MONSTER_SHOUT: 'noise',
    KILLED_MONSTER: 'attack_info', NEW_LEVEL: 'skills', SKILL_RAISE: 'skills', GAINED_MAGICAL_SKILL: 'skills',
    GAINED_MELEE_SKILL: 'skills', GAINED_RANGED_SKILL: 'skills', CHOOSE_STAT: 'stat_choice', NEW_ABILITY_GOD: 'abilities',
    NEW_ABILITY_ITEM: 'abilities', CONVERT: 'god', GOD_DISPLEASED: 'penance', EXCOMMUNICATE: 'penance', SPELL_MISCAST: 'miscast',
    GLOWING: 'contam', YOU_RESIST: 'resists', YOU_ENCHANTED: 'status', YOU_POISON: 'poison', YOU_MUTATED: 'mutation',
    CAN_BERSERK: 'abilities', POSTBERSERK: 'status', CAUGHT_IN_NET: 'caught', YOU_SILENCE: 'status', RUN_AWAY: 'retreat',
    RETREAT_CASTER: 'low_magic', WIELD_MELEE_WEAPON: 'equip', WIELD_WEAPON: 'equip', NEED_HEALING: 'rest',
    NEED_POISON_HEALING: 'poison', INVISIBLE_DANGER: 'invisible', NEED_HEALING_INVIS: 'invisible', ABYSS: 'abyss',
    MULTI_PICKUP: 'pickup', FULL_INVENTORY: 'full_pack', SHIFT_RUN: 'run', MAP_VIEW: 'map', AUTO_EXPLORE: 'explore',
    DONE_EXPLORE: 'stairs', AUTO_EXCLUSION: 'exclusion', STAIR_HIGHLIGHT: 'stairs', HEAP_HIGHLIGHT: 'floor_item',
    TRAP_HIGHLIGHT: 'trap', LOAD_SAVED_GAME: 'save', AUTOPICKUP_THROWN: 'missile', TARGET_NO_FOE: 'targeting',
    ITEM_RESISTANCES: 'resists', HEALING_POTIONS: 'retreat', GAINED_SPELLCASTING: 'spells', FUMBLING_SHALLOW_WATER: 'water',
    CLOUD_WARNING: 'cloud', SEEN_WEB: 'web', MALEVOLENCE: 'malevolence', OPPORTUNITY_ATTACK: 'step_away', ON_FIRE: 'burning'
};
/* Native events with no tip, each for a stated reason. */
const noTip = {
    MONSTER_LEFT_LOS: 'The enemy rail keeps listing a creature after it leaves view.',
    SEEN_RANDART: 'Save-compatibility only.', SEEN_CARRION: 'Save-compatibility only.', NEW_ABILITY_MUT: 'Save-compatibility only.',
    FLEEING_MONSTER: 'Save-compatibility only.', YOU_CURSED: 'Save-compatibility only.', REMOVED_CURSE: 'Save-compatibility only.',
    ANIMATE_CORPSE_SKELETON: 'Save-compatibility only.', MAKE_CHUNKS: 'Nothing raises this event.', YOU_STARVING: 'Nothing raises this event.'
};
const nativeEvents = () => {
    const header = source('hints.h');
    const body = header.slice(header.indexOf('enum hints_event_type'), header.indexOf('HINT_EVENTS_NUM'));
    return [...new Set(body.match(/^\s+HINT_[A-Z_0-9]+/gm).map(line => line.trim().slice(5)))];
};

test('every tip has a rule and every rule has a tip', () => {
    assert.deepEqual([...known].sort(), Object.keys(model.rules).sort());
});
test('every native hint event is taught by a tip or excluded with a reason', () => {
    const events = nativeEvents();
    assert.ok(events.length >= 89, 'expected the full native event list');
    const missing = events.filter(event => !(event in nativeHints) && !(event in noTip));
    assert.deepEqual(missing, []);
    Object.entries(nativeHints).forEach(([event, tip]) => {
        assert.ok(events.includes(event), event + ' no longer exists');
        assert.ok(known.has(tip), event + ' maps to unknown tip ' + tip);
    });
});
test('every item class the engine can send has a tip that actually fires', () => {
    const invent = source('invent.cc');
    const start = invent.indexOf('return "Gold"');
    const names = invent.slice(start, invent.indexOf('}', start)).match(/return "([A-Z][^"]+)"/g).map(entry => entry.slice(8, -1));
    const expected = { 'Hand Weapons': 'equip', Missiles: 'missile', Armour: 'equip', Wands: 'wand', Scrolls: 'scroll', Jewellery: 'jewellery',
        Potions: 'potion', 'Magical Staves': 'equip', 'Orbs of Power': 'orb', Miscellaneous: 'evoke', Talismans: 'talisman', Baubles: 'evoke' };
    const elsewhere = { Gold: 'gold', 'Runes of Zot': 'rune', 'Ancient Gems': 'gem', Books: 'book' };
    const obsolete = ['Comestibles', 'Rods', 'Carrion', 'Gizmo'];
    assert.ok(names.includes('Magical Staves') && names.includes('Talismans'));
    names.forEach(name => {
        if (name in expected) assert.ok(ids({ inventory: [{ kind_name: name, equipped: false }] }).includes(expected[name]), name);
        else assert.ok(name in elsewhere || obsolete.includes(name), 'unhandled item class ' + name);
    });
    assert.ok(ids({ gold: 5 }).includes('gold'));
    assert.ok(ids({ runes: 1 }).includes('rune'));
    assert.ok(ids({ gems: 1 }).includes('gem'));
    assert.ok(ids({ library: 4 }).includes('book'));
});
test('every portal and branch the engine names is recognised, in the words it sends', () => {
    const data = source('feature-data.h');
    const names = macro => [...data.matchAll(new RegExp(macro + '\\(DNGN_[A-Z_0-9]+, "([^"]*)"', 'g'))].map(match => match[1]);
    const branches = names('BRANCH_ENTRANCE'), portals = names('PORTAL_ENTRANCE');
    assert.ok(branches.length > 10 && portals.length > 20);
    branches.forEach(name => assert.equal(model.classify('a ' + name), 'branch', name));
    portals.filter(name => !/exit through/.test(name)).forEach(name =>
        assert.ok(['branch', 'portal'].includes(model.classify('a ' + name)), name));
    names('ALTAR').filter(name => name !== 'detected altar').forEach(name => assert.equal(model.classify('a ' + name), 'altar', name));
    names('TRAP').filter(name => !/^web$|golubria/i.test(name)).forEach(name => assert.equal(model.classify('a ' + name), 'trap', name));
});
test('features that are not worth a tip stay quiet', () => {
    ['stone staircase leading down', 'a floor', 'a stone wall', 'an open door', 'a broken door', 'gate leading out of Pandemonium',
        'a gateway leading out of Dis', 'gate leading back out of this place', 'a sealed door', 'an abandoned shop', 'a collapsed entrance',
        'a detected shop or portal', 'some deep water', 'some lava', 'a passage of Golubria'].forEach(name => assert.equal(model.classify(name), null, name));
    assert.equal(model.classify('a closed door'), 'door');
    assert.equal(model.classify('a runed translucent door'), 'runed_door');
    assert.equal(model.classify('an escape hatch in the floor'), 'hatch');
    assert.equal(model.classify('a web'), 'web');
    assert.equal(model.classify('some shallow water'), 'water');
    assert.equal(model.classify('a shop'), 'shop');
    assert.equal(model.classify('a labyrinth entrance'), 'portal');
});
test('message signals match what the engine prints', () => {
    assert.ok(source('player-stats.cc').includes('Increase (S)trength, (I)ntelligence, or (D)exterity? '));
    assert.ok(source('spl-cast.cc').includes('You miscast %s.'));
    assert.ok(source('traps.cc').includes('With a horrendous wail, an alarm goes off!'));
    assert.ok(source('traps.cc').includes('spontaneously manifests!'));
    assert.ok(source('player-stats.cc').includes('Increase (s)trength, (i)ntelligence, or (d)exterity? '));
    assert.equal(model.signal('Increase (S)trength, (I)ntelligence, or (D)exterity? '), 'stat');
    assert.equal(model.signal('Increase (s)trength, (i)ntelligence, or (d)exterity? '), 'stat');
    assert.equal(model.signal('<lightred>You miscast Sandblast.</lightred>'), 'miscast');
    assert.equal(model.signal('With a horrendous wail, an alarm goes off!'), 'malevolence');
    assert.equal(model.signal('<red>Something bites you!</red>'), 'unseen');
    assert.equal(model.signal('You kill the rat.'), null);
    model.signals.forEach(([name]) => assert.ok(Object.keys(model.rules).some(rule =>
        String(model.rules[rule]).includes('signals.' + name)), name + ' reaches no rule'));
});
test('every key a tip names really is that command', () => {
    const keys = source('cmd-keys.h');
    const named = new Set(['Tab', 'Enter', 'Esc', 'F12', 'Ctrl + P', 'Cmd/Ctrl + F', 'Alt + L']);
    const promptOnly = new Set(['stat_choice']);
    catalog.forEach(tip => (tip.body.match(/`[^`]+`/g) || []).map(entry => entry.slice(1, -1)).forEach(key => {
        if (named.has(key) || promptOnly.has(tip.id)) return;
        assert.ok(keys.includes(`{'${key}', CMD_`), `${tip.id} names ${key}, which is not a command key`);
    }));
});
test('this fork\'s own mechanics are covered', () => {
    ['zot', 'heat', 'combat', 'plan', 'trade', 'chat', 'party', 'floors', 'teammate_down', 'downed', 'switch_hero', 'ai_teammate',
        'quick', 'arrange', 'find', 'zoom', 'exclusion', 'rune', 'gem', 'orb', 'stat_choice', 'targeting'].forEach(id => assert.ok(known.has(id), id));
});
test('the first moments teach moving, then exploring', () => {
    assert.deepEqual(ids({ turns: 0 }), ['move', 'explore']);
    assert.deepEqual(ids({ turns: 0 }, { move: true }), ['explore']);
    assert.deepEqual(ids({ turns: 4 }), ['explore']);
});
test('an enemy replaces calm advice and danger comes first', () => {
    const carrying = [{ kind_name: 'Potions' }];
    assert.deepEqual(ids({ enemies: [orc], inventory: carrying }), ['fight']);
    assert.deepEqual(ids({ enemies: [{ ...orc, threat: 2 }] }), ['inspect', 'fight']);
    assert.deepEqual(ids({ enemies: [orc], health: 0.3 }), ['retreat', 'fight']);
    assert.deepEqual(ids({ enemies: [orc], combat: true }, { fight: true }), ['combat', 'plan']);
    assert.deepEqual(ids({ enemies: [{ ...orc, distance: 1 }], health: 0.6 }), ['fight', 'step_away'].sort((a, b) =>
        catalog.findIndex(tip => tip.id === a) - catalog.findIndex(tip => tip.id === b)));
});
test('urgent tips lead the catalog and name real danger', () => {
    const urgent = catalog.filter(tip => tip.urgent).map(tip => tip.id);
    assert.deepEqual(urgent, ['retreat', 'poison', 'burning', 'caught', 'confused', 'targeting', 'stat_choice', 'downed', 'teammate_down']);
    assert.equal(catalog.findIndex(tip => !tip.urgent), urgent.length);
});
test('status tips read the words the engine sends', () => {
    [['poisoned', 'poison'], ['quite poisoned (-2)', 'poison'], ['Pois', 'poison'], ['on fire', 'burning'], ['Fire', 'burning'],
        ['Held', 'caught'], ['held', 'caught'], ['Conf', 'confused'], ['confused', 'confused'], ['Contam', 'contam'], ['glowing', 'contam']]
        .forEach(([text, tip]) => assert.equal(ids({ statuses: [text] })[0] === tip || ids({ statuses: [text] }).includes(tip), true, text));
    assert.ok(ids({ badStatuses: 1 }).includes('status'));
});
test('each input mode only shows its own tips', () => {
    assert.deepEqual(ids({ mode: 'target', turns: 0 }), ['targeting']);
    assert.deepEqual(ids({ mode: 'prompt' }), []);
    assert.deepEqual(ids({ mode: 'prompt', signals: { stat: true } }), ['stat_choice']);
    assert.deepEqual(ids({ mode: 'downed', health: 0, enemies: [orc] }), ['downed']);
    assert.ok(!ids({}).includes('targeting') && !ids({}).includes('downed') && !ids({}).includes('stat_choice'));
});
test('calm situations pick out what the hero actually has', () => {
    assert.ok(ids({ health: 0.5 }).includes('rest'));
    assert.ok(ids({ floorItems: 2 }).includes('pickup'));
    assert.ok(ids({ items: 2 }).includes('floor_item'));
    assert.ok(ids({ explored: true }).includes('stairs'));
    assert.ok(!ids({ explored: true }).includes('explore'));
    Object.entries({ altar: 'altar', shop: 'shop', trap: 'trap', door: 'door', runed_door: 'runed_door', hatch: 'hatch', branch: 'branch',
        portal: 'portal', web: 'web', water: 'water' }).forEach(([kind, tip]) => assert.ok(ids({ features: { [kind]: true } }).includes(tip), kind));
    assert.ok(!ids({ inventory: [{ kind_name: 'Armour', equipped: true }] }).includes('equip'));
    assert.ok(!ids({ inventory: [{ kind_name: 'Jewellery', equipped: true }] }).includes('jewellery'));
    assert.ok(ids({ level: 2 }).includes('skills'));
    assert.ok(!ids({ level: 2, canTrain: false }).includes('skills'));
    assert.ok(ids({ resource: 'heat' }).includes('heat'));
    assert.ok(ids({ penance: true }).includes('penance'));
    assert.ok(ids({ god: 'Zin' }).includes('god'));
    assert.ok(ids({ zot: 0.6 }).includes('zot'));
    assert.ok(!ids({ zot: 0.2 }).includes('zot'));
    assert.ok(ids({ place: 'Abyss:2' }).includes('abyss'));
    assert.ok(ids({ inventory: Array.from({ length: 48 }, () => ({ kind_name: 'Scrolls' })) }).includes('full_pack'));
});
test('a caster low on magic is warned, and heat is not mistaken for magic', () => {
    assert.ok(ids({ enemies: [orc], spells: 2, magic: 0.2 }).includes('low_magic'));
    assert.ok(!ids({ enemies: [orc], spells: 2, magic: 0.2, resource: 'heat' }).includes('low_magic'));
    assert.ok(!ids({ enemies: [orc], magic: 0.2 }).includes('low_magic'));
});
test('party tips need a party', () => {
    assert.ok(ids({ teammateDown: true }).includes('teammate_down'));
    assert.ok(ids({ teammateAway: true }).includes('floors'));
    assert.ok(ids({ multiplayer: true }).includes('party'));
    assert.ok(ids({ multiplayer: true }).includes('chat'));
    assert.ok(ids({ canTrade: true }).includes('trade'));
    assert.ok(ids({ aiTeammate: true }).includes('ai_teammate'));
    assert.ok(ids({ party: 2 }).includes('switch_hero'));
    assert.ok(!ids({ party: 2, multiplayer: true }).includes('switch_hero'));
    ['party', 'chat', 'trade', 'floors', 'switch_hero', 'ai_teammate', 'teammate_down'].forEach(id => assert.ok(!ids({ turns: 2000 }).includes(id), id));
});
test('reference tips wait until the player has settled in', () => {
    const early = ids({ turns: 10 }), late = ids({ turns: 2000, canExclude: true });
    ['help', 'noise', 'map', 'run', 'save', 'quick', 'zoom', 'history', 'find', 'arrange', 'exclusion'].forEach(id => {
        assert.ok(!early.includes(id), id); assert.ok(late.includes(id), id);
    });
});
test('seen tips never return and levels narrow the list', () => {
    assert.ok(!ids({ health: 0.5 }, { rest: true }).includes('rest'));
    assert.deepEqual(ids({ turns: 1000 }, {}, 'off'), []);
    const essentials = ids({ turns: 1000, kills: 3 }, {}, 'essential');
    assert.ok(essentials.includes('explore'));
    assert.ok(!essentials.includes('attack_info'));
    assert.ok(!essentials.includes('help'));
});
test('a key the player already found teaches its tip', () => {
    assert.deepEqual(Array.from(model.practiced(catalog, 'o'), tip => tip.id), ['explore']);
    assert.deepEqual(Array.from(model.practiced(catalog, 'Tab'), tip => tip.id), ['fight']);
    assert.deepEqual(Array.from(model.practiced(catalog, '>'), tip => tip.id), ['stairs']);
    assert.deepEqual(Array.from(model.practiced(catalog, '~')), []);
});
test('every tip key that names a control appears in its text', () => {
    catalog.filter(tip => tip.keys).forEach(tip => assert.ok(tip.keys.some(key => tip.body.includes('`' + key + '`')), tip.id));
});
test('key caps split out of the text', () => {
    assert.deepEqual(Array.from(model.segments('Press `o` or Explore.'), part => [part.text, part.key]),
        [['Press ', false], ['o', true], [' or Explore.', false]]);
});
test('the Jev context carries the situation and no hero name', () => {
    const context = model.context(view({ enemies: [orc], name: 'Aster' }));
    assert.equal(context.enemies[0].name, 'orc');
    assert.ok(!JSON.stringify(context).includes('Aster'));
    assert.equal(context.species, 'Minotaur');
});
test('settings map to real durations and unknown values fall back', () => {
    assert.ok(model.gap('rarely') > model.gap('normal') && model.gap('normal') > model.gap('often'));
    assert.equal(model.gap('nonsense'), model.gap('normal'));
    assert.equal(model.lifetime('manual'), 0);
    assert.equal(model.lifetime('nonsense'), model.lifetime('medium'));
});
