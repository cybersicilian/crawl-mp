const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = path.resolve(__dirname, '../..');
const staticDir = path.join(source, 'webserver/game_data/static');
const read = name => fs.readFileSync(path.join(source, name), 'utf8');
const guiCode = fs.readFileSync(path.join(staticDir, 'tileinfo-gui.js'), 'utf8');
const artCode = fs.readFileSync(path.join(staticDir, 'power-art.js'), 'utf8');
const propertiesCode = read('webserver/static/scripts/item-properties.js');
let gui, art, properties;
vm.runInNewContext(propertiesCode, {
    define(dependencies, factory) { properties = factory(); }
});
vm.runInNewContext(guiCode, {
    define(dependencies, factory) { gui = factory({ TILEP_PLAYER_MAX: 10000 }); }
});
vm.runInNewContext(artCode, {
    define(dependencies, factory) { art = factory(gui, properties); },
    document: { getElementById() { return null; } }
});

// Keep the browser's exact-name fallback in sync with the engine's native art.
const spells = [...read('spl-data.h').matchAll(/\{\s*(SPELL_\w+),\s*"([^"\n]+)"([^{}]*?)\}/g)];
let spellCount = 0;
const portSpells = {
    'Shackle': 'SHACKLE', 'False Image': 'FALSE_IMAGE', 'Mana Rupture': 'GRAVITAS',
    'Icicle Burst': 'ICICLE_BURST', 'Steam Barrier': 'STEAM_BARRIER', 'Blight': 'BLIGHT',
    'Scorpion Form': 'SCORPION_FORM', "Eringya's Rootspike": 'ERINGYAS_ROOTSPIKE',
    "Olgreb's Last Mercy": 'OLGREBS_LAST_MERCY', 'Elemental Weapon': 'ELEMENTAL_WEAPON'
};
for (const [name, symbol] of Object.entries(portSpells)) {
    assert(Number.isInteger(gui[symbol]), `${name} has a generated atlas entry`);
    assert.equal(art.resolve({ name }, 'spell'), gui[symbol], `${name} resolves by name`);
    assert.equal(art.resolve({ name, tile: gui[symbol] }, 'spell'), gui[symbol], `${name} accepts native metadata`);
}
for (const [, , name, body] of spells) {
    const symbol = [...body.matchAll(/TILEG_(\w+)/g)].at(-1)[1];
    if (symbol === 'ERROR' || symbol === 'TODO') continue;
    assert.equal(art.resolve({ name }, 'spell'), gui[symbol], `${name} uses its native spell art`);
    spellCount++;
}

const picker = read('tilepick.cc').split('tileidx_t tileidx_ability(', 2)[1]
    .split('\ntileidx_t tileidx_branch(', 1)[0];
const branches = [...picker.matchAll(/^ {3,4}(?:case (ABIL_\w+):|default:)/gm)];
const nativeAbilityTiles = new Map();
let pending = [];
branches.forEach((branch, index) => {
    if (!branch[1]) return;
    const body = picker.slice(branch.index + branch[0].length, branches[index + 1]?.index)
        .replace(/\/\/[^\n]*|^\s*#.*$/gm, '').trim();
    if (!body) { pending.push(branch[1]); return; }
    const returned = /^return TILEG_(\w+);$/.exec(body);
    if (returned) [...pending, branch[1]].forEach(name => nativeAbilityTiles.set(name, returned[1]));
    pending = [];
});
let abilityCount = 0;
for (const [, identifier, name] of read('ability.cc').matchAll(/\{\s*(ABIL_\w+),\s*"([^"\n]+)"/g)) {
    const symbol = nativeAbilityTiles.get(identifier);
    if (!symbol || symbol === 'ERROR' || symbol === 'TODO') continue;
    assert.equal(art.resolve({ name }, 'ability'), gui[symbol], `${name} uses its native ability art`);
    abilityCount++;
}
assert(spellCount > 400 && abilityCount > 150, 'Cover the full native catalogs, including monster spells');
assert.equal(art.resolve({ name: 'Olgreb’s Toxic Radiance' }, 'spell'), gui.OLGREBS_TOXIC_RADIANCE);
assert.equal(art.resolve({ name: 'Evoke Blink' }, 'ability'), gui.ABILITY_BLINK);
assert.equal(art.resolve({ name: 'Blink' }, 'spell'), gui.BLINK);
assert.notEqual(gui.ABILITY_BLINK, gui.BLINK, 'Spells and abilities retain their distinct native art');
assert(Number.isInteger(gui.ABILITY_SHELL_DASH));
assert.notEqual(gui.ABILITY_SHELL_DASH, gui.ABILITY_JUMP, 'Shell Dash owns a native atlas tile');
assert.equal(art.resolve({ name: 'Shell Dash', tile: gui.ABILITY_JUMP }, 'ability'), gui.ABILITY_SHELL_DASH,
    'Older server metadata uses the dedicated client art for the exact Shell Dash ability');
assert.equal(art.resolve({ name: 'Jump', tile: gui.ABILITY_JUMP }, 'ability'), gui.ABILITY_JUMP);
assert.equal(art.resolve({ name: 'Unleash Destruction' }, 'ability'), null,
    'State-dependent destruction art is unavailable without authoritative native metadata');
assert.equal(art.resolve({ name: 'Accept Mark of the Tyrant', tile: gui.ABILITY_MAKHLEB_MARK_OF_THE_TYRANT }, 'ability'),
    gui.ABILITY_MAKHLEB_MARK_OF_THE_TYRANT, 'Native metadata selects the actual mutation variant');
assert.equal(art.resolve({ name: 'Recast Fireball', tile: gui.FIREBALL }, 'ability'), gui.FIREBALL,
    'Repeated Exegesis keeps the native spell artwork');
assert.equal(art.resolve({ name: 'Recruit a named apostle', tile: gui.ABILITY_BEOGH_RECRUIT_APOSTLE }, 'ability'),
    gui.ABILITY_BEOGH_RECRUIT_APOSTLE, 'Dynamic native names work through authoritative tile metadata');
for (const kind of ['spell', 'ability']) {
    for (const tile of [gui.ERROR, gui.TODO, gui.CMD_CAST_SPELL, -1, Infinity, '10001'])
        assert.equal(art.resolve({ name: 'Unknown new power', tile }, kind), null);
}
for (const kind of ['item', '__proto__', 'toString', '', null])
    assert.equal(art.resolve({ name: 'Magic Dart', tile: gui.MAGIC_DART }, kind), null);
for (const power of [null, undefined, {}, { id: 1 }, { name: 'Fireball-esque custom power' }, { name: '<svg onload=bad()>' }])
    assert.equal(art.resolve(power, 'spell'), null, 'Do not guess or infer art from arbitrary IDs or partial names');
assert.equal(art.ready(), false);
const engine = read('tileweb.cc');
assert.match(engine, /json_write_int\("id", tal\.which\);\s*json_write_int\("tile", tileidx_ability\(tal\.which\)\);/);
assert.match(engine, /json_write_int\("id", sp\);\s*json_write_bool\("quick_cast",[^\n]+\);\s*json_write_int\("tile", tileidx_spell\(sp\)\);/);
assert(artCode.split('\n').length <= 600);
console.log(`Native artwork parity passed for ${spellCount} spells and ${abilityCount} static abilities; dynamic metadata and unknown art guards passed.`);

async function browserProof() {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 700, height: 280 } });
    let releaseFallback;
    const fallbackDelay = new Promise(resolve => { releaseFallback = resolve; });
    await page.route('http://power-art.test/', route => route.fulfill({ contentType: 'text/html', body:
        '<body style="margin:20px;background:#171b1d;color:#dbd0ab;font:13px sans-serif"><style>'
        + '.power-art{display:block;width:32px;height:32px;image-rendering:pixelated;margin:0 auto 8px}'
        + '.power-art-fallback{width:16px;height:16px}</style><h3>Native spell and ability artwork</h3>'
        + '<img id="gui" hidden><div id="gallery" style="display:flex;gap:14px"></div></body>' }));
    const question = properties.iconSprite('question');
    await page.route('http://power-art.test' + question.url, async route => {
        await fallbackDelay;
        await route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(source, 'webserver', question.url)) });
    });
    try {
    await page.goto('http://power-art.test/');
    await page.evaluate(code => {
        window.define = (dependencies, factory) => { window.iconProperties = factory(); }; window.eval(code);
    }, propertiesCode);
    await page.evaluate(code => {
        window.define = (dependencies, factory) => { window.nativeGui = factory({ TILEP_PLAYER_MAX: 10000 }); };
        window.eval(code);
    }, guiCode);
    const fallbackRequested = page.waitForRequest(request => request.url().endsWith(question.url));
    await page.evaluate(code => {
        window.define = (dependencies, factory) => { window.powerArt = factory(window.nativeGui, window.iconProperties); };
        window.eval(code);
        window.galleryEntries = [
            ['spell', 'Magic Dart'], ['spell', 'Fireball'], ['spell', 'Blink'],
            ['ability', 'Evoke Blink'], ['ability', 'Berserk'], ['ability', 'Channel Magic'],
            ['ability', 'Spit Poison'], ['ability', 'Unknown new power']
        ];
        window.galleryEntries.forEach(([kind, name]) => {
            const box = document.createElement('div'); box.style.cssText = 'width:68px;text-align:center';
            const canvas = window.powerArt.create({ name }, kind);
            box.append(canvas, name); document.getElementById('gallery').append(box);
        });
        window.readyBeforeImage = window.powerArt.ready();
    }, artCode);
    await fallbackRequested;
    assert(await page.locator('canvas').evaluateAll(elements => elements.every(canvas =>
        canvas.width === 16 && canvas.height === 16 && canvas.dataset.uiIcon === 'question')),
        'Unavailable/loading art uses the shared native16 question sprite, retaining canvas compatibility');
    await page.evaluate(src => {
        const image = document.getElementById('gui');
        return new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', reject, { once: true }); image.src = src;
        });
    }, `data:image/png;base64,${fs.readFileSync(path.join(staticDir, 'gui.png')).toString('base64')}`);
    const nativePixels = await page.locator('canvas').first().evaluate(canvas => canvas.toDataURL());
    releaseFallback();
    await page.waitForFunction(() => {
        const canvas = document.querySelectorAll('canvas')[7];
        return canvas.getContext('2d').getImageData(0, 0, 16, 16).data.some((value, index) => index % 4 === 3 && value > 0);
    });
    assert.equal(await page.locator('canvas').first().evaluate(canvas => canvas.toDataURL()), nativePixels,
        'A late UI atlas never paints the fallback over already resolved native artwork');
    // The nodes were created before the atlas loaded; they must repaint in place.
    const proof = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, 32, 32).data;
        return { art: canvas.dataset.powerArt, tile: canvas.dataset.nativeTile, width: canvas.width, height: canvas.height,
            sharedIcon: canvas.dataset.uiIcon,
            label: canvas.getAttribute('aria-label'), painted: pixels.some((value, index) => index % 4 === 3 && value > 0) };
    }));
    assert(proof.slice(0, 7).every(entry => entry.art === 'native' && entry.painted
        && entry.width === 32 && entry.height === 32 && !entry.sharedIcon));
    assert.equal(proof[7].art, 'unavailable');
    assert.equal(proof[7].sharedIcon, 'question');
    assert.equal(proof[7].width, 16); assert.equal(proof[7].height, 16);
    assert.match(proof[7].label, /artwork unavailable/);
    assert(await page.evaluate(async sprite => {
        const image = new Image(); image.src = sprite.url; await image.decode();
        const reference = document.createElement('canvas'); reference.width = reference.height = 16;
        reference.getContext('2d').drawImage(image, sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, 16, 16);
        return reference.toDataURL() === document.querySelectorAll('canvas')[7].toDataURL();
    }, question), 'Fallback pixels exactly match the shared native16 question frame');
    assert.notEqual(proof[2].tile, proof[3].tile);
    assert.equal(await page.evaluate(() => window.powerArt.ready()), true);
    await page.screenshot({ path: '/tmp/dcss-native-power-art.png' });
    console.log('Native GUI atlas pixels, late loading, shared native16 fallback and atlas race guards passed in Chrome.');
    } finally { releaseFallback(); await browser.close(); }
}
if (process.argv.includes('--browser')) browserProof().catch(error => { console.error(error); process.exitCode = 1; });
