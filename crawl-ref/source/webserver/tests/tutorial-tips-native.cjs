/* Stages each situation in a real game through the engine's own scripting, then asks the
   live client which tips fit. Mocked views cannot catch a rule reading the wrong field. */
const crypto = require('node:crypto');
const { chromium, assert, send, key, ready, lua, capture, named } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8932';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const results = [];
const GEM_SPECS = (process.env.TIPS_GEMS || 'smoky gem,glittering gem,shimmering gem,earthy gem').split(',');
const fits = page => named(page, 'tutorial-tips', 'module.fits()');
const hero = page => page.evaluate(() => JSON.parse(JSON.stringify(window.crawl_party.state.members[0])));
async function settled(page, fn, timeout = 8000) {
    const end = Date.now() + timeout;
    let value;
    do { value = await fn(); if (value) return value; await page.waitForTimeout(250); } while (Date.now() < end);
    return value;
}
async function expectTips(page, name, wanted, absent = []) {
    let found = [];
    await settled(page, async () => { found = await fits(page); return wanted.every(id => found.includes(id)); });
    const missing = wanted.filter(id => !found.includes(id)), wrong = absent.filter(id => found.includes(id));
    results.push({ name, pass: !missing.length && !wrong.length, missing, wrong });
    console.log((missing.length || wrong.length ? 'FAIL ' : 'ok   ') + name + (missing.length ? ' missing ' + missing : '') + (wrong.length ? ' unexpected ' + wrong : ''));
}
const wait = async page => { await clear(page); await key(page, 46); await page.waitForTimeout(350); await clear(page); };
/* Like lua(), but the code opens a native prompt, so no completion marker can print. */
async function promptLua(target, code) {
    const page = target.page;
    await ready(page);
    const prompts = await page.evaluate(() => window.qaWizardPrompts);
    await key(page, 38);
    await page.waitForFunction(count => window.qaWizardPrompts > count, prompts);
    const inputs = await page.evaluate(() => window.qaInputStarts);
    await key(page, 20);
    await page.waitForFunction(count => window.qaInputStarts > count, inputs);
    await send(page, 'text_input', { text: code + '\r' });
}
/* A wizard command, answering any text prompts it asks. */
async function wizard(target, code, ...answers) {
    const page = target.page;
    await clear(page);
    const prompts = await page.evaluate(() => window.qaWizardPrompts);
    await key(page, 38);
    await page.waitForFunction(count => window.qaWizardPrompts > count, prompts);
    await key(page, code);
    for (const answer of answers) {
        await page.waitForTimeout(800);
        if (typeof answer === 'number') await key(page, answer);
        else await send(page, 'text_input', { text: answer + '\r' });
    }
    await page.waitForTimeout(800);
    await clear(page);
}
/* A rune's pickup ends on a native --more--; dismiss it the way a player would. */
async function clear(page) {
    for (let i = 0; i < 6; i++) {
        const free = await named(page, 'workflow-actions', 'module.ready()');
        if (free) return;
        await key(page, 27); await page.waitForTimeout(400);
    }
    await ready(page);
}
async function take(target, spec) {
    const page = target.page, before = (await hero(page)).inventory.length;
    await lua(target, `dgn.create_item(you.x_pos(),you.y_pos(),${JSON.stringify(spec)})`);
    await key(page, 103);
    await page.waitForTimeout(500);
    // A pile opens the pickup menu: select everything and accept.
    if (await page.evaluate(() => Boolean(document.querySelector('#ui-stack > *')))) { await key(page, 44); await key(page, 13); }
    await settled(page, async () => (await hero(page)).inventory.length > before, 5000);
    await clear(page);
    const after = await hero(page);
    if (after.inventory.length === before) console.log('note: pack unchanged by', spec,
        JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#messages .game_message')].slice(-3).map(entry => entry.textContent.slice(0, 80)))));
    return after;
}
(async () => {
    process.on('unhandledRejection', () => {});
    const browser = await chromium.launch({ headless: true, ...(process.env.TACTICAL_BROWSER_CHANNEL ? { channel: process.env.TACTICAL_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    // A busy host can take minutes to start a game; only a real stall should fail this.
    page.setDefaultTimeout(60000);
    const target = { page };
    const dump = async label => { try {
        await page.screenshot({ path: (process.env.TIPS_DUMP || '/tmp') + '/tips-' + label + '.png' });
        console.log('dump', label, (await page.evaluate(() => document.body.innerText.slice(-320))).replace(/\n/g, ' | '));
    } catch (error) { /* The failure itself is what matters. */ } };
    global.tipsDump = dump;
    setTimeout(() => dump('stall').then(() => process.exit(3)), Number(process.env.TIPS_DEADLINE || 240000));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#reg_link').click();
    const name = 'Tips' + crypto.randomBytes(3).toString('hex'), password = crypto.randomBytes(10).toString('hex');
    await page.fill('#reg_username', name); await page.fill('#reg_password', password); await page.fill('#reg_repeat_password', password);
    await page.click('#reg_submit');
    await page.waitForSelector('a[href="#play-dcss-web-trunk"]', { state: 'attached' });
    await page.evaluate(() => document.querySelector('a[href="#play-dcss-web-trunk"]').click());
    await page.waitForFunction(() => /select your species/.test(document.body.innerText), null, { timeout: 300000 });
    await page.waitForTimeout(800);
    // A fixed hero keeps each run comparable: Minotaur Fighter can use everything staged here.
    await page.locator('#ui-stack').getByText('Minotaur', { exact: false }).first().click();
    await page.locator('#ui-stack').getByText('Fighter', { exact: false }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await page.locator('#ui-stack').getByText('Fighter', { exact: false }).first().click();
    await page.waitForTimeout(1500);
    if (await page.evaluate(() => /choice of weapons/.test(document.body.innerText))) await page.mouse.click(540, 362);
    await page.waitForFunction(() => window.crawl_party && window.crawl_party.state, null, { timeout: 60000 });
    await capture(page);
    await ready(page);
    await page.waitForFunction(() => { const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/tutorial-tips'));
        return name && require(name).catalog().length > 60; });
    console.log('hero', (await hero(page)).species, (await hero(page)).job);
    await lua(target, 'debug.dismiss_monsters()');
    await wait(page);
    await expectTips(page, 'a new game teaches moving and exploring', ['move', 'explore'], ['fight', 'poison']);
    // Nothing here should end the run early or wander in between stages.
    await lua(target, 'debug.disable("death",true); debug.disable("spawns",true)');
    await wizard(target, 4, 'liquid fire', '40');
    await page.waitForTimeout(400);
    console.log('statuses', JSON.stringify((await hero(page)).statuses.map(status => [status.text, status.light, status.is_bad])));
    await expectTips(page, 'on fire', ['burning', 'status']);
    for (let i = 0; i < 12 && (await fits(page)).includes('burning'); i++) await wait(page);


    // Wizard x grants one level through the native path, so level 3 asks for a stat.
    for (let level = 0; level < 2; level++) {
        await clear(page);
        const prompts = await page.evaluate(() => window.qaWizardPrompts);
        await key(page, 38);
        await page.waitForFunction(count => window.qaWizardPrompts > count, prompts);
        await key(page, 120);
        await page.waitForTimeout(1200);
    }
    const log = () => page.evaluate(() => [...document.querySelectorAll('#messages .game_message')].slice(-3).map(entry => entry.textContent.slice(0, 90)));
    // "You have reached level 3!" pauses on --more--; the stat prompt comes after it.
    const mode = () => named(page, 'game-context', 'module.get_input_mode()');
    for (let i = 0; i < 6 && await mode() === 5; i++) { await key(page, 13); await page.waitForTimeout(600); }
    console.log('xl', (await hero(page)).xl, 'log', JSON.stringify(await log()), 'mode', await mode());
    await expectTips(page, 'the level-up stat prompt', ['stat_choice'], ['explore']);
    await key(page, 83);
    await page.waitForTimeout(800);
    console.log('after answer', JSON.stringify(await log()));
    await clear(page);
    await expectTips(page, 'a level gained', ['skills']);

    await lua(target, 'dgn.create_item(you.x_pos()+1,you.y_pos(),"potion of curing")');
    await wait(page);
    await expectTips(page, 'an item in view', ['floor_item'], ['pickup']);
    await lua(target, 'dgn.create_item(you.x_pos(),you.y_pos(),"potion of curing")');
    await wait(page);
    await expectTips(page, 'an item underfoot', ['pickup']);
    await key(page, 103); await page.waitForTimeout(500); await ready(page);

    for (const [spec, tip] of [['scroll of blinking', 'scroll'], ['wand of flame', 'wand'], ['ring of protection from fire', 'jewellery'],
        ['any talisman', 'talisman'], ['dart q:5', 'missile'], ['staff of fire', 'equip'], ['serpentine rune of Zot', 'rune']]) {
        await take(target, spec);
        await expectTips(page, 'carrying ' + spec, [tip]);
    }
    // Some gadgets are limited per game, so try until one exists.
    for (const spec of ['lightning rod', 'phial of floods', 'sack of spiders', 'phantom mirror', 'condenser vane'])
        if ((await take(target, spec)).inventory.some(item => /miscellaneous/i.test(item.kind_name))) break;
    await expectTips(page, 'carrying a gadget', ['evoke']);
    const before = (await hero(page)).spell_library;
    await take(target, 'book of minor magic');
    const after = await hero(page);
    console.log('book', JSON.stringify({ before, after: after.spell_library, kinds: after.inventory.filter(item => /book/i.test(item.kind_name)).length }));
    await expectTips(page, 'a book read into the library', ['book', 'memorise']);
    await lua(target, 'you.gold(50)');
    await wait(page);
    await expectTips(page, 'gold in the purse', ['gold']);
    await expectTips(page, 'carrying a potion', ['potion']);

    await key(page, 102); // f: fire, which opens native targeting.
    await page.waitForTimeout(700);
    await expectTips(page, 'native targeting', ['targeting'], ['explore', 'potion']);
    await key(page, 27); await page.waitForTimeout(400); await ready(page);

    const terrain = [['altar_zin', 1, 0, 'altar'], ['closed_door', 1, 1, 'door'], ['runed_door', 0, 1, 'runed_door'], ['escape_hatch_down', -1, 1, 'hatch'],
        ['enter_lair', -1, 0, 'branch'], ['enter_bazaar', -1, -1, 'portal'], ['shallow_water', 0, -1, 'water'], ['trap_net', 1, -1, 'trap'], ['web', 2, 0, 'web']];
    for (const [feature, dx, dy] of terrain)
        await lua(target, `dgn.terrain_changed(you.x_pos()+${dx},you.y_pos()+${dy},"${feature}",false,false)`);
    await wait(page);
    console.log('web cell', JSON.stringify(await page.evaluate(() => {
        const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/map_knowledge')), map = require(name);
        const pos = window.crawl_party.state.members[0].pos, cell = map.get(pos.x + 2, pos.y);
        return cell && { feature: cell.feature_name, visible: map.visible(cell) };
    })));
    for (const [feature, , , tip] of terrain) await expectTips(page, 'beside ' + feature, [tip]);

    await lua(target, 'dgn.place_cloud(you.x_pos()+2,you.y_pos(),"flame",8)');
    await page.waitForTimeout(300);
    await wait(page);
    await expectTips(page, 'a cloud in view', ['cloud']);

    await lua(target, 'you.mutate("strong","test",true)');
    for (let i = 0; i < 4 && (await hero(page)).turns < 45; i++) { await key(page, 53); await page.waitForTimeout(1500); await clear(page); }
    console.log('turns', (await hero(page)).turns, 'mutations', JSON.stringify((await hero(page)).mutations).slice(0, 120));
    await expectTips(page, 'a mutation', ['mutation', 'abilities']);

    await lua(target, 'dgn.create_monster(you.x_pos()+3,you.y_pos(),"plant")');
    await wait(page);
    await expectTips(page, 'a plant', ['harmless'], ['fight']);
    await lua(target, 'dgn.create_monster(you.x_pos()-2,you.y_pos(),"att:friendly rat")');
    await wait(page);
    await expectTips(page, 'a friendly creature', ['ally'], ['fight']);
    await lua(target, 'debug.dismiss_monsters()');
    await wait(page);
    await lua(target, 'dgn.create_monster(you.x_pos()+3,you.y_pos(),"orc warrior")');
    await wait(page);
    await expectTips(page, 'a hostile in view', ['fight', 'combat', 'inspect', 'plan'], ['explore', 'potion']);
    if ((await hero(page)).mp_max) console.log('mp', (await hero(page)).mp, (await hero(page)).mp_max);
    const dangerous = await page.evaluate(() => (window.crawl_party.state.enemy_initiative || []).map(enemy => enemy.name || enemy.threat));
    console.log('enemies', JSON.stringify(dangerous));
    await clear(page);
    await lua(target, 'debug.dismiss_monsters()');
    await wait(page);

    // Message signals travel the real log pipeline, using the engine's own wording.
    for (const [text, tip] of [['You miscast Sandblast.', 'miscast'], ['Something bites you!', 'invisible'],
        ['With a horrendous wail, an alarm goes off!', 'malevolence']]) {
        await lua(target, `crawl.mpr(${JSON.stringify(text)})`);
        await expectTips(page, 'the message: ' + text, [tip]);
    }
    await lua(target, 'crawl.mpr("Done exploring.")');
    await expectTips(page, 'a finished floor', ['stairs'], ['explore']);

    await lua(target, 'you.mutate("fire resistance","test",true)');
    await wait(page);
    await expectTips(page, 'a resistance', ['resists']);
    await lua(target, 'you.gain_bane("lethargy","test",100)');
    await wait(page);
    await expectTips(page, 'a bane', ['banes']);
    await wizard(target, 110, '600');
    await wait(page);
    await expectTips(page, 'the Zot clock running down', ['zot']);
    await wizard(target, 33, 'magic dart');
    await wait(page);
    await expectTips(page, 'a known spell', ['spells']);
    await wizard(target, 92, 97);
    await wait(page);
    console.log('underfoot', await page.evaluate(() => { const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/map_knowledge'));
        const pos = window.crawl_party.state.members[0].pos, cell = require(name).get(pos.x, pos.y); return cell && cell.feature_name; }));
    await expectTips(page, 'a shop', ['shop']);
    await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"mutagenic fog",3)');
    await wait(page); await wait(page);
    console.log('statuses', JSON.stringify((await hero(page)).statuses.map(status => [status.text, status.light, status.is_bad])));
    await expectTips(page, 'magical contamination', ['contam']);
    for (const spec of GEM_SPECS) { await take(target, spec); if ((await hero(page)).gems.length) break; }
    await expectTips(page, 'an ancient gem', ['gem']);
    for (let i = 0; i < 16 && (await hero(page)).turns < 700; i++) {
        await key(page, 53);
        await settled(page, async () => !(await hero(page)).activity && await named(page, 'workflow-actions', 'module.ready()'), 20000);
        await clear(page);
    }
    console.log('turns', (await hero(page)).turns);
    await expectTips(page, 'a settled-in player', ['help', 'noise', 'map', 'run', 'save', 'quick', 'zoom', 'history', 'find', 'arrange', 'exclusion']);

    const slots = (await hero(page)).inventory.map(item => item.slot);
    await take(target, 'potion of ambrosia');
    const ambrosia = (await hero(page)).inventory.find(item => !slots.includes(item.slot));
    console.log('potion', ambrosia && ambrosia.name);
    if (ambrosia) await send(page, 'inv_item_use', { expected_slot: 0, slot: ambrosia.slot, expected_name: ambrosia.name, action: 'use' });
    await page.waitForTimeout(900); await clear(page);
    console.log('statuses', JSON.stringify((await hero(page)).statuses.map(status => [status.text, status.light, status.is_bad])));
    await expectTips(page, 'confused', ['confused', 'status']);
    // Confusion would send the next step in a random direction, past the staged web.
    for (let i = 0; i < 40 && (await fits(page)).includes('confused'); i++) await wait(page);

    await lua(target, 'dgn.terrain_changed(you.x_pos()+1,you.y_pos(),"web",false,false)');
    await wait(page);
    await key(page, 108);
    // Walking onto a known web asks first; the question can arrive late on a busy host.
    await settled(page, async () => {
        if ((await hero(page)).statuses.some(status => status.light === 'Held')) return true;
        if (!(await named(page, 'workflow-actions', 'module.ready()'))) await key(page, 89);
        return false;
    }, 6000);
    await clear(page);
    console.log('statuses', JSON.stringify((await hero(page)).statuses.map(status => [status.text, status.light, status.is_bad])));
    await expectTips(page, 'caught in a web', ['caught']);

    await lua(target, 'for i=1,70 do dgn.create_item(you.x_pos(),you.y_pos(),"any") end');
    await key(page, 103); await page.waitForTimeout(1200);
    if (await page.evaluate(() => Boolean(document.querySelector('#ui-stack > *')))) { await key(page, 44); await key(page, 13); }
    await settled(page, async () => (await hero(page)).inventory.length >= 48, 12000);
    await clear(page);
    await lua(target, 'debug.dismiss_monsters()');
    await wait(page);
    console.log('pack', (await hero(page)).inventory.length);
    await expectTips(page, 'a nearly full pack', ['full_pack']);

    await clear(page);
    await lua(target, 'debug.goto_place("Abyss:1")');
    await page.waitForTimeout(800); await clear(page);
    console.log('place', (await hero(page)).place);
    await expectTips(page, 'in the Abyss', ['abyss']);

    const hurt = async limit => { const now = await hero(page); return now.hp / now.hp_max < limit; };
    for (let i = 0; i < 8 && !(await hurt(0.65)); i++) {
        await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"flame",1)');
        await wait(page);
    }
    await lua(target, 'debug.dismiss_monsters()');
    await wait(page);
    console.log('health', (await hero(page)).hp, '/', (await hero(page)).hp_max);
    await expectTips(page, 'hurt with nothing near', ['rest']);

    await lua(target, 'dgn.place_cloud(you.x_pos(),you.y_pos(),"poison gas",4)');
    await wait(page); await wait(page);
    console.log('statuses', JSON.stringify((await hero(page)).statuses.map(status => [status.text, status.light, status.is_bad])));
    await expectTips(page, 'poisoned', ['poison', 'status']);
    await lua(target, 'dgn.create_monster(you.x_pos()+1,you.y_pos(),"orc warrior")');
    await page.waitForTimeout(500);
    console.log('health', (await hero(page)).hp, '/', (await hero(page)).hp_max);
    await expectTips(page, 'badly hurt beside an enemy', ['retreat', 'step_away']);

    await clear(page);
    await lua(target, 'debug.dismiss_monsters()');
    await lua(target, 'dgn.create_item(you.x_pos(),you.y_pos(),"orb of zot")');
    await key(page, 103); await page.waitForTimeout(1200);
    if (await page.evaluate(() => Boolean(document.querySelector('#ui-stack > *')))) { await key(page, 44); await key(page, 13); }
    await page.waitForTimeout(800); await clear(page);
    await expectTips(page, 'carrying the Orb of Zot', ['orb']);
    await lua(target, 'debug.dismiss_monsters(); you.change_species("Automaton")');
    await wait(page);
    console.log('resource', (await hero(page)).spell_resource);
    await expectTips(page, 'an Automaton', ['heat']);

    const partyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const partyPage = await partyContext.newPage();
    partyPage.setDefaultTimeout(30000);
    await partyPage.goto(url);
    await partyPage.locator('#reg_link').click();
    const partyName = 'Tips' + crypto.randomBytes(3).toString('hex'), partyWord = crypto.randomBytes(10).toString('hex');
    await partyPage.fill('#reg_username', partyName); await partyPage.fill('#reg_password', partyWord); await partyPage.fill('#reg_repeat_password', partyWord);
    await partyPage.click('#reg_submit');
    await partyPage.waitForSelector('a[href="#play-coop-2p-web-trunk"]', { state: 'attached' });
    await partyPage.evaluate(() => document.querySelector('a[href="#play-coop-2p-web-trunk"]').click());
    await partyPage.waitForFunction(() => window.crawl_party && window.crawl_party.state, null, { timeout: 300000 });
    await partyPage.waitForFunction(() => { const name = Object.keys(require.s.contexts._.defined).find(entry => entry.endsWith('/tutorial-tips'));
        return name && require(name).catalog().length > 60; }, null, { timeout: 30000 });
    await expectTips(partyPage, 'a party of two heroes', ['switch_hero', 'move']);
    await partyContext.close();

    const failed = results.filter(result => !result.pass);
    console.log(`${results.length - failed.length}/${results.length} situations passed`);
    console.log('page errors', errors.length, JSON.stringify(errors.slice(0, 3)));
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch(async error => {
    console.error('FAILED', error.message.slice(0, 300));
    if (global.tipsDump) await global.tipsDump('failure');
    process.exit(2);
});
