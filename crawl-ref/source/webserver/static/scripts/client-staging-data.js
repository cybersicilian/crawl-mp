/* Native creation choices and recommendations; the initial pairings are curated. */
define(["character-catalog"], function (catalog) {
    "use strict";
    var species = Object.keys(catalog.species).filter(function (name) {
        var entry = catalog.species[name];
        return entry.selectable && entry.name === name;
    }).sort();
    var jobs = Object.keys(catalog.jobs).sort();
    var archetypes = [
        ["Minotaur", "Fighter"], ["Deep Elf", "Conjurer"],
        ["Gargoyle", "Earth Elementalist"], ["Mountain Dwarf", "Berserker"],
        ["Spriggan", "Enchanter"], ["Demigod", "Alchemist"]
    ].map(function (pair) { return quickBuild(pair[0], pair[1]); });
    function quickBuild(speciesName, jobName) {
        var race = catalog.species[speciesName], job = catalog.jobs[jobName];
        return {
            species: race.name, job: job.name,
            tipTitle: race.name + " " + job.name + " · " + race.abbr + job.abbr,
            tipBody: race.description + "\n\n" + job.description,
            tipMeta: "Quick build · " + job.category + " · Read the guides for traits and starting spell access"
        };
    }
    function allowedJobs(name) {
        var race = catalog.species[name];
        return race ? race.allowed_jobs || [] : [];
    }
    function defaultJob(name, current) {
        var allowed = allowedJobs(name);
        if (allowed.indexOf(current) !== -1) return current;
        var race = catalog.species[name];
        return ((race && race.recommended) || []).find(function (job) {
            return allowed.indexOf(job) !== -1;
        }) || allowed[0] || "";
    }
    function randomBuild(random) {
        random = random || Math.random;
        var candidates = species.filter(function (name) {
            return allowedJobs(name).some(function (job) { return jobs.indexOf(job) !== -1; });
        });
        if (!candidates.length) return null;
        var name = candidates[Math.floor(random() * candidates.length)];
        var legalJobs = allowedJobs(name).filter(function (job) { return jobs.indexOf(job) !== -1; });
        return { species: name, job: legalJobs[Math.floor(random() * legalJobs.length)] };
    }
    function quickBuilds(speciesName, jobName) {
        var race = catalog.species[speciesName], job = catalog.jobs[jobName];
        if (!race && !job) return archetypes;
        if (race && job) return allowedJobs(race.name).indexOf(job.name) !== -1
            ? [quickBuild(race.name, job.name)] : [];
        var candidates = race ? race.recommended || [] : (job.recommended || []).map(function (name) {
            return catalog.species[name] ? catalog.species[name].name : name;
        });
        function legal(name) {
            return race ? jobs.indexOf(name) !== -1 && allowedJobs(race.name).indexOf(name) !== -1
                : species.indexOf(name) !== -1 && allowedJobs(name).indexOf(job.name) !== -1;
        }
        candidates = candidates.filter(legal);
        if (!candidates.length) candidates = (race ? jobs : species).filter(legal);
        return Array.from(new Set(candidates)).slice(0, 6).map(function (name) {
            return race ? quickBuild(race.name, name) : quickBuild(name, job.name);
        });
    }
    return {
        DCSS_SPECIES: species, DCSS_BACKGROUNDS: jobs, DCSS_ARCHETYPES: archetypes,
        allowedJobs: allowedJobs, defaultJob: defaultJob, quickBuilds: quickBuilds, randomBuild: randomBuild
    };
});
