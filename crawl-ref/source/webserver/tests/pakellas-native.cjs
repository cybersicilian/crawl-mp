/* Real disposable native game: workshop funding, cancellation and persistence. */
const fs = require('node:fs');
const path = require('node:path');
const source = process.env.PAKELLAS_TEST_SOURCE || path.resolve(__dirname, '../..');
const { assert, chromium, client, lua } =
    require(path.join(source, 'webserver/tests/multiplayer-native-client.cjs'));
const url = process.env.WEBTILES_URL || 'http://127.0.0.1:8956';
assert(['localhost', '127.0.0.1'].includes(new URL(url).hostname));
const out = process.env.PAKELLAS_PROOF_DIR || '/tmp/dcss-pakellas-proof';
fs.mkdirSync(out, { recursive: true });

const { runPakellasChecks } = require('./helpers/pakellas-checks.cjs');
const { preparePakellasGame } = require('./helpers/pakellas-bootstrap.cjs');

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const evidence = { url, checks: [], errors: [] };
    let host;
    try {
        host = await client(browser, url, 'H', evidence.errors);
        const recordId = await preparePakellasGame(host);
        await runPakellasChecks({ host, recordId, evidence, out,
            repayLoan: () => lua(host, 'you.gain_exp(2); crawl.redraw_stats()') });
    } finally {
        if (host && !evidence.passed) {
            evidence.messages = await host.page.locator('body').innerText().catch(() => 'Unavailable');
            await host.page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
        }
        fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
