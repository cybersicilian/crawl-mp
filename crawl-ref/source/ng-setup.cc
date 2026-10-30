#include "AppHdr.h"
#include "archaeologist.h"

#include "ng-setup.h"

#include "account-start.h"
#include "acquire.h"
#include "bag.h"
#include "art-enum.h"
#include "artefact.h"
#include "character-trait.h"
#include "adjust.h"
#include "dungeon.h"
#include "end.h"
#include "files.h"
#include "god-companions.h"
#include "god-abil.h"
#include "hints.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-status-flag-type.h"
#include "items.h"
#include "item-use.h"
#include "jobs.h"
#include "makeitem.h"
#include "message.h"
#include "mutation.h"
#include "ng-init.h"
#include "ng-wanderer.h"
#include <cstdio>
#include "options.h"
#include "party.h"
#include "piety-info.h"
#include "place.h"
#include "prompt.h"
#include "religion.h"
#include "shopping.h"
#include "skills.h"
#include "species.h"
#include "spl-book.h"
#include "spl-damage.h"
#include "spl-summoning.h"
#include "spl-util.h"
#include "state.h"
#include "stringutil.h"
#include "tag-version.h"
#include "throw.h"
#include "transform.h"
#include "unwind.h"
#ifdef USE_TILE
#include "tilepick-p.h"
#endif

#define MIN_START_STAT       3

static void _init_player()
{
    you = player();
    dlua.callfn("dgn_clear_persistant_data", "");
}

// These backgrounds inherit a single existing artefact, not a second copy of
// it for every player. If another party member (including an Archaeologist)
// has reserved it, the ordinary starting item remains in its place.
static void _give_starting_unrand(int subtype, unrand_type unrand)
{
    if (get_unique_item_status(unrand) != UNIQ_NOT_EXISTS)
        return;
    for (item_def& item : you.inv)
    {
        if (!item.is_type(OBJ_ARMOUR, subtype) || is_artefact(item))
            continue;
        if (!make_item_unrandart(item, unrand))
            return;
        item_colour(item);
        item_set_appearance(item);
        you.equipment.update();
        const auto status = get_unique_item_status(unrand);
        if (party::is_enabled())
            for (int slot = 0; slot < party::player_count(); ++slot)
                party::get_player(slot).unique_items[unrand - UNRAND_START] = status;
        return;
    }
}

// Make sure no stats are unacceptably low
// (currently possible only for GhBe - 1KB)
static void _unfocus_stats()
{
    int needed;

    for (int i = 0; i < NUM_STATS; ++i)
    {
        int j = (i + 1) % NUM_STATS;
        int k = (i + 2) % NUM_STATS;
        if ((needed = MIN_START_STAT - you.base_stats[i]) > 0)
        {
            if (you.base_stats[j] > you.base_stats[k])
                you.base_stats[j] -= needed;
            else
                you.base_stats[k] -= needed;
            you.base_stats[i] = MIN_START_STAT;
        }
    }
}

// Some consumables to make the starts of Sprint a little easier.
static void _give_bonus_items()
{
    newgame_make_item(OBJ_POTIONS, POT_CURING);
    newgame_make_item(OBJ_POTIONS, POT_HEAL_WOUNDS);
    newgame_make_item(OBJ_POTIONS, POT_HASTE);
    newgame_make_item(OBJ_POTIONS, POT_MAGIC, 2);
    newgame_make_item(OBJ_POTIONS, POT_BERSERK_RAGE);
    newgame_make_item(OBJ_SCROLLS, SCR_BLINKING);
}

static void _autopickup_ammo(missile_type missile)
{
    if (Options.autopickup_starting_ammo)
        you.force_autopickup[OBJ_MISSILES][missile] = AP_FORCE_ON;
}

/**
 * Make an item during character creation.
 *
 * Puts the item in the first available slot in the inventory, equipping or
 * memorising the first spell from it as appropriate. If the item would be
 * useless, we try with a possibly more useful sub_type, then, if it's still
 * useless, give up and don't create any item.
 *
 * @param base, sub_type what the item is
 * @param qty            what size stack to make
 * @param plus           what the value of item_def::plus should be
 * @param force_ego      what the value of item_def::special should be
 * @param force_tutorial whether to create it even in the tutorial
 * @returns a pointer to the item created, if any.
 */
