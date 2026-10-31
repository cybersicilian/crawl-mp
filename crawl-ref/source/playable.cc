/**
 * @file
 * @brief Report which species, jobs and combos are playable.
 */

#include "AppHdr.h"
#include "character-trait.h"
#include "coop-content.h"
#include "spl-util.h"

#include <algorithm>
#include <vector>

#include "json.h"
#include "json-wrapper.h"

#include "filter-enum.h"
#include "playable.h"
#include "jobs.h"
#include "ng-restr.h"
#include "newgame.h"
#include "newgame-def.h"
#include "item-prop.h"
#include "species.h"
#include "skills.h"
#include "state.h"
#include "stringutil.h" // to_string on Cygwin

string combo_type::abbr() const
{
    return string(species::get_abbrev(species)) + get_job_abbrev(job);
}

/* All non-disabled jobs */
static inline vector<job_type> all_jobs()
{
    vector<job_type> jobs;
    for (int i = 0; i < NUM_JOBS; ++i)
    {
        const auto job = static_cast<job_type>(i);
        if (job_is_removed(job))
            continue;
        if (job == JOB_DELVER && crawl_state.game_is_sprint())
            continue;
        jobs.push_back(job);
    }
    return jobs;
}

vector<job_type> playable_jobs()
{
    return all_jobs();
}

vector<species_type> playable_species()
{
    auto species = species::get_all_species();
    erase_if(species, [&](species_type sp) {
        return !species::is_starting_species(sp);
    });
    return species;
}

vector<combo_type> playable_combos()
{
    vector<combo_type> combos;
    for (const auto sp : playable_species())
        for (const auto job : playable_jobs())
            if (job_allowed(sp, job))
                combos.push_back(combo_type{sp, job});
    return combos;
}

template <typename Coll, typename S>
vector<string> stringify(const Coll &c, S stringify)
{
    vector<string> result;
    std::transform(c.begin(), c.end(), std::back_inserter(result), stringify);
    return result;
}

vector<string> playable_combo_names()
{
    return stringify(playable_combos(),
                     [](combo_type c) { return c.abbr(); });
}

// JSON output:

static JsonNode *_species_apts(species_type sp)
{
    JsonNode *apts(json_mkobject());
    for (int i = SK_FIRST_SKILL; i < NUM_SKILLS; ++i)
    {
        const skill_type sk(static_cast<skill_type>(i));
        const int apt(species_apt(sk, sp));
        if (apt != UNUSABLE_SKILL)
            json_append_member(apts, skill_name(sk), json_mknumber(apt));
    }
    return apts;
}

static JsonNode *_species_recommended_jobs(species_type sp)
{
    JsonNode *jobs(json_mkarray());
    for (const auto job : get_species_def(sp).recommended_jobs)
        json_append_element(jobs, json_mkstring(get_job_name(job)));
    return jobs;
}

static JsonNode *_species_modifiers(species_type sp)
{
    JsonNode *modifiers(json_mkobject());
    json_append_member(modifiers, "xp", json_mknumber(species::get_exp_modifier(sp)));
    json_append_member(modifiers, "hp", json_mknumber(species::get_hp_modifier(sp)));
    json_append_member(modifiers, "mp", json_mknumber(species::get_mp_modifier(sp)));
    json_append_member(modifiers, "wl", json_mknumber(species::get_wl_modifier(sp)));
    return modifiers;
}

static JsonNode *_species_metadata(species_type sp,
                                   species_type derives = SP_UNKNOWN)
{
    JsonNode *species(json_mkobject());
    json_append_member(species, "name", json_mkstring(species::name(sp)));
    json_append_member(species, "abbr", json_mkstring(species::get_abbrev(sp)));
    if (derives != SP_UNKNOWN)
    {
        json_append_member(species, "derives",
                           json_mkstring(species::name(derives)));
    }
    json_append_member(species, "apts", _species_apts(sp));
    json_append_member(species, "modifiers", _species_modifiers(sp));
    json_append_member(species, "recommended_jobs",
                       _species_recommended_jobs(sp));
    return species;
}

static JsonNode *_species_metadata_array()
{
    JsonNode *species(json_mkarray());
    for (const species_type sp : species::get_all_species())
    {
        const bool sub_drac = sp != SP_BASE_DRACONIAN && species::is_draconian(sp);
        const species_type derives = sub_drac ? SP_BASE_DRACONIAN : SP_UNKNOWN;
        json_append_element(species, _species_metadata(sp, derives));
    }
    return species;
}

