/* Produce an explicitly wizard-marked, disposable native save; never edit package bytes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const source = process.env.PAKELLAS_TEST_SOURCE || path.resolve(__dirname, '../..');
const { assert, chromium, client, send, key, state, ready, lua } =
    require(process.env.PAKELLAS_TEST_CLIENT || path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
const { preparePakellasGame } = require('./helpers/pakellas-bootstrap.cjs');
const config = JSON.parse(fs.readFileSync(process.env.PAKELLAS_FIXTURE_CONFIG, 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(config.sourceBinarySha256, 'e8922833696f19e5e03d88572decf1889732923fdf976e3cd15880dae750d17b');
assert.equal(sha(path.join(source, 'crawl')), config.sourceBinarySha256);
assert(path.resolve(config.runtime).startsWith('/private/tmp/dcss-pakellas-fixture-'));
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8956';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.PAKELLAS_PROOF_DIR;
assert(out);
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const evidence = { url, controlledWizardFixture: true, errors: [], checks: [] };
    let host;
    try {
        host = await client(browser, url, 'H', evidence.errors);
        const page = host.page;
        const recordId = await preparePakellasGame(host);
        await lua(host, 'local target=assert(dgn.create_monster(39,35,"orc"),"XP target creation failed"); target.set_hp(1); target.add_ench("paralysis",30000); crawl.mpr("PAKELLAS_FIXTURE_PROBE kind="..target.type_name.." hp="..target.hp.." dx="..target.x.." dy="..target.y.." XP="..target.experience.." hostile="..tostring(not target.wont_attack)); assert(target.type_name=="orc","XP target type"); assert(target.hp==1,"XP target HP"); assert(target.x==-1 and target.y==0,"XP target position"); assert(target.experience>=2 and target.experience<=8,"XP target native XP must be 2..8"); assert(not target.wont_attack,"XP target attitude"); crawl.mpr("PAKELLAS_FIXTURE orc hp=1 paralysis=30000 hostile XP="..target.experience)');
        const targetExperience = await page.evaluate(() => {
            const line = window.qaPackets.flatMap(packet => packet.messages || [])
                .map(message => message.text).find(text => /PAKELLAS_FIXTURE orc.*XP=\d+/.test(text));
            return Number(line?.match(/XP=(\d+)/)?.[1]);
        });
        assert(targetExperience >= 2 && targetExperience <= 8);
        const hero = (await state(page)).members[0];
        assert.equal(hero.piety, 200);
        assert.equal(hero.god, 'Pakellas');
        assert(!hero.abilities.some(entry => entry.name.includes('Field Kit')));
        const wands = hero.inventory.filter(item => item.name.includes('wand of flame'));
        assert.equal(wands.length, 1);
        assert.match(wands[0].name, /\(6\)/);
        await page.waitForFunction(() => document.body.innerText.includes('*WIZARD*'));
        await send(page, 'click_cell', { x: hero.pos.x - 1, y: hero.pos.y, button: 3 });
        await page.getByRole('tab', { name: 'Status', exact: true }).click();
        await page.waitForFunction(() => /\borc\b/i.test(document.body.innerText) && /paralysed/i.test(document.body.innerText));
        await page.screenshot({ path: path.join(out, 'fixture-target.png'), fullPage: true });
        await key(page, 27); await ready(page);
        await send(page, 'record_save', { exit: true });
        await page.locator('#lobby_navigation').waitFor({ state: 'visible' });
        const query = 'import json,sys; sys.path.insert(0,sys.argv[1]); from webtiles.game_library import get_game; print(json.dumps(get_game(sys.argv[3],base_dir=sys.argv[2])))';
        const nativeEnv = { ...process.env, CRAWL_DIR: path.join(config.runtime, 'native-defaults'),
            CRAWL_RC: path.join(config.runtime, 'native-defaults/init.txt'),
            CRAWL_SAVE_DIR: path.join(config.runtime, 'native-defaults/saves'),
            CRAWL_LIBRARY_DIR: path.join(config.runtime, 'library') };
        const record = JSON.parse(execFileSync(config.python, ['-c', query,
            path.join(source, 'webserver'), path.join(config.runtime, 'library'), recordId],
        { encoding: 'utf8', env: nativeEnv, timeout: 10000 }));
        assert.equal(record.owner, host.username);
        const save = path.join(record.save_dir, host.username + '.cs');
        assert(path.resolve(save).startsWith(path.join(config.runtime, 'library/saves') + path.sep));
        assert(!fs.lstatSync(save).isSymbolicLink());
        const payload = path.join(out, 'payload');
        fs.mkdirSync(path.join(payload, 'saves'), { recursive: true });
        const destination = path.join(payload, 'saves', host.username + '.cs');
        fs.copyFileSync(save, destination, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(destination, 0o444);
        const version = execFileSync(path.join(source, 'crawl'), ['-save-version', destination],
            { encoding: 'utf8', env: nativeEnv, timeout: 10000 });
        assert.match(version, / is 34\.345\s*$/);
        const metadata = JSON.parse(execFileSync(path.join(source, 'crawl'), ['-save-json', destination],
            { encoding: 'utf8', env: nativeEnv, timeout: 10000 }));
        assert(Object.values(metadata).some(entry => entry.loadable && entry.name === host.username));
        const fixture = { schema: 1, wizardFixture: true, username: host.username,
            sourceBinarySha256: config.sourceBinarySha256, sourceBindingSha256: config.sourceBindingSha256,
            sourceFlags: 'WEBTILES=y C++17 NO_OPTIMIZE=y; wizard-enabled fixture setup',
            sourceRecordId: recordId, mode: record.mode, party: JSON.parse(record.party_json),
            saveFile: 'saves/' + host.username + '.cs', saveSha256: sha(destination),
            saveVersion: '34.345', nativeMetadata: metadata, versionOutput: version,
            god: hero.god, piety: hero.piety, gift: wands[0], sourceHeroPosition: hero.pos,
            xpTarget: { monster: 'orc', nativeExperience: targetExperience, hp: 1, savedCondition: 'paralysed', duration: 30000,
                direction: 'h', offset: { x: -1, y: 0 }, worldPosition: { x: 39, y: 35 } } };
        fs.writeFileSync(path.join(payload, 'fixture.json'), JSON.stringify(fixture, null, 2), { flag: 'wx', mode: 0o444 });
        assert.deepEqual(evidence.errors, []);
        evidence.fixture = fixture;
        evidence.checks.push('One six-charge kit, piety200, visible wizard marker, adjacent hostile one-HP paralysed XP orc; native save export/header read only');
        evidence.passed = true;
    } finally {
        if (host && !evidence.passed) {
            evidence.messages = await host.page.locator('body').innerText().catch(() => 'Unavailable');
            await host.page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
        }
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