item_def* newgame_make_item(object_class_type base,
                            int sub_type, int qty, int plus,
                            int force_ego, bool force_tutorial)
{
    // Don't set normal equipment in the tutorial.
    if (!force_tutorial && crawl_state.game_is_tutorial())
        return nullptr;

    // not an actual item
    // the WPN_UNKNOWN case is used when generating a paper doll during
    // character creation
    if (sub_type == WPN_UNARMED || sub_type == WPN_UNKNOWN)
        return nullptr;

    if (you.species == SP_IRIT && base == OBJ_ARMOUR && sub_type == ARM_ROBE)
        sub_type = ARM_LEATHER_ARMOUR;

    // Some miscellaneous subtypes (bags) are equipment and must be placed in
    // a gear slot before autoequip_item() can equip them.
    item_def prototype;
    prototype.base_type = base;
    prototype.sub_type = sub_type;
    prototype.quantity = qty;
    inventory_category category = inventory_category_for(prototype);
    int slot;
    int start = category == INVENT_CONSUMABLE ? MAX_GEAR : 0;
    int end = category == INVENT_GEAR ? MAX_GEAR : ENDOFPACK;
    for (slot = start; slot < end; ++slot)
    {
        item_def& item = you.inv[slot];
        if (!item.defined())
            break;

        if (item.is_type(base, sub_type) && item.brand == force_ego
            && is_stackable_item(item))
        {
            item.quantity += qty;
            return &item;
        }
    }

    item_def &item(you.inv[slot]);
    item.base_type = base;
    item.sub_type  = sub_type;
    item.quantity  = qty;
    item.plus      = plus;
    item.brand     = force_ego;
    item.pos       = ITEM_IN_INVENTORY;
    item.link      = slot;

    // To mitigate higher shield penalties for smaller races, give small
    // races bucklers instead of shields.
    if (item.is_type(OBJ_ARMOUR, ARM_KITE_SHIELD) && you.body_size() < SIZE_MEDIUM)
        item.sub_type = ARM_BUCKLER;

    // If the character is restricted in wearing the requested armour,
    // hand out a replacement instead.
    if (item.base_type == OBJ_ARMOUR && !can_equip_item(item))
    {
        if (item.sub_type == ARM_HELMET || item.sub_type == ARM_HAT)
            item.sub_type = ARM_HAT;
        else if (item.sub_type == ARM_BUCKLER)
            item.sub_type = ARM_KITE_SHIELD;
        else if (is_shield(item))
            item.sub_type = ARM_BUCKLER;
        else if (get_armour_slot(item) == SLOT_BODY_ARMOUR
                 && you.has_mutation(MUT_FORMLESS))
        {
            item.sub_type = ARM_CLOAK;
            item.plus = max(item.plus, (short)1);
        }
        else
            item.sub_type = ARM_ROBE;
    }

    // Make sure we didn't get a stack of shields or such nonsense.
    ASSERT(item.quantity == 1 || is_stackable_item(item));

    // If that didn't help, nothing will.
    if (is_useless_item(item, false, true))
    {
        item = item_def();
        return nullptr;
    }

    // Make sure branded and/or enchanted items appear as such.
    item_set_appearance(item);

    if (item_type_is_equipment(item.base_type) || bag::is_bag(item))
        autoequip_item(item);

    if (item.base_type == OBJ_MISSILES)
        _autopickup_ammo(static_cast<missile_type>(item.sub_type));

    origin_set_startequip(item);
    if (item.base_type == OBJ_WEAPONS && you.species == SP_COGLIN)
        name_weapon(item);

    seen_item(item);

    return &item;
}

void give_throwing_ammo(int n)
{
    if (species::can_throw_large_rocks(you.species))
        newgame_make_item(OBJ_MISSILES, MI_LARGE_ROCK, n);
    else if (you.body_size(PSIZE_TORSO) <= SIZE_SMALL)
        newgame_make_item(OBJ_MISSILES, MI_BOOMERANG, 2*n);
    else
        newgame_make_item(OBJ_MISSILES, MI_JAVELIN, n);
}

