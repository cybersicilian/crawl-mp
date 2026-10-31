/**
 * @file
 * @brief Machine-readable statistics for the WebTiles /stats pages.
 *
 * See docs/stats.md for the binding contract. Two halves:
 *   1. stats_reference_json(): `crawl -stats-json`, a dump of the engine's
 *      own data tables (monsters, items, spells, species, jobs, gods...).
 *   2. hero snapshots appended to stats_events.jsonl on every save and at
 *      game end, one line per party hero.
 *
 * Nothing in here may consume the gameplay RNG or alter the save format, and
 * snapshot writing must never crash or block the game.
 */

#include "AppHdr.h"

#include "stats-json.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <map>
#include <set>
#include <vector>

#include "json.h"
#include "json-wrapper.h"

#include "ability.h"
#include "artefact.h"
#include "branch.h"
#include "branch-data-json.h"
#include "chardump.h"
#include "colour.h"
#include "database.h"
#include "describe.h"
#include "fight.h"
#include "game-record.h"
#include "god-type.h"
#include "hiscores.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "jobs.h"
#include "kills.h"
#include "mon-book.h"
#include "mon-tentacle.h"
#include "mon-util.h"
#include "mutation.h"
#include "options.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "playable.h"
#include "religion.h"
#include "shopping.h"
#include "skills.h"
#include "species.h"
#include "spl-book.h"
#include "spl-cast.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"
#include "tags.h"
#include "transform.h"
#include "unwind.h"
#include "version.h"
#include "viewchar.h"

#include "job-def.h"
#include "job-data.h"
#include "mon-spell.h"

using std::map;
using std::set;
using std::vector;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/// Lowercase snake_case key from a display name. Apostrophes are dropped,
/// every other run of non-alphanumerics becomes a single '_', and a leading
/// "the " is removed (unique monsters, unrandarts).
static string _snake(string name)
{
    name = lowercase_string(name);
    if (starts_with(name, "the "))
        name = name.substr(4);
    string out;
    bool pending_sep = false;
    for (unsigned char c : name)
    {
        if (c == '\'')
            continue;
        if (isalnum(c))
        {
            if (pending_sep && !out.empty())
                out += '_';
            pending_sep = false;
            out += static_cast<char>(c);
        }
        else
            pending_sep = true;
    }
    return out;
}

static string _trimmed_desc(const string &s)
{
    return trimmed_string(s);
}

static void _str(JsonNode *obj, const char *key, const string &value)
{
    json_append_member(obj, key, json_mkstring(value));
}

static void _num(JsonNode *obj, const char *key, double value)
{
    json_append_member(obj, key, json_mknumber(value));
}

static void _bool(JsonNode *obj, const char *key, bool value)
{
    json_append_member(obj, key, json_mkbool(value));
}

static JsonNode *_string_array(const vector<string> &values)
{
    JsonNode *arr = json_mkarray();
    for (const string &v : values)
        json_append_element(arr, json_mkstring(v));
    return arr;
}

static string _size_name(size_type size)
{
    if (size < 0 || size >= NUM_SIZE_LEVELS)
        return "";
    return get_size_adj(size);
}

/// Turn an item type into a dummy, fully identified item for querying.
static item_def _dummy_item(object_class_type base, int sub_type)
{
    item_def item;
    item.base_type = base;
    item.sub_type = sub_type;
    item.quantity = 1;
    item.flags |= ISFLAG_IDENTIFIED;
    return item;
}

static string _item_db_name(const item_def &item)
{
    return item.name(DESC_DBNAME, true, true, false);
}

static string _item_plain_name(const item_def &item)
{
    return item.name(DESC_PLAIN, false, true, false);
}

