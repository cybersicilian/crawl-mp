/* Added controls use actual coloured PNG sprites; native game atlas art is separate. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const sprites = require('./helpers/ui-sprite-fixture.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.UI_GLYPH_PROOF_DIR || '/tmp/dcss-ui-16px-proof';
const roles = [
    'explore', 'autofight', 'rest', 'pickup', 'inventory', 'spells', 'abilities', 'powers', 'skills',
    'codex', 'overview', 'stairs-up', 'stairs-down', 'floor', 'inspect', 'camera', 'control',
    'cycle-hero', 'claim-hero', 'add-hero', 'signal', 'ping-look', 'ping-danger', 'ping-loot', 'ping-stairs',
    'filter-all', 'filter-equipped', 'filter-pack', 'inventory-open', 'armour', 'shield', 'evasion',
    'strength', 'intelligence', 'dexterity', 'experience', 'time', 'quiver', 'noise', 'contamination', 'doom',
    'slot-add', 'slot-clear', 'slot-missing', 'tray-expand', 'drag-panel', 'resize-panel', 'layout',
    'save', 'exit', 'search', 'zoom-in', 'zoom-out', 'zoom-reset', 'navigate', 'question',
    'coin', 'rune', 'equipped', 'level-cap', 'jewellery', 'scroll', 'wand', 'ammo', 'staff',
    'supplies', 'banes', 'bestiary', 'arcane-deck', 'compass-rose', 'compass-needle'
];
async function main() {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await sprites.install(page);
        await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><header>'
            + '<h1>Raven fantasy HUD icons</h1><p>Purchased source pixels · actual 16 / 32 / 48 px · retained controls marked separately</p>'
            + '</header><main id="glyphs"></main></body></html>');
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'static/tabletop/properties.css'), 'utf8') });
        await page.addStyleTag({ content: 'body{margin:0;padding:24px;background:#10171d;color:#d6c8a7;font:12px/1.4 system-ui}h1{margin:0 0 4px;font-size:24px}header p{margin:0 0 24px;color:#a9b1b5}#glyphs{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}.glyph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:88px;padding:7px 4px;background:#1a242c;border:1px solid #ab925a38;border-radius:3px}.samples{height:52px;display:flex;align-items:center;gap:8px}.glyph small{color:#8e9a9d;font-size:9px}.glyph strong{font-size:10px;letter-spacing:.02em;font-weight:500}.tt-icon{color:#dbc78f}.glyph[data-role="status"] .tt-icon{color:#b8d3b5}' });
        await page.evaluate(() => {
            window.modules = {};
            window.define = (deps, factory) => { window.modules[window.moduleName] = factory(...deps.map(dep => window.modules[dep])); };
        });
        for (const [name, file] of [['item-properties', 'static/scripts/item-properties.js'],
            ['status-icons', 'game_data/static/status-icons.js']]) {
            await page.evaluate(name => { window.moduleName = name; }, name);
            await page.addScriptTag({ path: path.join(root, file) });
        }
        const coverage = await page.evaluate(async roles => {
            const art = window.modules['item-properties'], status = window.modules['status-icons'];
            const names = art.iconNames(), missing = roles.filter(name => !art.hasIcon(name));
            const atlas = art.iconAtlas(), loaded = new Image();
            loaded.src = atlas.url;
            await new Promise((resolve, reject) => { loaded.onload = resolve; loaded.onerror = reject; });
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = atlas.size;
            const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingEnabled = false;
            const records = [], canonical = new Map();
            for (const name of names) {
                const svg = art.icon(name), key = svg.dataset.uiGlyph;
                if (!canonical.has(key)) canonical.set(key, []);
                canonical.get(key).push(name);
                const frame = Number(svg.dataset.uiSprite), x = frame % atlas.columns * atlas.size, y = Math.floor(frame / atlas.columns) * atlas.size;
                context.clearRect(0, 0, atlas.size, atlas.size); context.drawImage(loaded, x, y, atlas.size, atlas.size, 0, 0, atlas.size, atlas.size);
                const pixels = context.getImageData(0, 0, atlas.size, atlas.size).data, colors = new Set(), alphas = new Set();
                let left = atlas.size, top = atlas.size, right = -1, bottom = -1, opaque = 0, bright = 0;
                let silhouette = '';
                for (let index = 0; index < pixels.length; index += 4) {
                    alphas.add(pixels[index + 3]);
                    silhouette += pixels[index + 3] ? '1' : '0';
                    if (!pixels[index + 3]) continue;
                    opaque++;
                    if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) >= 140) bright++;
                    colors.add([...pixels.slice(index, index + 3)].join(','));
                    const px = (index / 4) % atlas.size, py = Math.floor(index / 4 / atlas.size);
                    left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
                }
                records.push({ name, key, frame, source: art.iconSprite(name), fingerprint: canvas.toDataURL(), rgba: btoa(String.fromCharCode(...pixels)), silhouette, opaque, bright, colors: colors.size,
                    alphas: [...alphas].sort(), bounds: { left, top, right, bottom } });
            }
            for (const [key, aliases] of canonical) {
                const card = document.createElement('section'); card.className = 'glyph';
                card.setAttribute('data-role', /poison|flame|frost|bolt|shield|speed|slow|wing|eye|moon|heart|skull|trait|silence|corrosion|confusion/.test(key) ? 'status' : 'action');
                const samples = document.createElement('div'); samples.className = 'samples';
                for (const size of [16, 32, 48]) {
                    const svg = art.icon(key); svg.style.width = svg.style.height = size + 'px'; samples.appendChild(svg);
                }
                const label = document.createElement('strong'); label.textContent = key;
                const sizes = document.createElement('small'); sizes.textContent = '16 · 32 · 48 px';
                card.title = aliases.join(', '); card.append(samples, label, sizes); document.getElementById('glyphs').appendChild(card);
            }
            const unsafe = [...document.querySelectorAll('svg')].filter(svg => {
                if (svg.namespaceURI !== 'http://www.w3.org/2000/svg' || svg.getAttribute('viewBox') !== '0 0 20 20') return true;
                return [...svg.querySelectorAll('*')].some(node => node.tagName !== 'image'
                    || node.getAttribute('href') !== atlas.url || node.style.imageRendering !== 'pixelated'
                    || [...node.attributes].some(attribute => !['href', 'x', 'y', 'width', 'height', 'style'].includes(attribute.name)));
            });
            const nativeRasterMismatches = [], scaledRasterMismatches = [];
            const embeddedAtlas = document.createElement('canvas'); embeddedAtlas.width = loaded.width; embeddedAtlas.height = loaded.height;
            embeddedAtlas.getContext('2d').drawImage(loaded, 0, 0);
            const embeddedUrl = embeddedAtlas.toDataURL();
            for (const key of canonical.keys()) {
                for (const scale of [1, 2, 3]) {
                    const size = atlas.size * scale, svg = art.icon(key); svg.setAttribute('width', size); svg.setAttribute('height', size);
                    svg.querySelector('image').setAttribute('href', embeddedUrl);
                    const rendered = new Image(); rendered.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
                    await new Promise((resolve, reject) => { rendered.onload = resolve; rendered.onerror = reject; });
                    const actual = document.createElement('canvas'), expected = document.createElement('canvas');
                    actual.width = actual.height = expected.width = expected.height = size;
                    actual.getContext('2d').drawImage(rendered, 0, 0, size, size);
                    const expectedContext = expected.getContext('2d'); expectedContext.imageSmoothingEnabled = false;
                    const frame = art.iconSprite(key); expectedContext.drawImage(loaded, frame.x, frame.y, frame.width, frame.height, 0, 0, size, size);
                    if (actual.toDataURL() !== expected.toDataURL()) (scale === 1 ? nativeRasterMismatches : scaledRasterMismatches).push({ key, scale });
                }
            }
            const unknown = art.icon('__proto__');
            return { missing, records, atlas, nativeRasterMismatches, scaledRasterMismatches, unsafe: unsafe.length, vectorPaths: document.querySelectorAll('svg path').length,
                unknown: unknown.dataset.uiGlyph,
                metadata: roles.every(name => art.icon(name).dataset.uiIcon === name),
                aliases: { fire: art.icon('fire').dataset.uiGlyph, drag: art.icon('drag-panel').dataset.uiGlyph },
                statuses: ['berserk', 'haste', 'petrify', 'frozen', 'invisible', 'confused', 'poisoned'].map(name => [name, status.resolve(name)]),
                parser: art.parse('+2 ring mail {rF++ Str+3 *Slow}') };
        }, roles);
        assert.deepEqual(coverage.missing, []);
        assert.equal(coverage.unsafe, 0);
        assert.equal(coverage.vectorPaths, 0, 'Visible icons contain PNG image frames, not recoloured vector outlines');
        assert.equal(coverage.atlas.size, 16);
        assert.deepEqual(coverage.nativeRasterMismatches, [], 'At 16px every wrapper pixel exactly matches its imported source frame');
        assert.deepEqual(coverage.scaledRasterMismatches, [], 'At 32px and 48px each native pixel remains an exact 2x2 or 3x3 block');
        assert(coverage.records.every(record => record.colors >= 2 && record.alphas.join(',') === '0,255'), 'Published pixel palettes and binary transparency survive import');
        assert(coverage.records.every(record => record.opaque > 0), 'Every canonical role remains visible, including small authored GUI glyphs');
        assert.equal(coverage.unknown, 'rune');
        assert(coverage.metadata, 'Requested semantic role stays stable even through aliases');
        assert.deepEqual(coverage.aliases, { fire: 'flame', drag: 'move' });
        assert.deepEqual(coverage.statuses.map(entry => entry[1]), ['blade', 'speed', 'chain', 'frost', 'moon', 'confusion', 'poison']);
        assert.deepEqual(coverage.parser.properties.map(entry => [entry.key, entry.value]), [['fire', '++'], ['strength', '+3'], ['slow', '']]);
        const byName = new Map(coverage.records.map(record => [record.name, record]));
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'static/ui-sprites/hud-sprites.json'), 'utf8'));
        const atlasBytes = fs.readFileSync(path.join(root, 'static/ui-sprites', manifest.file));
        assert.equal(path.posix.basename(coverage.atlas.url), manifest.file, 'Renderer and sprite asset manifest agree');
        assert(manifest.file.includes(crypto.createHash('sha256').update(atlasBytes).digest('hex').slice(0, 12)), 'Atlas URL changes with actual PNG pixels');
        assert.equal(manifest.ravenSprites + manifest.legacySprites, Object.keys(manifest.frames).length);
        assert.equal(manifest.ravenSprites, Object.values(manifest.sources).filter(source => source.pack !== 'legacy').length);
        assert.equal(manifest.license, 'LICENSE-RAVEN.txt');
        for (const record of coverage.records) {
            const frame = manifest.frames[record.key], provenance = manifest.sources[record.key];
            assert.equal(crypto.createHash('sha256').update(Buffer.from(record.rgba, 'base64')).digest('hex'),
                provenance.browserRgbaSha256, 'Browser pixels match imported source provenance: ' + record.key);
            assert(['direct', 'metaphor', 'fallback'].includes(provenance.meaning));
            assert.equal(frame.x, record.frame % coverage.atlas.columns * coverage.atlas.size);
            assert.equal(frame.y, Math.floor(record.frame / coverage.atlas.columns) * coverage.atlas.size);
            assert.deepEqual(record.source, { url: coverage.atlas.url, ...frame }, 'Canvas consumers resolve the same canonical native frame');
        }
        for (const group of [['inspect', 'camera', 'control', 'explore', 'ping-look'],
            ['inventory', 'pickup', 'inventory-open', 'filter-all', 'filter-equipped', 'filter-pack'],
            ['abilities', 'spells', 'skills', 'codex'], ['experience', 'spark', 'time', 'slow', 'noise', 'silence'],
            ['floor', 'stairs-up', 'stairs-down'], ['quiver', 'navigate'], ['coin', 'rune'],
            ['evasion', 'dexterity', 'strength', 'intelligence', 'shield', 'armour']])
            assert.equal(new Set(group.map(name => byName.get(name).fingerprint)).size, group.length, 'Distinct meanings need different actual sprite pixels: ' + group.join(', '));
        const clipped = coverage.records.filter(({ bounds }) => bounds.left < 0 || bounds.top < 0
            || bounds.right >= coverage.atlas.size || bounds.bottom >= coverage.atlas.size || bounds.right < bounds.left);
        assert.deepEqual(clipped, [], 'Published frames remain nonempty and inside their native tile');
        const files = ['hud-iconography.js', 'hud-inventory.js', 'party-progress.js', 'party-faith.js', 'party-card-status.js',
            'panel-workspace.js', 'viewport-zoom.js', 'quickbar.js', 'player-card-details.js', 'party-navigation.js'];
        const literalRequests = [];
        for (const file of files) {
            const source = fs.readFileSync(path.join(root, 'game_data/static', file), 'utf8');
            for (const match of source.matchAll(/\b(?:icons|properties)\.icon\(\s*["']([^"']+)["']/g))
                literalRequests.push({ file, name: match[1] });
        }
        const missingLiterals = literalRequests.filter(request => !byName.has(request.name));
        assert.deepEqual(missingLiterals, [], 'Added HUD callsites must resolve a registered symbol');
        const atlasName = path.posix.basename(coverage.atlas.url);
        fs.copyFileSync(path.join(root, 'static/ui-sprites', atlasName), path.join(output, atlasName));
        await page.evaluate(sources => {
            for (const card of document.querySelectorAll('.glyph')) {
                const key = card.querySelector('strong').textContent, source = sources[key];
                const retained = source.pack === 'legacy';
                card.querySelector('small').textContent += retained ? ' · retained' : ' · Raven';
                if (retained) card.style.borderColor = '#b89547';
            }
        }, manifest.sources);
        await page.screenshot({ path: path.join(output, 'hud-sprite-16px-contact-sheet.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'contact-sheet.html'), (await page.content()).replaceAll(coverage.atlas.url, './' + atlasName));
        await page.evaluate(sources => {
            document.querySelector('h1').textContent = 'Raven integration at 16px';
            document.querySelector('header p').textContent = 'Actual 16px art in 24px controls. Amber borders mark retained controls; hover for source and meaning.';
            const root = document.getElementById('glyphs'); root.replaceChildren(); root.style.display = 'block';
            const groups = [
                ['Personal statistics', ['armour', 'evasion', 'shield', 'strength', 'intelligence', 'dexterity']],
                ['Similar object checks', ['strength', 'quiver', 'abilities', 'intelligence', 'skull']],
                ['Inventory controls', ['inventory', 'filter-all', 'filter-equipped', 'filter-pack', 'inventory-open']],
                ['Inspect, view, act, travel', ['inspect', 'camera', 'control', 'navigate', 'explore', 'pickup']],
                ['Zoom', ['zoom-in', 'zoom-out', 'zoom-reset']],
                ['Action slots', ['slot-add', 'slot-clear', 'slot-missing', 'tray-expand']],
                ['Power and knowledge', ['spells', 'abilities', 'skills', 'codex', 'overview']],
                ['Party signals', ['signal', 'ping-look', 'ping-danger', 'ping-loot', 'ping-stairs']],
                ['Conditions', ['poison', 'flame', 'frost', 'heart', 'slow', 'chain', 'silence']],
                ['Core shapes', ['moon', 'bolt', 'danger', 'stairs-up', 'stairs-down', 'time']],
                ['Compasses', ['compass-rose', 'compass-needle']]
            ];
            for (const [title, names] of groups) {
                const section = document.createElement('section'); section.style.cssText = 'margin:0 0 22px;padding:12px;background:#151e25;border:1px solid #36404a';
                const heading = document.createElement('h2'); heading.textContent = title; heading.style.cssText = 'font-size:13px;margin:0 0 12px;color:#dbe3e7';
                const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px';
                for (const name of names) {
                    const item = document.createElement('div'); item.style.cssText = 'width:88px;display:flex;flex-direction:column;align-items:center;gap:7px';
                    const button = document.createElement('div'); button.style.cssText = 'width:24px;height:24px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#27323a;border:1px solid #56616b;border-radius:2px';
                    const icon = window.modules['item-properties'].icon(name); icon.style.width = icon.style.height = '16px';
                    const source = sources[icon.dataset.uiGlyph];
                    item.title = (source.pack === 'legacy' ? 'Retained control' : 'Raven: ' + source.file) + '\n' + source.note;
                    if (source.pack === 'legacy') button.style.borderColor = '#b89547';
                    button.appendChild(icon); const caption = document.createElement('code'); caption.style.cssText = 'font-size:9px;color:#c2cbd2;white-space:nowrap'; caption.textContent = name;
                    item.append(button, caption); row.appendChild(item);
                }
                section.append(heading, row); root.appendChild(section);
            }
        }, manifest.sources);
        await page.setViewportSize({ width: 800, height: 1100 });
        await page.screenshot({ path: path.join(output, 'optical-16px-groups.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'optical-16px-groups.html'), (await page.content()).replaceAll(coverage.atlas.url, './' + atlasName));
        fs.writeFileSync(path.join(output, 'coverage.json'), JSON.stringify({ ...coverage, literalRequests }, null, 2));
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, semanticRoles: roles.length, registeredNames: coverage.records.length,
            canonicalSprites: new Set(coverage.records.map(record => record.key)).size, ravenSprites: manifest.ravenSprites,
            retainedControls: manifest.legacySprites, realRgbaPixels: true, safeSvgImages: true,
            statusAndParserContracts: true, actualSizes: [16, 32, 48], output }));
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