static void _give_job_spells(job_type job)
{
    vector<spell_type> spells = get_job_spells(job);
    if (spells.empty())
        return;

    if (you.has_mutation(MUT_INNATE_CASTER))
    {
        for (spell_type s : spells)
            if (you.spell_no < MAX_DJINN_SPELLS && !spell_is_useless(s, false))
                add_spell_to_memory(s);
        return;
    }

    library_add_spells(spells, true);

    for (spell_type s : spells)
    {
        if (!spell_is_useless(s, false, true)
            && spell_difficulty(s) <= 1
            && (job != JOB_BLOOD_HUNTER || s == SPELL_KINDLED_VEINS))
        {
            add_spell_to_memory(s);
        }
    }
}

static void _give_offhand_weapon()
{
    const item_def *wpn = you.weapon();
    if (!wpn || you.offhand_item() || you.hands_reqd(*wpn) != HANDS_ONE)
        return;
    if (is_range_weapon(*wpn))
    {
        const int plus = you.char_class == JOB_HUNTER ? 0 : -2;
        newgame_make_item(OBJ_WEAPONS, WPN_SLING, 1, plus);
    }
    else
        newgame_make_item(OBJ_WEAPONS, WPN_DAGGER);
}

// The old Librarian received a random fixed book. Modern starts put those
// spells directly in the library instead of requiring a physical book.
static void _give_sage_library()
{
    vector<spell_type> chosen;
    int seen = 0;
    for (int i = 0; i < BOOK_ANNIHILATIONS; ++i)
    {
        const book_type book = static_cast<book_type>(i);
        if (!book_exists(book))
            continue;
        vector<spell_type> spells = spellbook_template(book);
        if (spells.empty())
            continue;
        if (one_chance_in(++seen))
            chosen = std::move(spells);
    }
    if (you.has_mutation(MUT_INNATE_CASTER))
    {
        for (spell_type spell : chosen)
            if (you.spell_no < MAX_DJINN_SPELLS
                && !you.has_spell(spell) && !spell_is_useless(spell, false))
                add_spell_to_memory(spell);
    }
    else
        library_add_spells(chosen, true);
}

