#include "AppHdr.h"
#include "equipment-profile.h"

#include "character-preview.h"
#include "database.h"
#include "describe.h"
#include "end.h"
#include "env.h"
#include "format.h"
#include "item-name.h"
#include "invent.h"
#include "items.h"
#include "jobs.h"
#include "json-wrapper.h"
#include "newgame-def.h"
#include "newgame.h"
#include "ng-restr.h"
#include "ng-setup.h"
#include "options.h"
#include "output.h"
#include "party.h"
#include "package.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "skills.h"
#include "species.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "state.h"
#include "terrain.h"
#ifdef USE_TILE
#include "tiledoll.h"
#include "tiles.h"
#include "tilepick-p.h"
#include "rltiles/tiledef-player.h"
#endif

namespace
{
void number(JsonNode *object, const char *key, int value)
{
    json_append_member(object, key, json_mknumber(value));
}

void text(JsonNode *object, const char *key, const string &value)
{
    json_append_member(object, key, json_mkstring(value.c_str()));
}

string plain(const string &value)
{
    return formatted_string::parse_string(value).tostring();
}

JsonNode *spell_snapshot(spell_type spell)
{
    JsonNode *result = json_mkobject();
    text(result, "name", spell_title(spell));
    text(result, "description", plain(getLongDescription(string(spell_title(spell)) + " spell")));
    number(result, "level", spell_difficulty(spell));
    number(result, "mp_cost", spell_mana(spell));
    JsonNode *cost = json_mkobject();
    text(cost, "resource", you.has_mutation(MUT_HP_CASTING) ? "hp" : "mp");
    number(cost, "amount", spell_mana(spell));
    if (you.species == SP_IRIT)
        number(cost, "additional_hp", spell_additional_hp(spell, spell_mana(spell)));
    json_append_member(result, "casting_cost", cost);
    text(result, "schools", spell_schools_string(spell));
    text(result, "fail", failure_rate_to_string(raw_spell_fail(spell)));
    text(result, "power", spell_power_string(spell));
    text(result, "damage", spell_damage_string(spell, false, -1, true));
    text(result, "range", spell_range_string(spell));
    return result;
}

JsonNode *snapshot(int slot)
{
    player &p = party::get_player(slot);
    // Native queries may enter nested hero contexts. Keep the active slot and
    // `you` together so returning from those queries retains this hero.
    party::scoped_player_context context(slot, false);
    // Inspection queries get their own repeatable stream, independent of world
    // generation and creation. Reading a description cannot reroll the build.
    rng::subgenerator inspection_rng(party::starting_member(slot).starting_seed,
                                     0x7072657669657773ULL);
    // A neutral floor avoids applying terrain effects to an unplaced hero.
    p.set_position(coord_def(GXM / 2, GYM / 2));
    env.grid(p.pos()) = DNGN_FLOOR;
    JsonNode *result = json_mkobject();
    number(result, "slot", slot);
    json_append_member(result, "name", json_mkstring(p.your_name.c_str()));
    json_append_member(result, "species", json_mkstring(species::name(p.species)));
    json_append_member(result, "trait", json_mkstring(character_trait_name(get_character_trait(p))));
    json_append_member(result, "job", json_mkstring(get_job_name(p.char_class)));
    number(result, "xl", p.experience_level);
    number(result, "hp", p.hp_max);
    number(result, "mp", p.max_magic_points);
    text(result, "spell_resource", p.has_mutation(MUT_HP_CASTING) ? "hp" : "mp");
    number(result, "ac", p.armour_class_scaled(1));
    number(result, "ev", p.evasion_scaled(1));
    number(result, "sh", player_displayed_shield_class());
    number(result, "str", p.strength());
    number(result, "int", p.intel());
    number(result, "dex", p.dex());
    JsonNode *resists = json_mkobject();
    number(resists, "rF", p.res_fire());
    number(resists, "rC", p.res_cold());
    number(resists, "rPois", p.res_poison());
    number(resists, "rN", p.res_negative_energy());
    number(resists, "rElec", p.res_elec());
    number(resists, "rCorr", p.res_corr());
    number(resists, "Will", p.willpower());
    number(resists, "See invisible", p.can_see_invisible());
    json_append_member(result, "resists", resists);
    JsonNode *skills = json_mkobject();
    JsonNode *skill_details = json_mkobject();
    for (int skill = 0; skill < NUM_SKILLS; ++skill)
    {
        const auto type = static_cast<skill_type>(skill);
        const int level = p.skill(type, 10, false, false);
        if (level > 0)
        {
            json_append_member(skills, skill_name(type), json_mknumber(level / 10.0));
            JsonNode *entry = json_mkobject();
            text(entry, "description", plain(get_skill_description(type)));
            number(entry, "aptitude", species_apt(type, p.species));
            json_append_member(skill_details, skill_name(type), entry);
        }
    }
    json_append_member(result, "skills", skills);
    json_append_member(result, "skill_details", skill_details);
    JsonNode *inventory = json_mkarray();
    for (const auto &item : p.inv)
    {
        if (!item.defined())
            continue;
        JsonNode *entry = json_mkobject();
        number(entry, "slot", item.link);
        text(entry, "letter", string(1, item.slot));
        text(entry, "kind_name", item_class_name(item.base_type));
        json_append_member(entry, "name", json_mkstring(item.name(DESC_PLAIN, true, false, false).c_str()));
        json_append_member(entry, "equipped", json_mkbool(item_is_equipped(item)));
        text(entry, "description", plain(get_item_description(item)));
        json_append_element(inventory, entry);
    }
    json_append_member(result, "inventory", inventory);
    json_append_member(result, "equipment_profile", equipment_profile_json());
    JsonNode *spells = json_mkarray();
    for (const auto spell : p.spells)
        if (spell != SPELL_NO_SPELL)
            json_append_element(spells, json_mkstring(spell_title(spell)));
    json_append_member(result, "memorized", spells);
    JsonNode *library = json_mkarray();
    for (int spell = 0; spell < NUM_SPELLS; ++spell)
        if (p.spell_library[spell])
            json_append_element(library, json_mkstring(spell_title(static_cast<spell_type>(spell))));
    json_append_member(result, "library", library);
    JsonNode *spell_details = json_mkobject();
    for (int spell = 0; spell < NUM_SPELLS; ++spell)
    {
        const auto type = static_cast<spell_type>(spell);
        if (type == SPELL_NO_SPELL)
            continue;
        if (p.spell_library[spell] || find(p.spells.begin(), p.spells.end(), type) != p.spells.end())
            json_append_member(spell_details, spell_title(type), spell_snapshot(type));
    }
    json_append_member(result, "spell_details", spell_details);
#ifdef USE_TILE
    dolls_data doll;
    fill_player_equipment_doll(doll);
    vector<tile_def> packed;
    pack_tilep_set(packed, doll);
    JsonNode *layers = json_mkarray();
    for (const auto &layer : packed)
    {
        const tile_info &info = tile_player_info(layer.tile);
        JsonNode *entry = json_mkobject();
        number(entry, "tile", layer.tile);
        number(entry, "sx", info.sx);
        number(entry, "sy", info.sy);
        number(entry, "w", info.ex - info.sx);
        number(entry, "h", info.ey - info.sy);
        number(entry, "ox", info.offset_x);
        number(entry, "oy", info.offset_y);
        number(entry, "ymax", layer.ymax);
        json_append_element(layers, entry);
    }
    json_append_member(result, "doll", layers);
#endif
    return result;
}
}