static JsonNode *_job_recommended_species(job_type job)
{
    JsonNode *species(json_mkarray());
    for (const auto sp : job_recommended_species(job))
        json_append_element(species, json_mkstring(species::name(sp)));
    return species;
}

static JsonNode *_job_metadata(job_type job)
{
    JsonNode *job_json(json_mkobject());
    json_append_member(job_json, "name", json_mkstring(get_job_name(job)));
    json_append_member(job_json, "abbr", json_mkstring(get_job_abbrev(job)));
    json_append_member(job_json, "recommended_species",
                       _job_recommended_species(job));
    return job_json;
}

static JsonNode *_job_metadata_array()
{
    JsonNode *array(json_mkarray());
    for (job_type job : playable_jobs())
        json_append_element(array, _job_metadata(job));
    return array;
}

static JsonNode *_combo_array()
{
    JsonNode *array(json_mkarray());
    for (const string &combo_abbr : playable_combo_names())
        json_append_element(array, json_mkstring(combo_abbr));
    return array;
}

static const char *_starting_weapon_name(weapon_type weapon)
{
    return weapon == WPN_UNARMED ? "unarmed" : weapon_base_name(weapon);
}

static JsonNode *_starting_weapons_metadata()
{
    JsonNode *species_json(json_mkobject());
    for (const auto sp : playable_species())
    {
        JsonNode *jobs_json(json_mkobject());
        for (const auto job : playable_jobs())
        {
            if (job_allowed(sp, job) == CC_BANNED)
                continue;
            newgame_def ng;
            ng.species = sp;
            ng.job = job;
            JsonNode *entry(json_mkobject());
            JsonNode *trait_restrictions(json_mkobject());
            for (const auto trait : {character_trait::mummy, character_trait::zombie,
                                     character_trait::ghost})
            {
                const auto reason = check_trait(trait, sp, job);
                json_append_member(trait_restrictions, character_trait_name(trait),
                                   json_mkstring(trait_restriction_reason(reason)));
            }
            json_append_member(entry, "trait_restrictions", trait_restrictions);
            JsonNode *choices(json_mkarray());
            JsonNode *recommended(json_mkarray());
            for (const auto& choice : starting_weapon_choices(ng))
            {
                json_append_element(choices, json_mkstring(_starting_weapon_name(choice.first)));
                if (choice.second == CC_UNRESTRICTED)
                    json_append_element(recommended, json_mkstring(_starting_weapon_name(choice.first)));
            }
            json_append_member(entry, "choices", choices);
            json_append_member(entry, "recommended", recommended);
            const auto weapon = default_starting_weapon(ng);
            json_append_member(entry, "default", json_mkstring(
                weapon == WPN_UNKNOWN ? "" : _starting_weapon_name(weapon)));
            json_append_member(jobs_json, get_job_name(job), entry);
        }
        json_append_member(species_json, species::name(sp).c_str(), jobs_json);
    }
    return species_json;
}

/*! @brief Returns a JSON object (encoded as a string) of the form
 *         @code
 *           { "species": [...], "jobs": [...], "combos": [...] }
 *         @endcode
 *
 * Species are objects of the form:
 * @code
 *   { "name": "Vine Stalker", "abbr": "VS", "apts": {...}, "modifiers": {...} }
 * @endcode
 *
 * Jobs are objects of the form:
 * @code
 *   { "name": "Fire Elementalist", "abbr": "FE" }
 * @endcode
 *
 * Combos is an array of combo abbreviation strings.
 *
 * Aptitudes (apts) is an object of the form:
 * @code
 *   { "<skill-name>": <aptitude> }
 * @endcode
 *
 * Modifiers is an object of the form:
 * @code
 *   { "<modifier-name>": <modifier> }
 * @endcode
 * where <modifier-name>: hp, mp, exp, wl.
 */
string playable_metadata_json()
{
    init_spell_descs();
    JsonWrapper json(json_mkobject());
    json_append_member(json.node, "species", _species_metadata_array());
    json_append_member(json.node, "jobs", _job_metadata_array());
    json_append_member(json.node, "combos", _combo_array());
    json_append_member(json.node, "starting_weapons", _starting_weapons_metadata());
    JsonNode *multiplayer_spells = json_mkarray();
    for (int id = 0; id < NUM_SPELLS; ++id)
    {
        const auto spell = static_cast<spell_type>(id);
        if (coop_content::exclusive_spell(spell))
            json_append_element(multiplayer_spells, json_mkstring(spell_title(spell)));
    }
    json_append_member(json.node, "multiplayer_only_spells", multiplayer_spells);
    return json.to_string();
}
