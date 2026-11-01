/* Persist observations from a real runtime without replacing its rule inputs. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createLiveRuleProof({ name, read, capture, timeout = 8000,
    output = fs.mkdtempSync(path.join(os.tmpdir(), 'live-rule-proof-')) }) {
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    function save() {
        const provenIds = [...new Set(results.filter(result => result.pass).flatMap(result => result.wanted))].sort();
        fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify({
            version: 1, kind: 'native-data-rule-eligibility', provenIds, results,
            scope: 'Live rule eligibility; each result separately records cards visible at observation time.'
        }, null, 2));
    }
    async function expect(page, name, wanted, absent = []) {
        const deadline = Date.now() + timeout;
        let found = [];
        do {
            found = await read(page);
            if (wanted.every(id => found.includes(id))) break;
            await page.waitForTimeout(250);
        } while (Date.now() < deadline);
        const missing = wanted.filter(id => !found.includes(id));
        const wrong = absent.filter(id => found.includes(id));
        const pass = !missing.length && !wrong.length;
        const observation = await capture(page);
        results.push({ name, pass, wanted, absent, found, missing, wrong, observation });
        save();
        console.log((pass ? 'ok   ' : 'FAIL ') + name
            + (missing.length ? ' missing ' + missing : '') + (wrong.length ? ' unexpected ' + wrong : ''));
    }
    async function failure(page, error) {
        results.push({ name: 'Fixture stopped before its next assertion', pass: false,
            wanted: [], absent: [], found: [], error, observation: await capture(page) });
        save();
    }
    return { results, expect, failure, save, output };
}

module.exports = { createLiveRuleProof };
