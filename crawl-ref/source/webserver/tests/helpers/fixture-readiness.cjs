/* Preserve the original readiness bound and persist evidence before teardown. */
const fs = require('node:fs');
const path = require('node:path');

module.exports = async function fixtureReadiness(page, output, errors) {
    try {
        await page.waitForFunction(() => fixture.ready || fixture.errors.length);
    } catch (error) {
        const state = await page.evaluate(() => {
            const context = window.requirejs && requirejs.s.contexts._;
            return {
                fixture: window.fixture && {
                    ready: fixture.ready || false,
                    errors: fixture.errors,
                    keys: Object.keys(fixture)
                },
                readyState: document.readyState,
                modules: context && {
                    defined: Object.keys(context.defined),
                    pending: Object.entries(context.registry).map(([id, mod]) => ({
                        id, initialized: mod.inited, enabled: mod.enabled,
                        fetched: mod.fetched, error: mod.error && String(mod.error),
                        dependencies: (mod.depMaps || []).map(dep => dep && dep.id)
                    }))
                },
                images: Array.from(document.images).map(image => ({
                    id: image.id, src: image.getAttribute('src'),
                    complete: image.complete, width: image.naturalWidth,
                    height: image.naturalHeight
                })),
                resources: performance.getEntriesByType('resource').map(entry => ({
                    name: entry.name, duration: entry.duration,
                    bytes: entry.transferSize, status: entry.responseStatus
                }))
            };
        }).catch(diagnosticError => ({ diagnosticError: String(diagnosticError) }));
        fs.writeFileSync(path.join(output, 'readiness-failure.json'),
            JSON.stringify({ error: String(error), errors, state }, null, 2) + '\n');
        throw error;
    }
};