void give_items_skills(const newgame_def& ng)
{
    // Set available equipment slots for the player before trying to give them
    // any items.
    you.equipment.update();

    create_wanderer();

    switch (you.char_class)
    {
    case JOB_BERSERKER:
        you.religion = GOD_TROG;
        you.raw_piety = 35;

        if (you_can_wear(SLOT_BODY_ARMOUR) != false)
            you.skills[SK_ARMOUR] += 2;
        else
        {
            you.skills[SK_DODGING]++;
            if (!is_useless_skill(SK_ARMOUR))
                you.skills[SK_ARMOUR]++; // converted later
        }
        break;

    case JOB_ARTIFICER:
    {
        if (species_apt(SK_ARMOUR) < species_apt(SK_DODGING))
            you.skills[SK_DODGING]++;
        else
            you.skills[SK_ARMOUR]++;
        break;
    }
    case JOB_CHAOS_KNIGHT:
    {
        you.religion = GOD_XOM;
        you.raw_piety = 100;
        int timeout_rnd = random2(40);
        timeout_rnd += random2(40); // force a sequence point between random2s
        you.gift_timeout = max(5, timeout_rnd);

        if (species_apt(SK_ARMOUR) < species_apt(SK_DODGING))
            you.skills[SK_DODGING]++;
        else
            you.skills[SK_ARMOUR]++;
        break;
    }

    case JOB_CINDER_ACOLYTE:
        you.religion = GOD_IGNIS;
        you.raw_piety = 150;
        break;

    case JOB_BLOOD_HUNTER:
        you.religion = GOD_VORR;
        you.raw_piety = 35;
        break;

    case JOB_HEALER:
        you.religion = GOD_ELYVILON;
        you.raw_piety = 45;
        break;

    case JOB_PREACHER:
        you.religion = GOD_ZIN;
        you.raw_piety = 35;
        break;

    case JOB_SAGE:
        you.religion = GOD_SIF_MUNA;
        you.raw_piety = 35;
        break;

    case JOB_HERMIT:
        you.religion = GOD_RU;
        you.raw_piety = 10;
        break;

    case JOB_SLIME_PRIEST:
        you.religion = GOD_JIYVA;
        you.raw_piety = 5;
        break;

#if TAG_MAJOR_VERSION == 34
    case JOB_DEATH_KNIGHT:
        you.religion = GOD_YREDELEMNUL;
        you.raw_piety = 38;
        break;

    case JOB_PRIEST:
        you.religion = GOD_SHINING_ONE;
        you.raw_piety = 50;
        break;

    case JOB_ABYSSAL_KNIGHT:
        you.religion = GOD_LUGONU;
        you.raw_piety = 38;
        break;

    case JOB_JESTER:
    {
        you.religion = GOD_XOM;
        you.raw_piety = 100;
        int timeout_rnd = random2(40);
        timeout_rnd += random2(40);
        you.gift_timeout = max(5, timeout_rnd);
        break;
    }
#endif

    case JOB_PALADIN:
        you.religion = GOD_SHINING_ONE;
        you.raw_piety = 45;
        you.props["paladin_aura"] = true;
        break;

    default:
        break;
    }

    if (you.char_class == JOB_CHAOS_KNIGHT)
        newgame_make_item(OBJ_WEAPONS, ng.weapon, 1, 0, SPWPN_CHAOS);
    else if (you.char_class == JOB_CINDER_ACOLYTE)
        newgame_make_item(OBJ_WEAPONS, ng.weapon, 1, -1, SPWPN_FLAMING);
    else if (you.char_class == JOB_BLOOD_HUNTER)
        newgame_make_item(OBJ_WEAPONS, ng.weapon, 1, 0, SPWPN_VAMPIRISM);
    else if (job_has_weapon_choice(you.char_class))
        newgame_make_item(OBJ_WEAPONS, ng.weapon);

    give_job_equipment(you.char_class);
    switch (you.char_class)
    {
    case JOB_FENCER:
        _give_starting_unrand(ARM_GLOVES, UNRAND_FENCERS);
        break;
    case JOB_APOTHECARY:
        _give_starting_unrand(ARM_HAT, UNRAND_ALCHEMIST);
        break;
    case JOB_PHILOSOPHER:
        _give_starting_unrand(ARM_HAT, UNRAND_PONDERING);
        break;
    case JOB_CARAVAN:
        // Party gold is shared, so retain this member's starting contribution.
        you.gold += 150;
        if (party::is_enabled())
            party::sync_shared_gold(you.gold);
        break;
    case JOB_COLLECTOR:
        if (item_def *scroll = newgame_make_item(OBJ_SCROLLS, SCR_COLLECTION))
        {
            scroll->props[COLLECTOR_CHOICE_KEY] = true;
            scroll->flags |= ISFLAG_IDENTIFIED;
        }
        break;
    case JOB_BILLIONAIRE:
    {
        // Gold is shared in a party: grant the fortune once, even if a
        // second Billionaire joins after some of it has been spent.
        player& owner = party::is_enabled() ? party::get_player(0) : you;
        const char* const key = "billionaire_starting_fortune";
        if (!owner.props.exists(key))
        {
            owner.props[key] = true;
            you.gold += 1000000;
            if (party::is_enabled())
                party::sync_shared_gold(you.gold);
        }
        break;
    }
    default:
        break;
    }
    account_start::give_items();
    if (party::multiplayer_enabled())
        newgame_make_item(OBJ_SCROLLS, SCR_SOUL_RECALL);
    give_job_skills(you.char_class);
    _give_job_spells(you.char_class);
    if (you.char_class == JOB_ARCHAEOLOGIST)
        archaeologist::start_quest();
    if (you.char_class == JOB_SAGE)
        _give_sage_library();
    if (you.char_class == JOB_GLADIATOR)
        give_throwing_ammo(1);

    if (you.has_mutation(MUT_NO_GRASPING)) // i.e. felids
        you.skills[SK_THROWING] = 0;

    if (is_useless_skill(SK_SHIELDS))
        you.skills[SK_SHIELDS] = 0;

    if (you.undead_state(false) == US_UNDEAD)
        you.skills[SK_SHAPESHIFTING] = 0; // Undead mystics

    if (you.has_mutation(MUT_WIELD_OFFHAND))
    {
        // Coglins would rather have two slings than one bow.
        if (you.char_class == JOB_HUNTER)
        {
            item_def *wpn = you.weapon();
            unequip_item(*wpn, false, true);
            wpn->sub_type = WPN_SLING;
            wpn->plus = 2;
            autoequip_item(*wpn);
        }
        _give_offhand_weapon();
    }

    if (!you_worship(GOD_NO_GOD))
    {
        you.worshipped[you.religion] = 1;
        set_god_ability_slots();
        if (!you_worship(GOD_XOM))
            you.piety_max[you.religion] = you.raw_piety;
    }

    if (crawl_state.game_is_descent())
        you.attribute[ATTR_VOUCHER] = 1;
}