std::string character_preview_json(const std::string &party_spec)
{
    Options.no_save = true;
    party::configure_from_arg(party_spec);
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        const auto &member = party::starting_member(slot);
        if (!species::is_starting_species(member.species)
            || !is_starting_job(member.job)
            || !job_allowed(member.species, member.job)
            || !member.starting_seed)
            end(1, false, "Invalid preview character\n");
    }
    const auto &lead = party::starting_member(0);
    newgame_def ng;
    ng.name = lead.name;
    ng.type = GAME_TYPE_NORMAL;
    ng.species = lead.species;
    ng.job = lead.job;
    ng.weapon = default_starting_weapon(ng);
    for (const auto &choice : starting_weapon_choices(ng))
        if (choice.first == lead.weapon)
            ng.weapon = lead.weapon;
    setup_game(ng, false);
    JsonWrapper root(json_mkobject());
    number(root.node, "version", 1);
    JsonNode *members = json_mkarray();
    for (int slot = 0; slot < party::player_count(); ++slot)
        json_append_element(members, snapshot(slot));
    json_append_member(root.node, "members", members);
    const string result = root.to_string();
    // setup_game(false) uses an in-memory package, shared by companions.
    // Release it through the normal party lifecycle before static teardown.
    if (party::get_player(0).save)
        party::get_player(0).save->abort();
    party::reset();
    return result;
}
