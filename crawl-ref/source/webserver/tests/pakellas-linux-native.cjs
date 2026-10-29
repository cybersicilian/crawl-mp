/* Controlled saved-wizard fixture on the exact NOWIZARD candidate; no setup commands. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.env.PAKELLAS_TEST_SOURCE || path.resolve(__dirname, '../..');
const { assert, chromium, clientAs, send, key, state, ready, resetPackets } =
    require(process.env.PAKELLAS_TEST_CLIENT || path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
const { settle, runPakellasChecks } = require('./helpers/pakellas-checks.cjs');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestPath = process.env.PAKELLAS_FIXTURE_MANIFEST;
assert(manifestPath, 'An operator-bound disposable fixture manifest is required');
const fixture = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const candidate = process.env.PAKELLAS_EXPECTED_BINARY_SHA256;
const runtime = process.env.PAKELLAS_EXPECTED_RUNTIME;
assert.match(candidate || '', /^[a-f0-9]{64}$/, 'Bind the exact candidate binary');
assert.equal(path.dirname(runtime || ''), '/tmp', 'Bind a disposable runtime');
assert(path.basename(runtime).startsWith('dcss-pk'));
assert.equal(fixture.schema, 1);
assert.equal(fixture.wizardFixture, true);
assert.equal(fixture.candidateBinarySha256, candidate);
assert.equal(fixture.runtime, runtime);
assert.equal(fixture.importerBase, path.join(runtime, 'library'));
assert.equal(fixture.xpTarget.monster, 'orc');
assert.equal(fixture.xpTarget.direction, 'h');
assert(fixture.xpTarget.nativeExperience >= 2 && fixture.xpTarget.nativeExperience <= 8);
assert.equal(fixture.xpTarget.savedCondition, 'paralysed');
assert.deepEqual(fixture.xpTarget.offset, { x: -1, y: 0 });
assert.match(fixture.sourceRecordId || '', /^[a-f0-9-]{36}$/);
assert.equal(typeof clientAs, 'function', 'Use the bound consumer helper, preserving the candidate tree');
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8914';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const infoPath = path.join(fixture.runtime, 'run-info.json');
const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
assert.equal(info.binary_sha256, candidate);
assert.equal(sha(path.join(info.build, 'crawl')), candidate);
const imported = path.resolve(fixture.importedSavePath);
assert(imported.startsWith(path.join(fixture.importerBase, 'saves') + path.sep));
assert(!fs.lstatSync(imported).isSymbolicLink());
assert.equal(sha(imported), fixture.saveSha256);
assert.equal(sha(fixture.sourceSavePath), fixture.saveSha256);
const out = process.env.PAKELLAS_PROOF_DIR || path.join(fixture.runtime, 'proof');
fs.mkdirSync(out, { recursive: true });

(async () => {
    const options = { headless: true };
    if (process.env.PAKELLAS_BROWSER_EXECUTABLE)
        options.executablePath = process.env.PAKELLAS_BROWSER_EXECUTABLE;
    const browser = await chromium.launch(options);
    const evidence = { url, checks: [], errors: [], controlledWizardFixture: true,
        manifestSha256: sha(manifestPath), fixtureSaveSha256: fixture.saveSha256,
        runtimeInfoSha256: sha(infoPath), candidateBinarySha256: candidate };
    let host;
    try {
        host = await clientAs(browser, url, fixture.username, 0, evidence.errors);
        const page = host.page;
        // Imported library rows are new; the native package retains its saved
        // game identity. Retain both acknowledgements outside the packet ring.
        await page.evaluate(() => {
            window.pakellasLoadIdentity = { library: null, native: null };
            const comm = require('comm'), original = comm.handle_message;
            comm.handle_message = function (packet) {
                const kind = packet.msg === 'game_started' ? 'library'
                    : packet.msg === 'record_identity' ? 'native' : null;
                if (kind) window.pakellasLoadIdentity[kind] = JSON.parse(JSON.stringify(packet));
                return original.apply(this, arguments);
            };
        });
        await send(page, 'library_load', { id: fixture.recordId });
        await page.waitForFunction(id => window.pakellasLoadIdentity.library?.expedition_id === id, fixture.recordId);
        await page.waitForFunction(() => window.crawl_party?.state?.members?.[0]?.god === 'Pakellas');
        await ready(page);
        assert.equal((await state(page)).members[0].name, fixture.username);
        await page.waitForFunction(() => document.body.innerText.includes('*WIZARD*'));
        await page.waitForFunction(id => window.pakellasLoadIdentity.native?.game_id === id, fixture.sourceRecordId);
        evidence.loadedIdentity = await page.evaluate(() => window.pakellasLoadIdentity);
        assert.equal(evidence.loadedIdentity.library.game_id, fixture.mode);
        const position = (await state(page)).members[0].pos;
        evidence.loadedHeroPosition = position;
        await send(page, 'click_cell', { x: position.x - 1, y: position.y, button: 3 });
        await page.getByRole('tab', { name: 'Status', exact: true }).click();
        await page.waitForFunction(() => /\borc\b/i.test(document.body.innerText)
            && /paralysed/i.test(document.body.innerText));
        evidence.preparedTargetDescription = await page.locator('body').innerText();
        await key(page, 27);
        await ready(page);
        await runPakellasChecks({ host, recordId: fixture.recordId, evidence, out,
            repayLoan: async ({ hero, wand }) => {
                await resetPackets(host);
                const initial = (await wand()).description;
                let attempts = 0;
                while ((await wand()).description === initial && attempts < 12) {
                    const before = await hero();
                    await key(page, 104); // Native h: attack the adjacent prepared hostile orc.
                    await page.waitForFunction(turns => window.crawl_party.state.members[0].turns > turns, before.turns);
                    await settle(page);
                    ++attempts;
                }
                await page.waitForFunction(() => window.qaPackets.some(packet =>
                    packet.msg === 'msgs' && packet.messages?.some(message =>
                        /You kill the orc|The orc dies/i.test(message.text.replace(/<[^>]*>/g, '')))));
                evidence.xpAward = { source: 'Native melee kill of prepared hostile orc', attempts,
                    before: initial, after: (await wand()).description };
            } });
        assert.equal(sha(fixture.sourceSavePath), fixture.saveSha256);
        assert.equal(sha(path.join(info.build, 'crawl')), candidate);
    } catch (error) {
        evidence.passed = false;
        throw error;
    } finally {
        if (host && !evidence.passed) {
            evidence.loadedIdentity = await host.page.evaluate(() => window.pakellasLoadIdentity).catch(() => null);
            evidence.messages = await host.page.locator('body').innerText().catch(() => 'Unavailable');
            await host.page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
        }
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