void apply_starting_background_effects()
{
    static const char *const applied_key = "starting_background_effects_applied";
    if (you.props.exists(applied_key))
        return;
    if (you.char_class == JOB_HERMIT)
    {
        prepare_starting_ru();
        if (!ru_starting_health_sacrifice())
            die("Unable to apply the Hermit's starting sacrifice.");
    }
    else if (you.char_class == JOB_SLIME_PRIEST)
    {
        int gained = 0;
        for (int attempts = 0; gained < 3 && attempts < 500; ++attempts)
            if (mutate(RANDOM_SLIME_MUTATION, "Jiyva's starting gift",
                       false, false, true))
                ++gained;
        if (gained < 3)
            die("Unable to apply the Slime Priest's starting mutations.");
    }
    else
        return;
    you.props[applied_key] = true;
}

static void _setup_tutorial_miscs()
{
    // Allow for a few specific hint mode messages.
    // A few more will be initialised by the tutorial map.
    tutorial_init_hints();

    // No gold to begin with.
    you.gold = 0;

    // Give them some mana to play around with.
    you.mp_max_adj += 2;

    newgame_make_item(OBJ_ARMOUR, ARM_ROBE, 1, 0, 0, true);

    // No need for Shields skill without shield.
    you.skills[SK_SHIELDS] = 0;

    // Some spellcasting for the magic tutorial.
    if (crawl_state.map.find("tutorial_lesson4") != string::npos)
        you.skills[SK_SPELLCASTING] = 1;
}

static void _give_basic_knowledge()
{
    identify_inventory();
    mark_inventory_sets_unknown();

    // Removed item types are handled in _set_removed_types_as_identified.
}

static void _setup_generic(const newgame_def& ng,
                          bool normal_dungeon_setup /*for catch2-tests*/);

static string _ng_json_escape(const string &s)
{
    string out;
    out.reserve(s.size() + 8);
    for (unsigned char c : s)
    {
        if (c == '"')
            out += "\\\"";
        else if (c == '\\')
            out += "\\\\";
        else if (c == '\n')
            out += "\\n";
        else if (c == '\r')
            out += "\\r";
        else if (c == '\t')
            out += "\\t";
        else if (c >= 0x20)
            out += static_cast<char>(c);
    }
    return out;
}

static void _append_chronicle_party_comp()
{
    if (crawl_state.game_is_tutorial() || crawl_state.game_is_arena())
        return;

    string path = Options.save_dir.empty()
                  ? string("./rcs/coop_chronicle.jsonl")
                  : Options.save_dir + "coop_chronicle.jsonl";
    FILE *fp = fopen(path.c_str(), "a");
    if (!fp && path != "./rcs/coop_chronicle.jsonl")
        fp = fopen("./rcs/coop_chronicle.jsonl", "a");
    if (!fp)
        return;

    const int pcount = max(1, party::player_count());
    const bool ff = party::friendly_fire_enabled();
    const string seed_str = make_stringf("%llu", (unsigned long long)you.game_seed);
    const string place_str = _ng_json_escape(level_id::current().describe());

    string party_spec;
    string members_json = "[";
    for (int i = 0; i < pcount; ++i)
    {
        player &p = (i == party::active_slot()) ? you : party::get_player(i);
        // Equipment access resolves inventory through the current player context.
        unwind_var<player*> unwind_you(real_you, &p);
        const string p_name = p.your_name.empty()
                              ? make_stringf("Player%d", i + 1)
                              : p.your_name;
        const string sp_str = species::name(p.species);
        const string jb_str = get_job_name(p.char_class);
        const int xl = max(1, p.experience_level);
        string weapon;
        if (job_has_weapon_choice(p.char_class) || p.species == SP_HYDRA
            || species::mutation_level(p.species, MUT_NO_GRASPING))
        {
            const item_def *wpn = p.weapon();
            weapon = wpn ? weapon_base_name(static_cast<weapon_type>(wpn->sub_type))
                         : "unarmed";
        }

        if (i > 0)
        {
            party_spec += ",";
            members_json += ",";
        }
        party_spec += p_name + ":" + sp_str + "/" + jb_str;
        if (!weapon.empty())
            party_spec += "/" + weapon;
        members_json += make_stringf(
            "{\"slot\":%d,\"name\":\"%s\",\"species\":\"%s\",\"job\":\"%s\",\"weapon\":\"%s\",\"xl\":%d}",
            i,
            _ng_json_escape(p_name).c_str(),
            _ng_json_escape(sp_str).c_str(),
            _ng_json_escape(jb_str).c_str(),
            _ng_json_escape(weapon).c_str(),
            xl);
    }
    members_json += "]";

    fprintf(fp,
            "{\"type\":\"party_comp\",\"player_count\":%d,\"friendly_fire\":%s,"
            "\"seed\":\"%s\",\"place\":\"%s\",\"party_spec\":\"%s\","
            "\"members\":%s}\n",
            pcount,
            ff ? "true" : "false",
            _ng_json_escape(seed_str).c_str(),
            place_str.c_str(),
            _ng_json_escape(party_spec).c_str(),
            members_json.c_str());
    fclose(fp);
}

