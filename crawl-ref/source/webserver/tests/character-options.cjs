/* Verify staging choices against the executable, including restored content. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const source = path.resolve(__dirname, '../..');
const scripts = path.resolve(__dirname, '../static/scripts');
const native = JSON.parse(execFileSync(process.env.CRAWL_BINARY || path.join(source, 'crawl'), ['-playable-json'], { encoding: 'utf8' }));
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scripts, '../starting-weapons.json'), 'utf8')), native.starting_weapons);
let catalog, choices;
vm.runInNewContext(fs.readFileSync(path.join(scripts, 'character-catalog.js'), 'utf8'), { define: factory => { catalog = factory(); } });
vm.runInNewContext(fs.readFileSync(path.join(scripts, 'client-staging-data.js'), 'utf8'), { define: (_, factory) => { choices = factory(catalog); } });
const names = list => Array.from(list).sort();
assert.deepEqual(names(choices.DCSS_SPECIES), Object.keys(native.starting_weapons).sort());
assert.deepEqual(names(choices.DCSS_BACKGROUNDS), native.jobs.map(job => job.name).sort());
assert.equal(new Set(choices.DCSS_SPECIES).size, choices.DCSS_SPECIES.length);
assert(!choices.DCSS_SPECIES.includes('Djinn'));
assert(choices.DCSS_SPECIES.includes('Djinni'));
assert(choices.DCSS_SPECIES.includes('Tortle'), 'The release must expose Tortle in character creation');
assert(choices.DCSS_BACKGROUNDS.includes('Blood Liturgist'), 'The release must expose Blood Liturgist in character creation');
assert(choices.allowedJobs('Tortle').includes('Blood Liturgist'), 'Tortle Blood Liturgists must remain a legal starting build');
assert(!choices.DCSS_BACKGROUNDS.includes('Blood Hunter'));
assert(!choices.allowedJobs('Demigod').includes('Blood Liturgist'), 'Godless species cannot start worshipping Vorr');
assert.equal(catalog.jobs['Blood Liturgist'].abbr, 'BL');
assert.equal(catalog.jobs['Blood Liturgist'].category, 'Zealot');
assert.match(catalog.jobs['Blood Liturgist'].description, /worship Vorr/);
for (const [job, abbr] of [['Paladin', 'Pa'], ['Healer', 'He'],
                           ['Preacher', 'Pc'], ['Sage', 'Sa']]) {
    assert(choices.DCSS_BACKGROUNDS.includes(job), `${job} must be selectable`);
    assert.equal(catalog.jobs[job].abbr, abbr);
    assert.equal(catalog.jobs[job].category, 'Zealot');
    assert(catalog.jobs[job].recommended.length > 0);
    assert(!choices.allowedJobs('Demigod').includes(job), `${job} starts with a god`);
}
for (const trait of ['mummy', 'zombie', 'ghost']) {
    assert(catalog.species.Human.trait_restrictions.Preacher[trait],
        `Preachers cannot select the ${trait} trait`);
    assert.equal(catalog.species.Human.trait_restrictions.Sage[trait], '');
}
assert.match(catalog.jobs.Sage.description, /random spellbook/);
assert.deepEqual(Array.from(catalog.jobs.Sage.spells), ['Apportation'],
    'Sage catalog must not pretend its random starting library is fixed');
let gui;
vm.runInNewContext(fs.readFileSync(path.join(source, 'webserver/game_data/static/tileinfo-gui.js'), 'utf8'), {
    define: (_, factory) => { gui = factory({ TILEP_PLAYER_MAX: 0 }); }
});
const jobTileOffset = gui.LAST_JOB - gui.LAST_RECOMMENDED_JOB;
for (const job of ['PALADIN', 'HEALER', 'PREACHER', 'SAGE']) {
    assert(Number.isInteger(gui['JOB_' + job]), `${job} needs a native job tile`);
    assert.equal(gui['JOB_' + job] - gui['JOB_RECOMMENDED_' + job], jobTileOffset,
        `${job} recommended and normal job tiles must share the standard offset`);
}
assert.deepEqual(names(choices.allowedJobs('Djinn')), names(choices.allowedJobs('Djinni')));
const combos = new Set(native.combos);
for (const species of choices.DCSS_SPECIES) {
    const race = catalog.species[species];
    assert(race.tile && race.tile.src.startsWith('/static/player-tiles/'));
    const tile = path.join(source, 'webserver', race.tile.src);
    const bytes = fs.readFileSync(tile);
    assert(path.basename(tile).includes(createHash('sha256').update(bytes).digest('hex').slice(0, 12)));
    const expected = native.jobs.filter(job => combos.has(race.abbr + job.abbr)).map(job => job.name);
    assert.deepEqual(names(choices.allowedJobs(species)), expected.sort());
    const suggestions = choices.quickBuilds(species, '');
    assert(suggestions.length > 0 && suggestions.length <= 6);
    assert(suggestions.every(build => build.species === species && expected.includes(build.job)),
        'Species suggestions must preserve the species and offer legal backgrounds');
    for (const job of choices.DCSS_BACKGROUNDS) {
        const weapons = native.starting_weapons[species][job];
        if (expected.includes(job)) {
            assert(weapons, species + '/' + job + ' needs native weapon choices');
            assert.deepEqual(Array.from(new Set(weapons.recommended)), weapons.recommended);
            assert(weapons.recommended.every(weapon => weapons.choices.includes(weapon)));
        } else {
            assert.equal(weapons, undefined, species + '/' + job + ' must stay banned');
        }
        const normalized = choices.defaultJob(species, job);
        assert(choices.allowedJobs(species).includes(normalized));
        if (expected.includes(job)) assert.equal(normalized, job);
        const constrained = choices.quickBuilds(species, job);
        assert.equal(constrained.length, expected.includes(job) ? 1 : 0);
        assert(constrained.every(build => build.species === species && build.job === job),
            'Choosing both fields preserves even nonrecommended legal combinations');
    }
}
for (const job of choices.DCSS_BACKGROUNDS) {
    const suggestions = choices.quickBuilds('', job);
    assert(suggestions.length > 0 && suggestions.length <= 6);
    assert(suggestions.every(build => build.job === job && choices.allowedJobs(build.species).includes(job)),
        'Background suggestions must preserve the background and offer legal species');
}
assert.equal(choices.quickBuilds('Meteoran', '')[0].species, 'Meteoran');
assert.equal(choices.quickBuilds('Djinn', '')[0].species, 'Djinni', 'Aliases use the canonical species');
assert.deepEqual(choices.quickBuilds('', ''), choices.DCSS_ARCHETYPES);
const fighterWeapons = native.starting_weapons;
assert(!fighterWeapons.Kobold.Fighter.recommended.includes('rapier'), 'Fighter recommendations exclude stabbing weapons');
assert(fighterWeapons.Minotaur.Fighter.recommended.includes('war axe'));
assert.deepEqual(fighterWeapons.Felid.Berserker.recommended, ['unarmed']);
for (const preset of choices.DCSS_ARCHETYPES) {
    assert(choices.allowedJobs(preset.species).includes(preset.job));
    assert(preset.tipBody.includes(catalog.jobs[preset.job].description));
}
console.log(`Native character options passed: ${choices.DCSS_SPECIES.length} species, ${choices.DCSS_BACKGROUNDS.length} backgrounds, ${combos.size} legal combinations.`);
