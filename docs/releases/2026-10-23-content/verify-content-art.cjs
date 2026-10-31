/* Verify actual served atlas pixels against the finished native source sprites. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

module.exports = async function verifyContentArt(page, out, ready) {
    const rows = [
        { atlas: 'feat', symbol: 'DNGN_ALTAR_VELLUM', placeholder: 'DNGN_ALTAR_ASHENZARI',
            source: 'rltiles/dngn/altars/vellum.png' },
        { atlas: 'gui', symbol: 'ABILITY_VELLUM_WEAVE', placeholder: 'ABILITY_ASHENZARI_CURSE',
            source: 'rltiles/gui/invocations/vellum_weave.png' }
    ];
    for (const [name, placeholder] of [['chain_devil', 'BASE_DEMONSPAWN'], ['eldritch', 'BASE_DEMIGOD']])
        rows.push({ atlas: 'player', symbol: 'BASE_' + name.toUpperCase(), placeholder,
            source: 'rltiles/player/base/' + name + '.png' });
    for (const name of ['chain_lash', 'reel_in', 'pinning_chain', 'release_chain', 'profane_altar', 'elder_rite'])
        rows.push({ atlas: 'gui', symbol: 'ABILITY_' + name.toUpperCase(),
            placeholder: 'ABILITY_RENOUNCE_RELIGION', source: 'rltiles/gui/abilities/' + name + '.png' });
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'overlay-manifest.json')));
    const references = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-art-pixels.json')));
    const result = {};
    for (const row of rows) {
        const png = fs.readFileSync(path.join(__dirname, 'merged-source', row.source));
        assert.equal(crypto.createHash('sha256').update(png).digest('hex'), manifest[row.source]);
        assert.equal(references[row.source].source_sha256, manifest[row.source]);
        await page.waitForFunction(atlas => performance.getEntriesByType('resource')
            .some(entry => new URL(entry.name).origin === location.origin
                && new URL(entry.name).pathname.endsWith('/' + atlas + '.png')),
            row.atlas, { timeout: 30000 });
        const url = await page.evaluate(atlas => performance.getEntriesByType('resource')
            .map(entry => entry.name).find(name => new URL(name).origin === location.origin
                && new URL(name).pathname.endsWith('/' + atlas + '.png')), row.atlas);
        assert(url, 'The native client must request the ' + row.atlas + ' atlas');
        const response = await page.request.get(url);
        assert(response.ok());
        const hash = crypto.createHash('sha256').update(await response.body()).digest('hex');
        assert.equal(hash, ready.content_atlases[row.atlas]);
        const pixels = await page.evaluate(async ({ row, url, encoded }) => {
            const name = Object.keys(require.s.contexts._.defined)
                .find(name => name.endsWith('/tileinfo-' + row.atlas));
            const tiles = require(name), index = tiles[row.symbol];
            if (!Number.isInteger(index) || index === tiles[row.placeholder])
                throw new Error('Missing distinct content tile registration: ' + row.symbol);
            const info = tiles.get_tile_info(index);
            const load = url => new Promise((resolve, reject) => {
                const image = new Image(); image.onload = () => resolve(image);
                image.onerror = reject; image.src = url;
            });
            const atlas = await load(url);
            const actualCanvas = document.createElement('canvas');
            const expectedCanvas = document.createElement('canvas');
            for (const canvas of [actualCanvas, expectedCanvas]) canvas.width = canvas.height = 32;
            const actualContext = actualCanvas.getContext('2d');
            const expectedContext = expectedCanvas.getContext('2d');
            actualContext.drawImage(atlas, info.sx, info.sy, info.ex-info.sx, info.ey-info.sy,
                info.ox, info.oy, info.ex-info.sx, info.ey-info.sy);
            // DCSS/libpng reads raw RGBA without source gamma/chromaticity conversion.
            const raw = Uint8ClampedArray.from(atob(encoded), ch => ch.charCodeAt(0));
            expectedContext.putImageData(new ImageData(raw, 32, 32), 0, 0);
            const actual = actualContext.getImageData(0, 0, 32, 32).data;
            const reference = expectedContext.getImageData(0, 0, 32, 32).data;
            let mismatches = 0;
            for (let i = 0; i < actual.length; i += 4) {
                if (actual[i+3] !== reference[i+3]) ++mismatches;
                for (let channel = 0; channel < 3; ++channel)
                    if (Math.round(actual[i+channel]*actual[i+3]/255)
                        !== Math.round(reference[i+channel]*reference[i+3]/255)) ++mismatches;
            }
            return { index, info, mismatches, png: actualCanvas.toDataURL('image/png').split(',')[1] };
        }, { row, url, encoded: references[row.source].raw_rgba_base64 });
        fs.writeFileSync(path.join(out, row.symbol.toLowerCase() + '.png'), Buffer.from(pixels.png, 'base64'));
        assert.equal(pixels.mismatches, 0, row.symbol + ' must match the finished sprite pixel for pixel');
        delete pixels.png;
        result[row.symbol] = { ...pixels, atlas_sha256: hash, source_sha256: manifest[row.source] };
    }
    return result;
};