static string _item_description(const item_def &item)
{
    return _trimmed_desc(getLongDescription(_item_db_name(item)));
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

static bool _monster_entry_valid(monster_type mc)
{
    if (mc <= MONS_PROGRAM_BUG || mc >= NUM_MONSTERS)
        return false;
    const monsterentry *me = get_monster_data(mc);
    return me && me->name && me->name[0] && me->mc == mc;
}

/// Monster keys are computed once over the whole monster enum so name
/// collisions (e.g. the Serpent of Hell variants) get deterministic
/// "_2", "_3"... suffixes in enum order.
static const vector<string> &_monster_keys()
{
    static vector<string> keys;
    if (!keys.empty())
        return keys;

    keys.resize(NUM_MONSTERS);
    map<string, int> seen;
    for (int i = 0; i < NUM_MONSTERS; ++i)
    {
        const monster_type mc = static_cast<monster_type>(i);
        string key;
        if (_monster_entry_valid(mc))
        {
            key = _snake(get_monster_data(mc)->name);
            if (mons_species(mc) == MONS_SERPENT_OF_HELL)
                key += "_" + _snake(serpent_of_hell_flavour(mc));
        }
        if (key.empty())
            key = make_stringf("monster_%d", i);
        const int count = ++seen[key];
        if (count > 1)
            key += make_stringf("_%d", count);
        keys[i] = key;
    }
    return keys;
}

string stats_monster_key(monster_type mc)
{
    if (mc == MONS_PLAYER_GHOST)
        return "player_ghost";
    if (mc < 0 || mc >= NUM_MONSTERS)
        return make_stringf("monster_%d", static_cast<int>(mc));
    return _monster_keys()[mc];
}

string stats_item_key(object_class_type base, int sub_type)
{
    switch (base)
    {
    case OBJ_WEAPONS:
    case OBJ_ARMOUR:
    case OBJ_MISSILES:
    case OBJ_TALISMANS:
        return _snake(item_base_name(base, sub_type));
    default:
        break;
    }
    const item_def item = _dummy_item(base, sub_type);
    string key = _snake(_item_db_name(item));
    if (key.empty())
        key = make_stringf("item_%d_%d", static_cast<int>(base), sub_type);
    return key;
}

static string _spell_key(spell_type sp)
{
    return _snake(spell_title(sp));
}

static string _skill_key(skill_type sk)
{
    return _snake(skill_name(sk));
}

static string _brand_key(brand_type brand)
{
    return _snake(brand_type_name(brand, false));
}

static string _armour_ego_key(special_armour_type ego)
{
    return _snake(special_armour_type_name(ego, false));
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

static string _attack_flavour_key(attack_flavour flav)
{
    switch (flav)
    {
    case AF_PLAIN: return "plain";
    case AF_ACID: return "acid";
    case AF_BLINK: return "blink";
    case AF_COLD: return "cold";
    case AF_CONFUSE: return "confuse";
    case AF_DRAIN: return "drain";
    case AF_ELEC: return "elec";
    case AF_FIRE: return "fire";
    case AF_POISON_PARALYSE: return "poison_paralyse";
    case AF_POISON: return "poison";
    case AF_POISON_STRONG: return "poison_strong";
    case AF_VAMPIRIC: return "vampiric";
    case AF_DISTORT: return "distort";
    case AF_RAGE: return "rage";
    case AF_CHAOTIC: return "chaos";
    case AF_STEAL: return "steal";
    case AF_CONSTRICT: return "constrict";
    case AF_HOLY: return "holy";
    case AF_ANTIMAGIC: return "antimagic";
    case AF_PAIN: return "pain";
    case AF_ENSNARE: return "ensnare";
    case AF_FLOOD: return "flood";
    case AF_PURE_FIRE: return "pure_fire";
    case AF_DRAIN_SPEED: return "drain_speed";
    case AF_VULN: return "vuln";
    case AF_SHADOWSTAB: return "shadowstab";
    case AF_DROWN: return "drown";
    case AF_CORRODE: return "corrode";
    case AF_SCARAB: return "scarab";
    case AF_SWOOP: return "swoop";
    case AF_TRAMPLE: return "trample";
    case AF_WEAKNESS: return "weakness";
    case AF_BLINK_WITH: return "blink_with";
    case AF_SEAR: return "sear";
    case AF_BARBS: return "barbs";
    case AF_SPIDER: return "spider";
    case AF_BLOODZERK: return "bloodzerk";
    case AF_SLEEP: return "sleep";
    case AF_MINIPARA: return "minipara";
    case AF_FLANK: return "flank";
    case AF_DRAG: return "drag";
    case AF_FOUL_FLAME: return "foul_flame";
    case AF_HELL_HUNT: return "hell_hunt";
    case AF_SWARM: return "swarm";
    case AF_ALEMBIC: return "alembic";
    case AF_BOMBLET: return "bomblet";
    case AF_AIRSTRIKE: return "airstrike";
    case AF_TRICKSTER: return "trickster";
    case AF_UGLY_THING: return "ugly_thing";
    case AF_DOOM: return "doom";
    case AF_SLIMIFY: return "slimify";
    case AF_DIM: return "dim";
    case AF_BURSTSHROOM: return "burstshroom";
    case AF_CONTAM_WATER: return "contam_water";
    default:
        return make_stringf("flavour_%d", static_cast<int>(flav));
    }
}

static string _habitat_name(habitat_type ht)
{
    switch (ht)
    {
    case HT_NONE: return "none";
    case HT_DRY_LAND: return "dry_land";
    case HT_LAND: return "land";
    case HT_AMPHIBIOUS: return "amphibious";
    case HT_WATER: return "water";
    case HT_DEEP_WATER: return "deep_water";
    case HT_SHALLOW_WATER: return "shallow_water";
    case HT_LAVA: return "lava";
    case HT_AMPHIBIOUS_LAVA: return "amphibious_lava";
    case HT_ELDRITCH_TENTACLE: return "eldritch_tentacle";
    case HT_FLYER: return "flyer";
    case HT_WALL: return "wall";
    case HT_WALLS_ONLY: return "walls_only";
    case HT_MALIGN_GATEWAY: return "malign_gateway";
    default:
        return make_stringf("habitat_%d", static_cast<int>(ht));
    }
}

static const vector<pair<monclass_flag_type, const char *>> &_monster_flag_names()
{
    static const vector<pair<monclass_flag_type, const char *>> names =
    {
        { M_EAT_DOORS, "eat_doors" },
        { M_CRASH_DOORS, "crash_doors" },
        { M_FLIES, "flies" },
        { M_FIGHTER, "fighter" },
        { M_NO_WAND, "no_wand" },
        { M_NO_HT_WAND, "no_ht_wand" },
        { M_INVIS, "invisible" },
        { M_SEE_INVIS, "see_invis" },
        { M_UNBLINDABLE, "unblindable" },
        { M_SPEAKS, "speaks" },
        { M_CONFUSED, "confused" },
        { M_BATTY, "batty" },
        { M_SPLITS, "splits" },
        { M_FRAGILE, "fragile" },
        { M_STATIONARY, "stationary" },
        { M_WEB_IMMUNE, "web_immune" },
        { M_COLD_BLOOD, "cold_blooded" },
        { M_WARM_BLOOD, "warm_blooded" },
        { M_GHOST_DEMON, "ghost_demon" },
        { M_BURROWS, "burrows" },
        { M_HAS_AURA, "has_aura" },
        { M_UNIQUE, "unique" },
        { M_ACID_SPLASH, "acid_splash" },
        { M_ARCHER, "archer" },
        { M_INSUBSTANTIAL, "insubstantial" },
        { M_TWO_WEAPONS, "two_weapons" },
        { M_FAST_REGEN, "fast_regen" },
        { M_NO_REGEN, "no_regen" },
        { M_NO_SKELETON, "no_skeleton" },
        { M_NO_EXP_GAIN, "no_exp_gain" },
        { M_SPINY, "spiny" },
        { M_CAUTIOUS, "cautious" },
        { M_NO_POLY_TO, "no_poly_to" },
        { M_ANCESTOR, "ancestor" },
        { M_LURKER, "lurker" },
        { M_PREFER_RANGED, "prefer_ranged" },
        { M_REMNANT, "remnant" },
        { M_UNBREATHING, "unbreathing" },
        { M_UNFINISHED, "unfinished" },
        { M_HERD, "herd" },
        { M_UNSTABLE, "unstable" },
        { M_MAINTAIN_RANGE, "maintain_range" },
        { M_NO_ZOMBIE, "no_zombie" },
        { M_CANT_SPAWN, "cant_spawn" },
        { M_NO_GEN_DERIVED, "no_gen_derived" },
        { M_PRIEST, "priest" },
        { M_PROJECTILE, "projectile" },
        { M_AVATAR, "avatar" },
        { M_PERIPHERAL, "peripheral" },
        { M_NO_THREAT, "no_threat" },
        { M_ALWAYS_WAND, "always_wand" },
        { M_THUNDER_RING, "thunder_ring" },
        { M_FIRE_RING, "fire_ring" },
        { M_MIASMA_RING, "miasma_ring" },
        { M_AMORPHOUS, "amorphous" },
        { M_WARDED, "warded" },
    };
    return names;
}

static const vector<pair<mon_spell_slot_flag, const char *>> &_mspell_flag_names()
{
    static const vector<pair<mon_spell_slot_flag, const char *>> names =
    {
        { MON_SPELL_EMERGENCY, "emergency" },
        { MON_SPELL_NATURAL, "natural" },
        { MON_SPELL_MAGICAL, "magical" },
        { MON_SPELL_VOCAL, "vocal" },
        { MON_SPELL_WIZARD, "wizard" },
        { MON_SPELL_PRIEST, "priest" },
        { MON_SPELL_BREATH, "breath" },
        { MON_SPELL_INSTANT, "instant" },
        { MON_SPELL_NOISY, "noisy" },
        { MON_SPELL_SHORT_RANGE, "short_range" },
        { MON_SPELL_LONG_RANGE, "long_range" },
        { MON_SPELL_EVOKE, "evoke" },
    };
    return names;
}

static bool _is_breathing_draconian(monster_type mc)
{
    switch (mc)
    {
    case MONS_BLACK_DRACONIAN:
    case MONS_YELLOW_DRACONIAN:
    case MONS_GREEN_DRACONIAN:
    case MONS_PURPLE_DRACONIAN:
    case MONS_RED_DRACONIAN:
    case MONS_WHITE_DRACONIAN:
    case MONS_PALE_DRACONIAN:
        return true;
    default:
        return false;
    }
}

static vector<mon_spell_slot> _monster_spells(monster_type mc,
                                              const monsterentry *me)
{
    vector<mon_spell_slot> slots;
    if (_is_breathing_draconian(mc))
        slots.push_back(drac_breath(mc));

    const mon_spellbook_type book = static_cast<mon_spellbook_type>(me->sec);
    if (book == MST_NO_SPELLS || book == MST_GHOST)
        return slots;

    for (const mon_spellbook &spbook : mspell_list)
    {
        if (spbook.type != book)
            continue;
        for (const mon_spell_slot &slot : spbook.spells)
        {
            if (slot.spell == SPELL_NO_SPELL)
                continue;
            if (none_of(slots.begin(), slots.end(),
                        [&](const mon_spell_slot &old)
                        { return old.spell == slot.spell; }))
            {
                slots.push_back(slot);
            }
        }
        break;
    }
    return slots;
}

static JsonNode *_monster_json(monster_type mc)
{
    const monsterentry *me = get_monster_data(mc);
    JsonNode *mon = json_mkobject();
    _str(mon, "key", stats_monster_key(mc));
    _str(mon, "name", me->name);
    _str(mon, "glyph", stringize_glyph(me->basechar));
    _str(mon, "colour", colour_to_str(me->colour));
    _str(mon, "genus", stats_monster_key(mons_genus(mc)));
    _str(mon, "species", stats_monster_key(mons_species(mc)));

    _num(mon, "hd", me->HD);
    if (me->avg_hp_10x > 0)
    {
        // Same spread as hit_points(): avg +/- 33%, never below 1.
        const int avg = me->avg_hp_10x;
        const int var = avg * 33 / 100;
        _num(mon, "hp_avg", avg / 10.0);
        _num(mon, "hp_min", max(1, (avg - var) / 10));
        _num(mon, "hp_max", max(1, (avg + var) / 10));
    }
    _num(mon, "ac", me->AC);
    _num(mon, "ev", me->ev);
    const int will = mons_class_willpower(mc, MONS_NO_MONSTER);
    if (will >= WILL_INVULN)
        _str(mon, "will", "immune");
    else
        _num(mon, "will", will);
    _num(mon, "speed", me->speed);
    _num(mon, "move_energy", me->energy_usage.move);

    if (!mons_class_gives_xp(mc))
        _num(mon, "xp", 0);
    else if (!me->exp_is_mult)
        _num(mon, "xp", me->exp);
    else
        _num(mon, "xp_multiplier", me->exp); // xp depends on the instance

    _str(mon, "size", _size_name(me->size));

    vector<string> holiness;
    for (const auto bit : mon_holy_type::range())
        if (me->holiness & bit)
            holiness.emplace_back(holiness_name(bit));
    json_append_member(mon, "holiness", _string_array(holiness));
    _str(mon, "intelligence", intelligence_description(me->intel));
    _str(mon, "habitat", _habitat_name(me->habitat));

    JsonNode *attacks = json_mkarray();
    for (int i = 0; i < MAX_NUM_ATTACKS; ++i)
    {
        const mon_attack_def &att = me->attack[i];
        if (att.type == AT_NONE)
            break;
        JsonNode *a = json_mkobject();
        _str(a, "type", _snake(mon_attack_name(att.type, false)));
        _str(a, "flavour", _attack_flavour_key(att.flavour));
        _num(a, "damage", att.damage);
        if (att.reach > 1)
            _num(a, "reach", att.reach);
        if (att.cleaves)
            _bool(a, "cleaves", true);
        json_append_element(attacks, a);
    }
    json_append_member(mon, "attacks", attacks);

    JsonNode *res = json_mkobject();
    const resists_t r = me->resists;
    _num(res, "fire", get_resist(r, MR_RES_FIRE));
    _num(res, "cold", get_resist(r, MR_RES_COLD));
    _num(res, "elec", get_resist(r, MR_RES_ELEC));
    _num(res, "poison", get_resist(r, MR_RES_POISON));
    _num(res, "neg", get_resist(r, MR_RES_NEG));
    _num(res, "acid", get_resist(r, MR_RES_CORR));
    _num(res, "miasma", get_resist(r, MR_RES_MIASMA));
    _bool(res, "torment", get_resist(r, MR_RES_TORMENT));
    _bool(res, "petrify", get_resist(r, MR_RES_PETRIFY));
    _bool(res, "damnation", get_resist(r, MR_RES_DAMNATION));
    _bool(res, "steam", get_resist(r, MR_RES_STEAM));
    _bool(res, "vul_water", get_resist(r, MR_VUL_WATER));
    json_append_member(mon, "resists", res);

    vector<string> flags;
    for (const auto &f : _monster_flag_names())
        if (me->bitfields & f.first)
            flags.emplace_back(f.second);
    json_append_member(mon, "flags", _string_array(flags));

    JsonNode *spells = json_mkarray();
    for (const mon_spell_slot &slot : _monster_spells(mc, me))
    {
        if (!is_valid_spell(slot.spell))
            continue;
        JsonNode *s = json_mkobject();
        _str(s, "key", _spell_key(slot.spell));
        _str(s, "name", spell_title(slot.spell));
        _num(s, "freq", slot.freq);
        vector<string> sflags;
        for (const auto &f : _mspell_flag_names())
            if (slot.flags & f.first)
                sflags.emplace_back(f.second);
        json_append_member(s, "flags", _string_array(sflags));
        json_append_element(spells, s);
    }
    json_append_member(mon, "spells", spells);

    _bool(mon, "corpse", me->leaves_corpse);
    _bool(mon, "unique", mons_is_unique(mc));
    _str(mon, "description", _trimmed_desc(getLongDescription(me->name)));
    return mon;
}

static JsonNode *_monsters_json()
{
    JsonNode *arr = json_mkarray();
    for (int i = 0; i < NUM_MONSTERS; ++i)
    {
        const monster_type mc = static_cast<monster_type>(i);
        if (!_monster_entry_valid(mc)
            || mc == MONS_PLAYER
            || mons_is_removed(mc)
            || mons_class_is_test(mc)
            || mons_is_tentacle_segment(mc))
        {
            continue;
        }
        json_append_element(arr, _monster_json(mc));
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

static bool _item_removed(object_class_type base, int sub)
{
    if (item_type_removed(base, sub))
        return true;
    const item_def item = _dummy_item(base, sub);
    const string name = lowercase_string(_item_db_name(item));
    return name.empty() || starts_with(name, "removed ")
           || starts_with(name, "obsolete ") || starts_with(name, "buggy");
}

static void _item_common(JsonNode *obj, object_class_type base, int sub)
{
    const item_def item = _dummy_item(base, sub);
    _str(obj, "key", stats_item_key(base, sub));
    _str(obj, "name", _item_plain_name(item));
}

static JsonNode *_weapons_json()
{
    JsonNode *arr = json_mkarray();
    for (int w = 0; w < NUM_WEAPONS; ++w)
    {
        if (_item_removed(OBJ_WEAPONS, w))
            continue;
        const item_def item = _dummy_item(OBJ_WEAPONS, w);
        JsonNode *o = json_mkobject();
        _str(o, "key", stats_item_key(OBJ_WEAPONS, w));
        _str(o, "name", item_base_name(OBJ_WEAPONS, w));
        const skill_type wsk = item_attack_skill(OBJ_WEAPONS, w);
        if (wsk >= SK_FIRST_SKILL && wsk < NUM_SKILLS)
            _str(o, "skill", skill_name(wsk));
        _num(o, "damage", property(item, PWPN_DAMAGE));
        _num(o, "hit", property(item, PWPN_HIT));
        _num(o, "delay", property(item, PWPN_SPEED));
        _num(o, "min_delay", weapon_min_delay(item, false));

        for (int sz = SIZE_TINY; sz < NUM_SIZE_LEVELS; ++sz)
        {
            if (!is_weapon_too_large(item, static_cast<size_type>(sz)))
            {
                _str(o, "size", _size_name(static_cast<size_type>(sz)));
                break;
            }
        }
        _num(o, "hands",
             basic_hands_reqd(item, SIZE_MEDIUM) == HANDS_TWO ? 2 : 1);
        const bool ranged = is_ranged_weapon_type(w);
        if (ranged)
            _num(o, "range", LOS_DEFAULT_RANGE);
        _num(o, "price", weapon_base_price(static_cast<weapon_type>(w)));
        _num(o, "commonness", weapon_rarity(w));
        _num(o, "acquire_weight", property(item, PWPN_ACQ_WEIGHT));

        vector<string> tags;
        if (ranged)
            tags.emplace_back("ranged");
        if (weapon_reach(item) > 1)
            tags.emplace_back("reach");
        if (is_blessed_weapon_type(w))
            tags.emplace_back("blessed");
        if (is_demonic_weapon_type(w))
            tags.emplace_back("demonic");
        if (is_giant_club_type(w))
            tags.emplace_back("giant_club");
        const int dtype = get_vorpal_type(item);
        if (dtype & DVORP_SLICING)
            tags.emplace_back("slicing");
        if (dtype & DVORP_PIERCING)
            tags.emplace_back("piercing");
        if (dtype & DVORP_CRUSHING)
            tags.emplace_back("crushing");
        if (dtype & DVORP_CHOPPING)
            tags.emplace_back("chopping");
        json_append_member(o, "tags", _string_array(tags));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_armour_json()
{
    JsonNode *arr = json_mkarray();
    for (int a = 0; a < NUM_ARMOURS; ++a)
    {
        if (_item_removed(OBJ_ARMOUR, a))
            continue;
        const armour_type at = static_cast<armour_type>(a);
        const item_def item = _dummy_item(OBJ_ARMOUR, a);
        JsonNode *o = json_mkobject();
        _str(o, "key", stats_item_key(OBJ_ARMOUR, a));
        _str(o, "name", item_base_name(OBJ_ARMOUR, a));
        _str(o, "slot", _snake(equip_slot_name(get_armour_slot(at))));
        _num(o, "ac", armour_prop(a, PARM_AC));
        // Encumbrance as shown in-game: -(EV property) / 10.
        _num(o, "ev_penalty", -armour_prop(a, PARM_EVASION) / 10.0);
        _num(o, "price", armour_base_price(at));
        _num(o, "acquire_weight", armour_acq_weight(at));

        artefact_properties_t props;
        props.init(0);
        populate_armour_intrinsic_artps(at, props);
        vector<string> intrinsic;
        for (int p = 0; p < ART_PROPERTIES; ++p)
        {
            if (!props[p])
                continue;
            const char *pname = artp_name(static_cast<artefact_prop_type>(p));
            if (!pname)
                continue;
            intrinsic.push_back(make_stringf("%s%+d", pname, props[p]));
        }
        json_append_member(o, "intrinsic", _string_array(intrinsic));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_missiles_json()
{
    JsonNode *arr = json_mkarray();
    for (int m = 0; m < NUM_MISSILES; ++m)
    {
        if (_item_removed(OBJ_MISSILES, m))
            continue;
        const item_def item = _dummy_item(OBJ_MISSILES, m);
        JsonNode *o = json_mkobject();
        _str(o, "key", stats_item_key(OBJ_MISSILES, m));
        _str(o, "name", item_base_name(OBJ_MISSILES, m));
        _num(o, "damage", property(item, PWPN_DAMAGE));
        _num(o, "price", missile_base_price(static_cast<missile_type>(m)));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

/// Generic "key/name/description" item class listing.
static JsonNode *_simple_items_json(object_class_type base, int count,
                                    bool with_price)
{
    JsonNode *arr = json_mkarray();
    for (int s = 0; s < count; ++s)
    {
        if (_item_removed(base, s))
            continue;
        const item_def item = _dummy_item(base, s);
        JsonNode *o = json_mkobject();
        _item_common(o, base, s);
        if (base == OBJ_WANDS)
            _num(o, "charges", wand_charge_value(s));
        if (with_price)
            _num(o, "price", item_value(item, true));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_jewellery_json()
{
    JsonNode *arr = json_mkarray();
    for (int j = 0; j < NUM_JEWELLERY; ++j)
    {
        const bool ring = j >= RING_FIRST_RING && j < NUM_RINGS;
        const bool amulet = j >= AMU_FIRST_AMULET;
        if (!ring && !amulet)
            continue;
        if (_item_removed(OBJ_JEWELLERY, j))
            continue;
        const item_def item = _dummy_item(OBJ_JEWELLERY, j);
        JsonNode *o = json_mkobject();
        _item_common(o, OBJ_JEWELLERY, j);
        _str(o, "kind", jewellery_is_amulet(j) ? "amulet" : "ring");
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_talismans_json()
{
    JsonNode *arr = json_mkarray();
    for (int t = 0; t < NUM_TALISMANS; ++t)
    {
        if (_item_removed(OBJ_TALISMANS, t))
            continue;
        const item_def item = _dummy_item(OBJ_TALISMANS, t);
        JsonNode *o = json_mkobject();
        _str(o, "key", stats_item_key(OBJ_TALISMANS, t));
        _str(o, "name", item_base_name(OBJ_TALISMANS, t));
        const transformation form = form_for_talisman(item);
        if (form != transformation::none)
            _str(o, "form", get_form(form)->get_long_name());
        _num(o, "tier", talisman_tier(static_cast<talisman_type>(t)));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static map<spell_type, vector<string>> _spell_books()
{
    map<spell_type, vector<string>> books;
    for (int b = 0; b < NUM_FIXED_BOOKS; ++b)
    {
        const book_type bt = static_cast<book_type>(b);
        if (!book_exists(bt))
            continue;
        const string key = stats_item_key(OBJ_BOOKS, b);
        for (spell_type sp : spellbook_template(bt))
            books[sp].push_back(key);
    }
    return books;
}

static JsonNode *_books_json()
{
    JsonNode *arr = json_mkarray();
    for (int b = 0; b < NUM_FIXED_BOOKS; ++b)
    {
        const book_type bt = static_cast<book_type>(b);
        if (!book_exists(bt))
            continue;
        const item_def item = _dummy_item(OBJ_BOOKS, b);
        JsonNode *o = json_mkobject();
        _item_common(o, OBJ_BOOKS, b);
        vector<string> spells;
        for (spell_type sp : spellbook_template(bt))
            spells.push_back(_spell_key(sp));
        json_append_member(o, "spells", _string_array(spells));
        _str(o, "description", _item_description(item));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_weapon_brands_json()
{
    JsonNode *arr = json_mkarray();
    for (int b = SPWPN_NORMAL + 1; b < NUM_REAL_SPECIAL_WEAPONS; ++b)
    {
        const brand_type brand = static_cast<brand_type>(b);
        const char *verbose = brand_type_name(brand, false);
        const char *terse = brand_type_name(brand, true);
        if (!verbose || !*verbose || !terse)
            continue;
        const string ego_key = lowercase_first(verbose) + " ("
                               + lowercase_first(terse) + ") weapon ego";
        const string desc = _trimmed_desc(getEgoString(ego_key));
        // Removed (save-compat only) brands have no description entry.
        if (desc.empty())
            continue;
        JsonNode *o = json_mkobject();
        _str(o, "key", _brand_key(brand));
        _str(o, "name", verbose);
        _str(o, "terse", terse);
        _str(o, "description", desc);
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_armour_egos_json()
{
    JsonNode *arr = json_mkarray();
    for (int e = SPARM_NORMAL + 1; e < NUM_REAL_SPECIAL_ARMOURS; ++e)
    {
        const special_armour_type ego = static_cast<special_armour_type>(e);
        const char *verbose = special_armour_type_name(ego, false);
        const char *terse = special_armour_type_name(ego, true);
        if (!verbose || !*verbose || !terse)
            continue;
        const string ego_key = lowercase_first(verbose) + " ("
                               + lowercase_first(terse) + ") armour ego";
        const string desc = _trimmed_desc(getEgoString(ego_key));
        if (desc.empty())
            continue;
        JsonNode *o = json_mkobject();
        _str(o, "key", _armour_ego_key(ego));
        _str(o, "name", verbose);
        _str(o, "terse", terse);
        _str(o, "description", desc);
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_unrands_json()
{
    JsonNode *arr = json_mkarray();
    for (int idx = UNRAND_START + 1; idx < UNRAND_START + NUM_UNRANDARTS; ++idx)
    {
        const unrandart_entry *entry = get_unrand_entry(idx);
        if (!entry || !entry->name || !*entry->name)
            continue;
        if (entry->flags & UNRAND_FLAG_DELETED)
            continue;
        const string name = entry->name;
        if (starts_with(name, "DUMMY"))
            continue;

        JsonNode *o = json_mkobject();
        _str(o, "key", _snake(name));
        _str(o, "name", name);
        if (entry->base_type != OBJ_UNASSIGNED)
        {
            _str(o, "base_class", base_type_string(entry->base_type));
            _str(o, "base", stats_item_key(entry->base_type, entry->sub_type));
        }
        JsonNode *props = json_mkobject();
        for (int p = 0; p < ART_PROPERTIES; ++p)
        {
            const int v = entry->prpty[p];
            if (!v)
                continue;
            const artefact_prop_type prop = static_cast<artefact_prop_type>(p);
            const char *pname = artp_name(prop);
            if (!pname)
                continue;
            if (prop == ARTP_BRAND)
                _str(props, pname, _brand_key(static_cast<brand_type>(v)));
            else
                _num(props, pname, v);
        }
        json_append_member(o, "properties", props);
        vector<string> flags;
        if (entry->flags & UNRAND_FLAG_HOLY)
            flags.emplace_back("holy");
        if (entry->flags & UNRAND_FLAG_EVIL)
            flags.emplace_back("evil");
        if (entry->flags & UNRAND_FLAG_UNCLEAN)
            flags.emplace_back("unclean");
        if (entry->flags & UNRAND_FLAG_CHAOTIC)
            flags.emplace_back("chaotic");
        if (entry->flags & UNRAND_FLAG_NOGEN)
            flags.emplace_back("nogen");
        json_append_member(o, "flags", _string_array(flags));
        string desc = _trimmed_desc(getLongDescription(name));
        if (desc.empty() && entry->descrip)
            desc = entry->descrip;
        _str(o, "description", desc);
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_items_json()
{
    JsonNode *items = json_mkobject();
    json_append_member(items, "weapons", _weapons_json());
    json_append_member(items, "armour", _armour_json());
    json_append_member(items, "missiles", _missiles_json());
    json_append_member(items, "wands", _simple_items_json(OBJ_WANDS, NUM_WANDS, false));
    json_append_member(items, "staves", _simple_items_json(OBJ_STAVES, NUM_STAVES, false));
    json_append_member(items, "potions", _simple_items_json(OBJ_POTIONS, NUM_POTIONS, true));
    json_append_member(items, "scrolls", _simple_items_json(OBJ_SCROLLS, NUM_SCROLLS, true));
    json_append_member(items, "jewellery", _jewellery_json());
    json_append_member(items, "misc", _simple_items_json(OBJ_MISCELLANY, NUM_MISCELLANY, false));
    json_append_member(items, "talismans", _talismans_json());
    json_append_member(items, "books", _books_json());
    json_append_member(items, "weapon_brands", _weapon_brands_json());
    json_append_member(items, "armour_egos", _armour_egos_json());
    json_append_member(items, "unrands", _unrands_json());
    return items;
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

static const vector<pair<spflag, const char *>> &_spell_flag_names()
{
    static const vector<pair<spflag, const char *>> names =
    {
        { spflag::dir_or_target, "dir_or_target" },
        { spflag::target, "target" },
        { spflag::prefer_farthest, "prefer_farthest" },
        { spflag::obj, "obj" },
        { spflag::helpful, "helpful" },
        { spflag::aim_at_space, "aim_at_space" },
        { spflag::not_self, "not_self" },
        { spflag::unholy, "unholy" },
        { spflag::unclean, "unclean" },
        { spflag::chaotic, "chaotic" },
        { spflag::hasty, "hasty" },
        { spflag::silent, "silent" },
        { spflag::escape, "escape" },
        { spflag::recovery, "recovery" },
        { spflag::direct_damage_only, "direct_damage_only" },
        { spflag::destructive, "destructive" },
        { spflag::selfench, "selfench" },
        { spflag::monster, "monster" },
        { spflag::needs_tracer, "needs_tracer" },
        { spflag::noisy, "noisy" },
        { spflag::testing, "testing" },
        { spflag::needs_target, "needs_target" },
        { spflag::no_ghost, "no_ghost" },
        { spflag::cloud, "cloud" },
        { spflag::WL_check, "wl_check" },
        { spflag::mons_abjure, "mons_abjure" },
        { spflag::dummy, "dummy" },
        { spflag::holy, "holy" },
    };
    return names;
}

static JsonNode *_spells_json()
{
    const map<spell_type, vector<string>> books = _spell_books();
    JsonNode *arr = json_mkarray();
    for (int i = SPELL_NO_SPELL + 1; i < NUM_SPELLS; ++i)
    {
        const spell_type sp = static_cast<spell_type>(i);
        if (!is_valid_spell(sp) || spell_removed(sp))
            continue;
        const spell_flags flags = get_spell_flags(sp);
        if (flags & spflag::testing)
            continue;

        JsonNode *o = json_mkobject();
        _str(o, "key", _spell_key(sp));
        _str(o, "name", spell_title(sp));
        _num(o, "level", spell_difficulty(sp));
        _num(o, "mana", spell_mana(sp, false));
        vector<string> schools;
        const spschools_type disc = get_spell_disciplines(sp);
        for (const auto bit : spschools_type::range())
            if (disc & bit)
                schools.emplace_back(spelltype_long_name(bit));
        json_append_member(o, "schools", _string_array(schools));
        const int power_cap = spell_power_cap(sp);
        if (power_cap > 0)
            _num(o, "power_cap", power_cap);
        const int range = calc_spell_range(sp, power_cap, false, true);
        if (range >= 0)
            _num(o, "range", range);
        _num(o, "noise", spell_noise(sp));
        vector<string> fnames;
        for (const auto &f : _spell_flag_names())
            if (flags & f.first)
                fnames.emplace_back(f.second);
        json_append_member(o, "flags", _string_array(fnames));
        _bool(o, "player", is_player_spell(sp));
        _str(o, "description", _trimmed_desc(
                 getLongDescription(string(spell_title(sp)) + " spell")));
        auto it = books.find(sp);
        json_append_member(o, "books", _string_array(
                               it == books.end() ? vector<string>() : it->second));
        json_append_element(arr, o);
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Species, jobs, combos
// ---------------------------------------------------------------------------

static JsonNode *_species_json()
{
    JsonNode *arr = json_mkarray();
    for (const species_type sp : species::get_all_species())
    {
        const species_def &def = get_species_def(sp);
        JsonNode *o = json_mkobject();
        _str(o, "key", _snake(species::name(sp)));
        _str(o, "name", species::name(sp));
        _str(o, "abbrev", species::get_abbrev(sp));
        _num(o, "str", def.s);
        _num(o, "int", def.i);
        _num(o, "dex", def.d);
        _num(o, "hp_mod", species::get_hp_modifier(sp));
        _num(o, "mp_mod", species::get_mp_modifier(sp));
        _num(o, "will_mod", species::get_wl_modifier(sp));
        _num(o, "xp_mod", species::get_exp_modifier(sp));
        _str(o, "size", _size_name(def.size));

        JsonNode *apts = json_mkobject();
        for (int i = SK_FIRST_SKILL; i < NUM_SKILLS; ++i)
        {
            const skill_type sk = static_cast<skill_type>(i);
            if (is_removed_skill(sk))
                continue;
            const int apt = species_apt(sk, sp);
            if (apt != UNUSABLE_SKILL)
                _num(apts, skill_name(sk), apt);
        }
        json_append_member(o, "aptitudes", apts);

        JsonNode *muts = json_mkarray();
        for (const level_up_mutation &lum : def.level_up_mutations)
        {
            const char *mname = mutation_name(lum.mut);
            if (!mname)
                continue;
            JsonNode *m = json_mkobject();
            _str(m, "key", _snake(mname));
            _str(m, "name", mname);
            _num(m, "level", lum.mut_level);
            _num(m, "xl", lum.xp_level);
            json_append_element(muts, m);
        }
        json_append_member(o, "mutations", muts);

        vector<string> rec;
        for (job_type job : def.recommended_jobs)
            rec.push_back(_snake(get_job_name(job)));
        json_append_member(o, "recommended_jobs", _string_array(rec));
        _bool(o, "playable", species::is_starting_species(sp));
        _str(o, "description",
             _trimmed_desc(getLongDescription(species::name(sp))));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_jobs_json()
{
    JsonNode *arr = json_mkarray();
    for (const auto &entry : job_data)
    {
        const job_type job = entry.first;
        const job_def &def = entry.second;
        if (job_is_removed(job))
            continue;
        JsonNode *o = json_mkobject();
        _str(o, "key", _snake(def.name));
        _str(o, "name", def.name);
        _str(o, "abbrev", def.abbrev);
        _num(o, "str", def.s);
        _num(o, "int", def.i);
        _num(o, "dex", def.d);
        JsonNode *skills = json_mkobject();
        for (const auto &sk : def.skills)
        {
            if (sk.first == SK_WEAPON)
                _num(skills, "Weapon", sk.second); // chosen starting weapon
            else if (sk.first >= SK_FIRST_SKILL && sk.first < NUM_SKILLS)
                _num(skills, skill_name(sk.first), sk.second);
        }
        json_append_member(o, "skills", skills);
        json_append_member(o, "equipment", _string_array(def.equipment));
        vector<string> spells;
        for (spell_type sp : def.library)
            spells.push_back(_spell_key(sp));
        json_append_member(o, "spells", _string_array(spells));
        vector<string> rec;
        for (species_type sp : def.recommended_species)
            rec.push_back(_snake(species::name(sp)));
        json_append_member(o, "recommended_species", _string_array(rec));
        _bool(o, "playable", is_starting_job(job));
        _str(o, "description", _trimmed_desc(getLongDescription(def.name)));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_combos_json()
{
    JsonNode *arr = json_mkarray();
    for (const combo_type &combo : playable_combos())
    {
        const species_def &sdef = get_species_def(combo.species);
        const job_def &jdef = job_data.at(combo.job);
        JsonNode *o = json_mkobject();
        _str(o, "species", _snake(species::name(combo.species)));
        _str(o, "job", _snake(jdef.name));
        _str(o, "abbrev", combo.abbr());
        // Starting stats before any random allocation (Wanderer etc.).
        _num(o, "str", sdef.s + jdef.s);
        _num(o, "int", sdef.i + jdef.i);
        _num(o, "dex", sdef.d + jdef.d);
        // hp/mp are omitted: they depend on starting equipment and skills
        // and can only be known by actually setting up a character.
        const bool recommended =
            job_recommends_species(combo.job, combo.species)
            || find(sdef.recommended_jobs.begin(), sdef.recommended_jobs.end(),
                    combo.job) != sdef.recommended_jobs.end();
        _bool(o, "recommended", recommended);
        json_append_element(arr, o);
    }
    return arr;
}

// ---------------------------------------------------------------------------
// Gods, mutations, skills, branches
// ---------------------------------------------------------------------------

static string _god_power_text(const char *text)
{
    if (!text || !*text)
        return "";
    string s = text;
    if (islower(static_cast<unsigned char>(s[0])))
        s = "You can " + s + ".";
    return s;
}

static JsonNode *_gods_json()
{
    JsonNode *arr = json_mkarray();
    const auto &all_powers = get_all_god_powers();
    for (int g = GOD_NO_GOD + 1; g < NUM_GODS; ++g)
    {
        const god_type god = static_cast<god_type>(g);
        JsonNode *o = json_mkobject();
        const string name = god_name(god, false);
        _str(o, "key", _snake(name));
        _str(o, "name", name);
        _str(o, "long_name", god_name(god, true));
        _bool(o, "available", !is_unavailable_god(god));
        _bool(o, "good", is_good_god(god));
        _bool(o, "evil", is_evil_god(god));
        _bool(o, "chaotic", is_chaotic_god(god));
        _str(o, "description", _trimmed_desc(getLongDescription(name)));
        JsonNode *abils = json_mkarray();
        if (g < static_cast<int>(all_powers.size()))
        {
            for (const god_power &power : all_powers[g])
            {
                JsonNode *a = json_mkobject();
                _num(a, "rank", power.rank);
                if (power.abil != ABIL_NON_ABILITY)
                {
                    const string aname = ability_name(power.abil);
                    _str(a, "key", _snake(aname));
                    _str(a, "name", aname);
                }
                _str(a, "description", _god_power_text(power.general));
                json_append_element(abils, a);
            }
        }
        json_append_member(o, "abilities", abils);
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_mutations_json()
{
    const vector<mutation_type> removed = get_removed_mutations();
    JsonNode *arr = json_mkarray();
    for (int m = 0; m < NUM_MUTATIONS; ++m)
    {
        const mutation_type mut = static_cast<mutation_type>(m);
        if (find(removed.begin(), removed.end(), mut) != removed.end())
            continue;
        const char *name = mutation_name(mut);
        if (!name || !*name)
            continue;
        const int levels = mutation_max_levels(mut);
        JsonNode *o = json_mkobject();
        _str(o, "key", _snake(name));
        _str(o, "name", name);
        _num(o, "levels", levels);
        _bool(o, "good", is_good_mutation(mut));
        _bool(o, "bad", is_bad_mutation(mut));
        string desc = _trimmed_desc(
            getLongDescription(make_stringf("%s mutation", name)));
        vector<string> level_desc;
        for (int lvl = 1; lvl <= levels; ++lvl)
            level_desc.push_back(_trimmed_desc(mutation_desc(mut, lvl, false)));
        if (desc.empty() && !level_desc.empty())
            desc = level_desc.back();
        _str(o, "description", desc);
        json_append_member(o, "level_descriptions", _string_array(level_desc));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_skills_json()
{
    JsonNode *arr = json_mkarray();
    for (int i = SK_FIRST_SKILL; i < NUM_SKILLS; ++i)
    {
        const skill_type sk = static_cast<skill_type>(i);
        if (is_removed_skill(sk))
            continue;
        JsonNode *o = json_mkobject();
        _str(o, "key", _skill_key(sk));
        _str(o, "name", skill_name(sk));
        _str(o, "description", _trimmed_desc(getLongDescription(
                                   string(skill_name(sk)) + " skill")));
        json_append_element(arr, o);
    }
    return arr;
}

static JsonNode *_branches_json()
{
    // Same shape as `crawl -branches-json` (reuses its output), plus a key.
    JsonNode *arr = json_mkarray();
    JsonWrapper parsed(json_decode(branch_data_json().c_str()));
    JsonNode *list = parsed.node ? json_find_member(parsed.node, "branches")
                                 : nullptr;
    map<string, const Branch *> by_shortname;
    for (branch_iterator it; it; ++it)
        by_shortname[it->shortname] = *it;
    if (!list)
        return arr;
    JsonNode *child;
    json_foreach(child, list)
    {
        char *encoded = json_encode(child);
        JsonNode *copy = encoded ? json_decode(encoded) : nullptr;
        free(encoded);
        if (!copy)
            continue;
        JsonNode *name = json_find_member(copy, "name");
        if (name && name->tag == JSON_STRING)
        {
            const string shortname = name->string_;
            auto br = by_shortname.find(shortname);
            const string abbrev = br != by_shortname.end()
                                  ? br->second->abbrevname : shortname;
            json_prepend_member(copy, "key", json_mkstring(_snake(abbrev)));
            _str(copy, "abbrev", abbrev);
        }
        json_append_element(arr, copy);
    }
    return arr;
}

string stats_reference_json()
{
    JsonWrapper json(json_mkobject());
    _str(json.node, "version", Version::Long);
    _str(json.node, "generated_by", "crawl -stats-json");
    json_append_member(json.node, "monsters", _monsters_json());
    json_append_member(json.node, "items", _items_json());
    json_append_member(json.node, "spells", _spells_json());
    json_append_member(json.node, "species", _species_json());
    json_append_member(json.node, "jobs", _jobs_json());
    json_append_member(json.node, "combos", _combos_json());
    json_append_member(json.node, "gods", _gods_json());
    json_append_member(json.node, "mutations", _mutations_json());
    json_append_member(json.node, "skills", _skills_json());
    json_append_member(json.node, "branches", _branches_json());
    return json.to_string();
}

// ---------------------------------------------------------------------------
// Hero snapshots (Contract 2)
// ---------------------------------------------------------------------------

static const char *STATS_KILLER_KEY = "stats_downed_killer";
static const char *STATS_KTYP_KEY = "stats_downed_ktyp";

static string _env(const char *name)
{
    const char *v = getenv(name);
    return v ? string(v) : string();
}

static string _start_string(time_t when)
{
    // YYYYMMDDHHMMSS with a calendar (1-based) month, on the same clock
    // (TIME_FN) as the xlogfile `start` field. Note xlog itself writes a
    // 0-based month plus an S/D suffix.
    if (when <= 0)
        return "";
    struct tm *date = TIME_FN(&when);
    if (!date)
        return "";
    return make_stringf("%4d%02d%02d%02d%02d%02d",
                        date->tm_year + 1900, date->tm_mon + 1, date->tm_mday,
                        date->tm_hour, date->tm_min, date->tm_sec);
}

static string _iso_now()
{
    char stamp[32];
    const time_t now = time(nullptr);
    strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", gmtime(&now));
    return stamp;
}

static string _outcome_for(kill_method_type kt)
{
    switch (kt)
    {
    case KILLED_BY_QUITTING: return "quit";
    case KILLED_BY_WINNING: return "won";
    case KILLED_BY_LEAVING: return "left";
    default: return "dead";
    }
}

/// Map a kill descriptor onto the monster key used by -stats-json.
static monster_type _kill_class(const kill_exp &k)
{
    if (k.monnum == MONS_PROGRAM_BUG)
        return MONS_PLAYER_GHOST; // kill_ghost entries
    switch (k.modifier)
    {
    case kill_monster_desc::M_ZOMBIE: return MONS_ZOMBIE;
    case kill_monster_desc::M_DRAUGR: return MONS_DRAUGR;
    case kill_monster_desc::M_SIMULACRUM: return MONS_SIMULACRUM;
    case kill_monster_desc::M_SPECTRE: return MONS_SPECTRAL_THING;
    default: return k.monnum;
    }
}

static JsonNode *_skills_obj(const player &p)
{
    JsonNode *skills = json_mkobject();
    for (int i = SK_FIRST_SKILL; i < NUM_SKILLS; ++i)
    {
        const skill_type sk = static_cast<skill_type>(i);
        if (is_removed_skill(sk))
            continue;
        const int lvl10 = p.skill(sk, 10, true);
        if (lvl10 > 0)
            _num(skills, skill_name(sk), lvl10 / 10.0);
    }
    return skills;
}

static void _append_kills(JsonNode *obj, const player &p)
{
    map<string, int> counts;
    int total = 0;
    vector<kill_exp> kills;
    p.kills.get_kills(KC_YOU, kills);
    for (const kill_exp &k : kills)
    {
        counts[stats_monster_key(_kill_class(k))] += k.nkills;
        total += k.nkills;
    }
    JsonNode *kobj = json_mkobject();
    for (const auto &entry : counts)
        _num(kobj, entry.first.c_str(), entry.second);
    json_append_member(obj, "kills", kobj);
    _num(obj, "kill_total", total);

    int ally_total = 0;
    vector<kill_exp> ally;
    p.kills.get_kills(KC_FRIENDLY, ally);
    for (const kill_exp &k : ally)
        ally_total += k.nkills;
    _num(obj, "ally_kill_total", ally_total);
}

static void _append_actions(JsonNode *obj, const player &p)
{
    map<string, map<string, int>> actions;
    for (const auto &entry : p.action_count)
    {
        const caction_type cat = entry.first.first;
        int total = 0;
        for (int i = 0; i < 27; ++i)
            total += entry.second[i];
        if (!total)
            continue;
        const string cname = lowercase_string(caction_category_name(cat));
        const string aname = caction_subtype_name(cat, entry.first.second);
        actions[cname][aname] += total;
    }
    JsonNode *aobj = json_mkobject();
    for (const auto &cat : actions)
    {
        JsonNode *c = json_mkobject();
        for (const auto &a : cat.second)
            _num(c, a.first.c_str(), a.second);
        json_append_member(aobj, cat.first.c_str(), c);
    }
    json_append_member(obj, "actions", aobj);
}

static void _append_equipment(JsonNode *obj, player &p)
{
    JsonNode *arr = json_mkarray();
    for (const player_equip_entry &entry : p.equipment.items)
    {
        if (entry.is_overflow || entry.item < 0 || entry.item >= ENDOFPACK)
            continue;
        const item_def &item = p.inv[entry.item];
        if (!item.defined())
            continue;
        JsonNode *e = json_mkobject();
        _str(e, "slot", _snake(equip_slot_name(entry.slot)));
        _str(e, "name", item.name(DESC_PLAIN, false, true, false));
        _str(e, "base_key", stats_item_key(item.base_type, item.sub_type));
        if (item.base_type == OBJ_WEAPONS)
        {
            const brand_type brand = get_weapon_brand(item);
            if (brand != SPWPN_NORMAL)
                _str(e, "ego", _brand_key(brand));
        }
        else if (item.base_type == OBJ_ARMOUR)
        {
            const special_armour_type ego = get_armour_ego_type(item);
            if (ego != SPARM_NORMAL)
                _str(e, "ego", _armour_ego_key(ego));
        }
        _bool(e, "artefact", is_artefact(item));
        if (is_unrandom_artefact(item))
        {
            const unrandart_entry *ue = get_unrand_entry(item.unrand_idx);
            if (ue && ue->name)
                _str(e, "unrand_key", _snake(ue->name));
        }
        if (entry.melded)
            _bool(e, "melded", true);
        json_append_element(arr, e);
    }
    json_append_member(obj, "equipment", arr);
}

static void _append_places(JsonNode *obj, player &p)
{
    JsonNode *max_depth = json_mkobject();
    vector<string> visited;
    for (branch_iterator it; it; ++it)
    {
        const branch_type br = it->id;
        int deepest = 0;
        for (int d = brdepth[br]; d >= 1; --d)
        {
            if (p.level_visited(level_id(br, d)))
            {
                deepest = d;
                break;
            }
        }
        if (deepest > 0)
        {
            _num(max_depth, it->abbrevname, deepest);
            visited.emplace_back(it->abbrevname);
        }
    }
    json_append_member(obj, "max_depth", max_depth);
    json_append_member(obj, "branches_visited", _string_array(visited));
}

string stats_hero_snapshot_json(int slot, bool final, const string &outcome,
                                const scorefile_entry *se)
{
    player &p = party::is_enabled() ? party::get_player(slot) : you;
    // Several stat functions read the global `you`; point it at this hero
    // without touching proxies or any other game state.
    unwind_var<player*> context(real_you, &p);

    JsonWrapper json(json_mkobject());
    JsonNode *o = json.node;
    _str(o, "type", "hero_snapshot");
    _bool(o, "final", final);
    _str(o, "game_id", _env("CRAWL_GAME_ID"));
    _str(o, "hero_id", game_record::player_id(p));
    _str(o, "account_id", _env("CRAWL_OWNER_ID"));
    _str(o, "name", p.your_name);
    _str(o, "species", species::name(p.species));
    _str(o, "species_key", _snake(species::name(p.species)));
    _str(o, "job", get_job_name(p.char_class));
    _str(o, "job_key", _snake(get_job_name(p.char_class)));
    _num(o, "slot", slot);
    _num(o, "party_size", party::player_count());
    _str(o, "seed", make_stringf("%llu", (unsigned long long)p.game_seed));
    _str(o, "version", Version::Long);
    _str(o, "start", _start_string(p.birth_time));
    _num(o, "start_epoch", static_cast<double>(p.birth_time));
    _str(o, "time", _iso_now());

    _num(o, "xl", p.experience_level);
    _num(o, "turns", p.num_turns);
    _num(o, "aut", p.elapsed_time);
    _num(o, "real_time", p.real_time());
    const level_id here(p.where_are_you, p.depth);
    _str(o, "place", here.describe());
    _str(o, "branch", branches[p.where_are_you].abbrevname);
    _num(o, "depth", p.depth);
    _append_places(o, p);

    _str(o, "god", p.religion == GOD_NO_GOD ? string() : god_name(p.religion));
    _num(o, "piety", p.raw_piety);

    vector<string> runes;
    for (int r = 0; r < NUM_RUNE_TYPES; ++r)
        if (p.runes[r])
            runes.emplace_back(rune_type_name(r));
    json_append_member(o, "runes", _string_array(runes));
    vector<string> gems;
    for (int g = 0; g < NUM_GEM_TYPES; ++g)
        if (p.gems_found[g])
            gems.emplace_back(gem_adj(static_cast<gem_type>(g)));
    json_append_member(o, "gems", _string_array(gems));
    _num(o, "gold", p.gold);

    _num(o, "hp_max", p.hp_max);
    _num(o, "mp_max", p.max_magic_points);
    _num(o, "ac", p.armour_class());
    _num(o, "ev", p.evasion());
    _num(o, "sh", player_displayed_shield_class());
    _num(o, "str", p.strength(false));
    _num(o, "int", p.intel(false));
    _num(o, "dex", p.dex(false));
    json_append_member(o, "skills", _skills_obj(p));

    _str(o, "outcome", outcome);
    const bool downed = party::is_enabled() && party::is_player_downed(slot);
    if (se)
    {
        const xlog_fields fields = se->get_fields();
        _str(o, "killer", fields.str_field("killer"));
        _str(o, "ktyp", fields.str_field("ktyp"));
        _num(o, "score", se->get_score());
    }
    else if (p.props.exists(STATS_KILLER_KEY)
             && (downed || (final && outcome == "dead")))
    {
        _str(o, "killer", p.props[STATS_KILLER_KEY].get_string());
        _str(o, "ktyp", p.props.exists(STATS_KTYP_KEY)
                        ? p.props[STATS_KTYP_KEY].get_string() : string());
    }
    else
    {
        _str(o, "killer", "");
        _str(o, "ktyp", "");
    }
    if (party::is_enabled())
        _bool(o, "downed", downed);
    _num(o, "deaths", p.deaths);
    _bool(o, "wizard", p.wizard || p.explore);
    if (p.explore)
        _bool(o, "explore", true);

    _append_kills(o, p);
    _append_actions(o, p);
    _append_equipment(o, p);

    vector<string> spells;
    for (spell_type sp : p.spells)
        if (sp != SPELL_NO_SPELL && is_valid_spell(sp))
            spells.push_back(_spell_key(sp));
    json_append_member(o, "spells_known", _string_array(spells));

    char *encoded = json_encode(o);
    string line = encoded ? encoded : "";
    free(encoded);
    return line;
}

static void _append_lines(const vector<string> &lines)
{
    if (lines.empty())
        return;
    const string fallback = "./rcs/stats_events.jsonl";
    const string path = Options.save_dir.empty()
                        ? fallback
                        : Options.save_dir + "stats_events.jsonl";
    FILE *fp = fopen(path.c_str(), "a");
    if (!fp && path != fallback)
        fp = fopen(fallback.c_str(), "a");
    if (!fp)
        return;
    for (const string &line : lines)
        if (!line.empty())
            fprintf(fp, "%s\n", line.c_str());
    fclose(fp);
}

static bool _snapshots_enabled()
{
    return !crawl_state.game_is_arena() && !crawl_state.game_is_tutorial()
           && !crawl_state.test;
}

static string _safe_snapshot(int slot, bool final, const string &outcome,
                             const scorefile_entry *se)
{
    try
    {
        return stats_hero_snapshot_json(slot, final, outcome, se);
    }
    catch (...)
    {
        return "";
    }
}

void stats_append_hero_snapshots()
{
    if (!_snapshots_enabled())
        return;
    vector<string> lines;
    for (int slot = 0; slot < party::player_count(); ++slot)
        lines.push_back(_safe_snapshot(slot, false, "alive", nullptr));
    _append_lines(lines);
}

void stats_append_final_snapshots(const scorefile_entry &se)
{
    if (!_snapshots_enabled())
        return;
    const string outcome =
        _outcome_for(static_cast<kill_method_type>(se.get_death_type()));
    const int active = party::is_enabled() ? party::active_slot() : 0;
    vector<string> lines;
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        if (slot == active)
            lines.push_back(_safe_snapshot(slot, true, outcome, &se));
        else
        {
            const bool downed = party::is_player_downed(slot);
            lines.push_back(_safe_snapshot(slot, true,
                                           downed ? "dead" : outcome,
                                           nullptr));
        }
    }
    _append_lines(lines);
}

void stats_note_hero_downed(const scorefile_entry &se)
{
    if (!_snapshots_enabled())
        return;
    try
    {
        const xlog_fields fields = se.get_fields();
        you.props[STATS_KILLER_KEY] = fields.str_field("killer");
        you.props[STATS_KTYP_KEY] = fields.str_field("ktyp");
    }
    catch (...)
    {
    }
    const int slot = party::is_enabled() ? party::active_slot() : 0;
    _append_lines({ _safe_snapshot(slot, false, "alive", nullptr) });
}
