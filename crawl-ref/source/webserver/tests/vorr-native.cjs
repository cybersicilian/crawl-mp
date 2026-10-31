/* Disposable native game: worship, sparse grants, blood, one target flow and movement. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { assert, chromium, client, send, key, state, ready, lua } = require('./multiplayer-native-client.cjs');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8942';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.VORR_PROOF_DIR || '/tmp/vorr-native-proof';
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const evidence = { url, checks: [], errors: [] };
    evidence.binary_sha256 = crypto.createHash('sha256')
        .update(fs.readFileSync(path.resolve(__dirname, '../../crawl'))).digest('hex');
    let host;
    const check = name => { evidence.checks.push(name); console.log(name); };
    try {
        host = await client(browser, url, 'H', evidence.errors);
        const page = host.page;
        const hero = async () => (await state(page)).members[0];
        const settle = async () => {
            for (let i = 0; i < 8; ++i) {
                await page.waitForFunction(() => {
                    const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
                    return /--more--|Increase \(S\)trength/.test(document.body.innerText) || (name && require(name).ready());
                });
                if (await page.evaluate(() => {
                    const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/workflow-actions'));
                    return name && require(name).ready();
                })) return ready(page);
                const text = await page.locator('body').innerText();
                if (!/--more--|Increase \(S\)trength/.test(text)) return ready(page);
                await key(page, text.includes('--more--') ? 32 : 83);
                await page.waitForTimeout(80);
            }
            throw new Error('Too many native acknowledgements');
        };
        await page.locator('#lobby_home [data-lobby-create]').click();
        const leader = page.locator('.party-slot-box[data-slot="0"]');
        await leader.locator('.party-slot-species').selectOption('Human');
        await leader.locator('.party-slot-job').selectOption('Fighter');
        for (const slot of [1, 2, 3])
            await page.locator(`.party-slot-box[data-slot="${slot}"] [data-mode="closed"]`).click();
        await page.locator('#btn_launch_party_room').click();
        await page.waitForFunction(() => window.crawl_party?.state?.members?.length === 1);
        await ready(page);
        await lua(host, 'debug.disable("spawns",true); debug.disable("mon_act",true); dgn.dismiss_monsters("harmful"); for x=30,52 do for y=25,45 do dgn.grid(x,y,"floor") end end; you.moveto(40,35)');
        await key(page, 38); await key(page, 95);
        const prompt = page.locator('#messages .game_message input:visible, #input_dialog input:visible').last();
        await prompt.fill('Vorr'); await prompt.press('Enter');
        await page.waitForFunction(() => window.crawl_party.state.members[0].god === 'Vorr');
        await key(page, 32);
        await ready(page);
        evidence.ranks = [];
        for (const piety of [30, 50, 75, 100, 120, 160]) {
            await lua(host, `you.piety(${piety}); crawl.redraw_stats()`);
            const current = await hero();
            const abilities = current.abilities.filter(entry => entry.id >= 1320 && entry.id <= 1322);
            assert.equal(abilities.length, piety < 75 ? 1 : piety < 120 ? 2 : 3);
            assert(abilities.every(entry => entry.tile > 0 && /Blood/.test(entry.cost)));
            evidence.ranks.push({ piety, rank: current.piety_rank, abilities: abilities.map(entry => entry.name) });
        }
        check('Native worship exposes rites only at one, three and five stars');
        const plinth = page.locator('[data-faith-god="VORR"]').first();
        await plinth.waitFor();
        assert.equal(await plinth.locator('.party-faith').getAttribute('data-faith-art'), 'native');
        await plinth.screenshot({ path: path.join(out, 'vorr-live-plinth.png') });
        check('Live hero portrait uses the Vorr plinth and native altar pixels');

        await lua(host, 'qa_mon=dgn.create_monster(41,35,"ogre"); qa_mon.set_max_hp(100); qa_mon.set_hp(1); crawl.redraw_view()');
        for (let i = 0; i < 20 && (await hero()).ritual_blood < 4; ++i) {
            const turns = (await hero()).turns;
            await key(page, 108);
            await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, turns);
            await settle();
        }
        assert((await hero()).ritual_blood >= 4, 'A real melee kill supplies ritual blood');
        check('Native combat and deferred death effects create finite visible blood');
        const walkingTurn = (await hero()).turns;
        await key(page, 108);
        await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, walkingTurn);
        await settle();
        const before = await hero();
        const destination = await page.evaluate(({ x, y }) => {
            const name = Object.keys(require.s.contexts._.defined).find(name => name.endsWith('/map_knowledge'));
            const map = require(name);
            for (let cx = x - 2; cx <= x + 2; ++cx)
                for (let cy = y - 2; cy <= y + 2; ++cy)
                    if ((cx !== x || cy !== y) && (map.get(cx, cy)?.t?.ritual_blood & 3))
                        return { x: cx, y: cy };
            return null;
        }, before.pos);
        assert(destination, 'The corpse spills beyond its saturated origin');
        const passage = before.abilities.find(entry => entry.name === 'Red Passage');
        assert.equal(passage.blocked_reason, '');
        await send(page, 'power_action', { expected_slot: 0, id: passage.id,
            kind: 'ability', letter: passage.hotkey });
        await page.waitForFunction(() => Object.keys(require.s.contexts._.defined)
            .some(name => name.endsWith('/game') && require(name).can_target()));
        await send(page, 'click_cell', { x: destination.x, y: destination.y, button: 1 });
        await page.waitForFunction(destination => {
            const current = window.crawl_party.state.members[0];
            return current.pos.x === destination.x && current.pos.y === destination.y;
        }, destination);
        await ready(page);
        const after = await hero();
        assert.equal(after.ritual_blood, before.ritual_blood - 2);
        evidence.passage = { before: { ...before.pos, blood: before.ritual_blood },
            after: { ...after.pos, blood: after.ritual_blood } };
        check('Red Passage targets once, consumes both endpoints and completes native movement');
        await page.screenshot({ path: path.join(out, 'vorr-native-game.png'), fullPage: true });
        assert.deepEqual(evidence.errors, []);
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