// Initialise a game based on the choice stored in ng.
void setup_game(const newgame_def& ng,
                bool normal_dungeon_setup /*for catch2-tests */)
{
    crawl_state.type = ng.type; // by default
    if (Options.seed_from_rc && ng.type != GAME_TYPE_CUSTOM_SEED)
    {
        // rc seed overrides seed from other sources, and forces a normal game
        // to be a custom seed game. There is currently no special designation
        // for sprint etc. games that involve a custom seed.
        // TODO: does this make any sense for hints mode?
        Options.seed = Options.seed_from_rc;
        if (ng.type == GAME_TYPE_NORMAL)
            crawl_state.type = GAME_TYPE_CUSTOM_SEED;
    }
    else if (Options.seed && ng.type != GAME_TYPE_CUSTOM_SEED)
    {
        // there's a seed lingering in the options, but we shouldn't use it.
        Options.seed = 0;
    }
    else if (!Options.seed && ng.type == GAME_TYPE_CUSTOM_SEED)
        crawl_state.type = GAME_TYPE_NORMAL;

    crawl_state.map  = ng.map;

    switch (crawl_state.type)
    {
    case GAME_TYPE_NORMAL:
    case GAME_TYPE_DESCENT:
    case GAME_TYPE_CUSTOM_SEED:
    case GAME_TYPE_TUTORIAL:
    case GAME_TYPE_SPRINT:
        break;
    case GAME_TYPE_HINTS:
        init_hints();
        break;
    case GAME_TYPE_ARENA:
    default:
        die("Bad game type");
        end(-1);
    }

    _setup_generic(ng, normal_dungeon_setup);
    party::setup_party_members_on_new_game();
    if (normal_dungeon_setup)
        _append_chronicle_party_comp();
}

static bool _spell_triggered_by(spell_type to_trigger, spell_type trigger)
{
    switch (to_trigger)
    {
        case SPELL_BATTLESPHERE:
            return battlesphere_can_mirror(trigger);
        case SPELL_SPELLSPARK_SERVITOR:
            return spell_servitorable(trigger);
        case SPELL_PERCUSSIVE_TEMPERING:
            return trigger == SPELL_CLOCKWORK_BEE
                    || trigger == SPELL_WALKING_ALEMBIC
                    || trigger == SPELL_PHALANX_BEETLE
                    || trigger == SPELL_MONARCH_BOMB
                    || trigger == SPELL_FORGE_LIGHTNING_SPIRE
                    || trigger == SPELL_FORGE_BLAZEHEART_GOLEM
                    || trigger == SPELL_RENDING_BLADE
                    || trigger == SPELL_BATTLESPHERE
                    || trigger == SPELL_SPLINTERFROST_SHELL
                    || trigger == SPELL_PLATINUM_PARAGON;
        default:
            return true;
    }
}

static bool _spell_has_trigger(spell_type to_trigger,
                               const set<spell_type> &triggers)
{
    for (spell_type trigger : triggers)
        if (_spell_triggered_by(to_trigger, trigger))
            return true;
    return _spell_triggered_by(to_trigger, SPELL_NO_SPELL);
}

