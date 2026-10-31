const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scripts = path.resolve(__dirname, '../static/scripts');
let catalog, choices;
vm.runInNewContext(fs.readFileSync(path.join(scripts, 'character-catalog.js'), 'utf8'), {
    define: factory => { catalog = factory(); }
});
vm.runInNewContext(fs.readFileSync(path.join(scripts, 'client-staging-data.js'), 'utf8'), {
    define: (_, factory) => { choices = factory(catalog); }
});

const eligible = Array.from(choices.DCSS_SPECIES).filter(species =>
    choices.allowedJobs(species).some(job => choices.DCSS_BACKGROUNDS.includes(job)));
for (let index = 0; index < eligible.length; index++) {
    for (const jobRoll of [0, 0.999999]) {
        const rolls = [(index + 0.5) / eligible.length, jobRoll];
        const build = choices.randomBuild(() => rolls.shift());
        const jobs = Array.from(choices.allowedJobs(build.species)).filter(job => choices.DCSS_BACKGROUNDS.includes(job));
        assert.equal(build.species, eligible[index]);
        assert.equal(build.job, jobRoll === 0 ? jobs[0] : jobs[jobs.length - 1]);
    }
}
console.log(`Random builds passed for ${eligible.length} selectable species.`);