static void _setup_innate_spells()
{
    set<spell_type> spellset;
    // Start with all spells from your job.
    for (spell_type sp : you.spells)
        if (sp != SPELL_NO_SPELL)
            spellset.insert(sp);

    // Ignore divine prohibitions on spells for zealot classes.
    unwind_var<god_type> no_god(you.religion, GOD_NO_GOD);

    // Get spells at XL 3 and every odd level thereafter.
    vector<spell_type> chosen_spells;
    int const min_lev[] = {1,2, 2,3,4, 5,6,6, 6,7,7, 8,9};
    int const max_lev[] = {1,2, 3,4,5, 5,6,7, 7,8,8, 9,9};
    for (int i = 0; i < 27 / 2; i++)
    {
        spell_type next_spell = SPELL_NO_SPELL;
        int seen = 0;
        for (int s = 0; s < NUM_SPELLS; ++s)
        {
            const spell_type spell = static_cast<spell_type>(s);

            if (!is_player_book_spell(spell)
                || spellset.find(spell) != spellset.end()
                || spell_is_useless(spell, false)
                || !_spell_has_trigger(spell, spellset))
            {
                continue;
            }

            const int lev = spell_difficulty(spell);
            if (lev >= min_lev[i] && lev <= max_lev[i]
                && one_chance_in(++seen))
            {
                next_spell = spell;
            }
        }
        ASSERT(next_spell != SPELL_NO_SPELL);
        spellset.insert(next_spell);
        chosen_spells.push_back(next_spell);
    }

    for (spell_type s : chosen_spells)
        you.props[INNATE_SPELLS_KEY].get_vector().push_back(s);
}

void initial_dungeon_setup()
{
    rng::generator levelgen_rng(BRANCH_DUNGEON);

    initialise_branch_depths();
    initialise_temples();
    init_level_connectivity();
    initialise_item_descriptions();

    you.zot_orb_monster = random_choose(MONS_ORB_OF_FIRE,
                                        MONS_ORB_OF_WINTER,
                                        MONS_ORB_OF_ENTROPY);
}

static void _set_starting_form(transformation form)
{
    // Undead mystics are allowed (if mediocre), but obviously can't start in a form.
    if (you.undead_state(false) == US_UNDEAD)
        return;

    const talisman_type tal_type = talisman_for_form(form);
    const item_def* talisman = nullptr;
    for (auto& item : you.inv)
    {
        if (item.is_type(OBJ_TALISMANS, tal_type))
        {
            talisman = &item;
            break;
        }
    }
    ASSERT(talisman);
    set_default_form(form, talisman);
    set_form(form, 1);
}

static void _setup_generic(const newgame_def& ng,
                           bool normal_dungeon_setup /*for catch2-tests*/)
{
    // this seems non-ideal, but messages are not being displayed at this point
    // so if a force_more_message triggers, the more will just show on a blank
    // screen. TODO: it's not clear to me why the more can show up without
    // the message that triggered it.
    unwind_bool no_more(crawl_state.show_more_prompt, false);

    rng::reset(); // initialize rng from Options.seed
    _init_player();
    party::apply_starting_campaign_modifiers(you);
    you.game_seed = crawl_state.seed;
    you.deterministic_levelgen =
                            Options.pregen_dungeon != level_gen_type::classic;

#if TAG_MAJOR_VERSION == 34
    // Avoid the remove_dead_shops() Gozag fixup in new games: see
    // ShoppingList::item_type_identified().
    you.props[REMOVED_DEAD_SHOPS_KEY] = true;
#endif

    // Needs to happen before we give the player items, so that item specs
    // in job descriptions can be parsed safely.
    initialise_item_sets();

    // Needs to happen before we give the player items, so that it's safe to
    // check whether those items need to be removed from their shopping list.
    shopping_list.refresh();

    you.your_name  = ng.name;
    you.species    = ng.species;
    you.char_class = ng.job;

    if (set_character_trait(you, party::starting_member(0).trait)
        != trait_restriction::allowed)
    {
        die("Incompatible character trait in party setup");
    }

    you.chr_class_name = get_job_name(you.char_class);

    std::unique_ptr<rng::subgenerator> creation_rng;
    const uint64_t starting_seed = party::starting_member(0).starting_seed;
    if (starting_seed)
        creation_rng.reset(new rng::subgenerator(starting_seed, STARTING_CHARACTER_SEQUENCE));

    species_stat_init(you.species);     // must be down here {dlb}

    // Before we get into the inventory init, set light radius based
    // on species vision.
    update_vision_range();

    job_stat_init(you.char_class);

    _unfocus_stats();

    give_basic_mutations(you.species);
    give_basic_trait_mutations();

    // This function depends on stats and mutations being finalised.
    give_items_skills(ng);

    roll_demonspawn_mutations();
    if (you.has_mutation(MUT_MULTILIVED))
        you.lives = 1;

    if (crawl_state.game_is_sprint())
        _give_bonus_items();

    // Give tutorial skills etc
    if (crawl_state.game_is_tutorial())
        _setup_tutorial_miscs();

    _give_basic_knowledge();

    // intentionally create the subgenerator either way, so that this has the
    // same impact on the current main rng for all chars.
    std::unique_ptr<rng::subgenerator> dj_rng(new rng::subgenerator);
    if (you.has_mutation(MUT_INNATE_CASTER))
        _setup_innate_spells();

    // A first pass to link the items properly.
    for (int i = 0; i < ENDOFPACK; ++i)
    {
        auto &item = you.inv[i];
        if (!item.defined())
            continue;
        item.pos = ITEM_IN_INVENTORY;
        item.link = i;
        // If consumables end up on a non-letter, auto_assign_item_slot below will crash.
        item.slot = index_to_letter(item.link >= MAX_GEAR
                                        ? item.link - MAX_GEAR
                                        : item.link);
        item_colour(item);  // set correct special and colour
    }

    // Put our weapon in our first item slot, if we have one.
    if (item_def* wpn = you.weapon())
        swap_inv_slots(*wpn, 0, false);

    // A second pass to apply the item_slot option.
    for (auto &item : you.inv)
    {
        if (!item.defined())
            continue;
        if (!item.props.exists("adjusted"))
        {
            item.props["adjusted"] = true;
            auto_assign_item_slot(item, true);
        }
    }

    if (you.char_class == JOB_SHAPESHIFTER)
        _set_starting_form(transformation::quill);
    else if (you.char_class == JOB_MYSTIC)
        _set_starting_form(transformation::vision);
    else if (you.char_class == JOB_STALKER)
        _set_starting_form(transformation::hypnogecko);

    reassess_starting_skills(false);
    init_skill_order();
    init_train();
    if (you.religion == GOD_TROG)
        join_trog_skills();
    if (you.religion != GOD_NO_GOD)
        you.piety_info.register_join();
    init_training();
    if (you.has_mutation(MUT_INNATE_CASTER))
        cleanup_innate_magic_skills();

    init_four_winds();

    // Apply autoinscribe rules to inventory.
    request_autoinscribe();
    autoinscribe();

    // We calculate hp and mp here; all relevant factors should be
    // finalised by now. (GDL)
    calc_hp();
    calc_mp();

    // Make sure the starting player is fully charged up.
    set_hp(you.hp_max);
    set_mp(you.max_magic_points);
    apply_starting_background_effects();
    set_hp(you.hp_max);
    set_mp(you.max_magic_points);

#ifdef USE_TILE
    if (starting_seed)
        randomize_doll_base();
#endif
    // Unwind the nested stream before releasing its parent. Otherwise its
    // destructor would restore a dangling pointer after creation finishes.
    if (starting_seed)
        dj_rng.reset();
    creation_rng.reset();

    if (normal_dungeon_setup)
        initial_dungeon_setup();

    // Generate the second name of Jiyva
    fix_up_jiyva_name();

    // Get rid of god companions left from previous games
    init_companions();

    // Create the save file.
    if (Options.no_save)
        you.save = new package();
    else
        you.save = new package(get_savedir_filename(you.your_name).c_str(),
                               true, true);

    // pregen temple -- it's quick and easy, and this prevents a popup from
    // happening. This needs to happen after you.save is created.
    if (normal_dungeon_setup && you.deterministic_levelgen &&
        !crawl_state.game_is_descent() && // disables temple
        !pregen_dungeon(level_id(BRANCH_TEMPLE, 1)))
    {
        die("Builder failure while trying to generate temple!");
    }
}
