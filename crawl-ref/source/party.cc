/**
 * @file
 * @brief Multiplayer / Party management, active-player context switching,
 *        proxy monster synchronization, and hybrid turn scheduling.
**/

#include "AppHdr.h"
#include "coop-content.h"
#include "auras.h"
#include "ng-restr.h"

#include "party.h"
#include "mercenary.h"

#include <algorithm>
#include <cctype>
#include <climits>
#include <cstdlib>

#include "act-iter.h"
#include "adjust.h"
#include "art-enum.h"
#include "artefact.h"
#include "automaton.h"
#include "cloud.h"
#include "coord.h"
#include "coordit.h"
#include "delay.h"
#include "dungeon.h"
#include "end.h"
#include "env.h"
#include "files.h"
#include "ghost.h"
#include "god-abil.h"
#include "god-conduct.h"
#include "god-passive.h"
#include "game-modifiers.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-use.h"
#include "items.h"
#include "jobs.h"
#include "libutil.h"
#include "los.h"
#include "losglobal.h"
#include "message.h"
#include "mgen-data.h"
#include "mon-behv.h"
#include "mon-cast.h"
#include "mon-place.h"
#include "mon-util.h"
#include "monster.h"
#include "mutation.h"
#include "nearby-danger.h"
#include "newgame-def.h"
#include "newgame.h"
#include "ng-init.h"
#include "initfile.h"
#include "ng-setup.h"
#include "options.h"
#include "output.h"
#include "player-stats.h"
#include "player.h"
#include "potion.h"
#include "prompt.h"
#include "random.h"
#include "religion.h"
#include "skills.h"
#include "species.h"
#include "spl-book.h"
#include "spl-clouds.h"
#include "spl-goditem.h"
#include "spl-summoning.h"
#include "spl-transloc.h"
#include "spl-util.h"
#include "state.h"
#include "stepdown.h"
#include "stringutil.h"
#include "tag-version.h"
#include "terrain.h"
#include "traps.h"
#include "travel.h"
#include "unwind.h"
#include "view.h"
#include "xom.h"
#ifdef USE_TILE
#include "tilepick-p.h"
#endif

static player s_players[party::MAX_PARTY_PLAYERS];
player *real_you = &s_players[0];

namespace party
{
    static coord_def _find_habitable_tile_near(const coord_def &center,
                                               int for_slot,
                                               int max_radius = 3);

    static int s_player_count = 1;
    static int s_active_slot = 0;
    // Classic Friendly Fire enabled by default (beams/AoEs can hit teammates
    // with standard safety prompts; melee cleaving ignores teammates).
    static bool s_friendly_fire = true;
    static bool s_simultaneous_turns = true;
    static bool s_seasoning_fast_boil = false;
    static bool s_seasoning_shared_ladle = false;
    static bool s_seasoning_heavy_pebbles = false;
    static bool s_seasoning_soul_tether = false;
    static bool s_seasoning_chaotic_ladle = false;
    static bool s_no_rune_locks = false;
    static bool s_shared_fate = false;
    static game_modifiers::traps s_trap_mode = game_modifiers::traps::normal;
    static int s_damage_dealt[MAX_PARTY_PLAYERS] = { 0, 0, 0, 0 };
    static int s_support_acts[MAX_PARTY_PLAYERS] = { 0, 0, 0, 0 };
    static string s_last_tasting_floor;
    static bool s_downed[MAX_PARTY_PLAYERS] = { false, false, false, false };
    static bool s_acted_this_round[MAX_PARTY_PLAYERS] = { false, false, false, false };
    static int s_aut_clock[MAX_PARTY_PLAYERS] = { 0, 0, 0, 0 };
    static int s_world_aut_clock = 0;
    static mid_t s_proxy_mid[MAX_PARTY_PLAYERS] = { 0, 0, 0, 0 };
    static int s_proxy_mindex[MAX_PARTY_PLAYERS] =
    {
        NON_MONSTER, NON_MONSTER, NON_MONSTER, NON_MONSTER
    };
    static vector<member_setup> s_member_configs;
    static bool s_slot0_name_configured = false;
    static bool s_switching_floor_context = false;
    // Floor on which the party last used its "last stand" (see
    // try_last_stand_revive). Empty = unused.
    static string s_last_stand_floor;

    static const char* const PROXY_SLOT_KEY = "party_player_slot";
    static const char* const PROXY_DOWNED_KEY = "party_downed_ghost";

    static void _ensure_default_member_configs()
    {
        if (s_member_configs.size() >= MAX_PARTY_PLAYERS)
            return;

        static const member_setup defaults[MAX_PARTY_PLAYERS] =
        {
            { "Hero",   SP_MINOTAUR,       JOB_FIGHTER },
            { "Lyra",   SP_DEEP_ELF,       JOB_CONJURER },
            { "Thorek", SP_MOUNTAIN_DWARF, JOB_BERSERKER },
            { "Pip",    SP_SPRIGGAN,       JOB_ENCHANTER },
        };

        for (int i = static_cast<int>(s_member_configs.size());
             i < MAX_PARTY_PLAYERS; ++i)
        {
            s_member_configs.push_back(defaults[i]);
        }
    }

    static bool _same_floor(const player &a, const player &b)
    {
        return a.where_are_you == b.where_are_you && a.depth == b.depth;
    }

    static const char* const WORLD_GENERATION_KEYS[] =
    {
        TEMPLE_MAP_KEY, TEMPLE_GODS_KEY, OVERFLOW_TEMPLES_KEY,
        game_modifiers::RUNE_LOCKS_DISABLED_KEY, game_modifiers::TRAPS_KEY,
        game_modifiers::SHARED_FATE_KEY,
    };

    static void _copy_world_generation(player& target, const player& source)
    {
        for (const char* key : WORLD_GENERATION_KEYS)
            if (source.props.exists(key))
                target.props[key] = source.props[key];
        target.uniq_map_names = source.uniq_map_names;
        target.uniq_map_tags = source.uniq_map_tags;
        target.uniq_map_names_abyss = source.uniq_map_names_abyss;
        target.uniq_map_tags_abyss = source.uniq_map_tags_abyss;
        target.vault_list = source.vault_list;
        target.branches_left = source.branches_left;
    }

    static void _merge_world_generation(player& target, const player& source)
    {
        for (const char* key : WORLD_GENERATION_KEYS)
            if (source.props.exists(key) && (!target.props.exists(key)
                || target.props[key].get_type() == SV_NONE))
                target.props[key] = source.props[key];
        target.uniq_map_names.insert(source.uniq_map_names.begin(), source.uniq_map_names.end());
        target.uniq_map_tags.insert(source.uniq_map_tags.begin(), source.uniq_map_tags.end());
        target.uniq_map_names_abyss.insert(source.uniq_map_names_abyss.begin(), source.uniq_map_names_abyss.end());
        target.uniq_map_tags_abyss.insert(source.uniq_map_tags_abyss.begin(), source.uniq_map_tags_abyss.end());
        target.vault_list.insert(source.vault_list.begin(), source.vault_list.end());
        target.branches_left |= source.branches_left;
    }

    // Secondary heroes spawn into an already loaded floor rather than passing
    // through LOAD_START_GAME. Record their first visit explicitly.
    static void _record_spawn_place(player& member)
    {
        if (member.global_info.num_visits || member.depth < 1)
            return;
        member.global_info.num_visits = member.global_info.levels_seen = 1;
        PlaceInfo& place = member.get_place_info();
        place.num_visits = place.levels_seen = 1;
        member.set_level_visited(level_id(member.where_are_you, member.depth));
    }

    static void _remove_proxy_for_slot(int slot)
    {
        if (slot < 0 || slot >= MAX_PARTY_PLAYERS)
            return;

        const int cached = s_proxy_mindex[slot];
        if (cached >= 0 && cached < MAX_MONSTERS)
        {
            monster &mon = env.mons[cached];
            if (mon.type != MONS_NO_MONSTER
                && mon.props.exists(PROXY_SLOT_KEY)
                && mon.props[PROXY_SLOT_KEY].get_int() == slot)
            {
                if (in_bounds(mon.pos()) && env.mgrid(mon.pos()) == cached)
                    env.mgrid(mon.pos()) = NON_MONSTER;
                else
                {
                    for (rectangle_iterator ri(0); ri; ++ri)
                        if (env.mgrid(*ri) == cached)
                            env.mgrid(*ri) = NON_MONSTER;
                }
                mon.reset();
                s_proxy_mindex[slot] = NON_MONSTER;
                s_proxy_mid[slot] = 0;
                return;
            }
            s_proxy_mindex[slot] = NON_MONSTER;
        }
        else if (s_proxy_mid[slot] == 0)
            return;

        for (int i = 0; i < MAX_MONSTERS; ++i)
        {
            monster &mon = env.mons[i];
            if (mon.type == MONS_NO_MONSTER)
                continue;
            if (!mon.props.exists(PROXY_SLOT_KEY))
                continue;
            if (mon.props[PROXY_SLOT_KEY].get_int() != slot)
                continue;

            const int mindex = mon.mindex();
            if (in_bounds(mon.pos()) && env.mgrid(mon.pos()) == mindex)
                env.mgrid(mon.pos()) = NON_MONSTER;
            else
            {
                for (rectangle_iterator ri(0); ri; ++ri)
                {
                    if (env.mgrid(*ri) == mindex)
                        env.mgrid(*ri) = NON_MONSTER;
                }
            }
            mon.reset();
        }
        s_proxy_mindex[slot] = NON_MONSTER;
        s_proxy_mid[slot] = 0;
    }

    void init()
    {
        set_multiplayer(false);
        s_player_count = 1;
        s_friendly_fire = true;
        s_simultaneous_turns = true;
        s_seasoning_fast_boil = false;
        s_seasoning_shared_ladle = false;
        s_seasoning_heavy_pebbles = false;
        s_seasoning_soul_tether = false;
        s_seasoning_chaotic_ladle = false;
        s_no_rune_locks = false;
        s_shared_fate = false;
        s_trap_mode = game_modifiers::traps::normal;
        s_slot0_name_configured = false;
        s_member_configs.clear();
        _ensure_default_member_configs();
        reset();
    }

    void reset()
    {
        reset_activities();
        reset_travel_contexts();
        _ensure_default_member_configs();

        // Prevent duplicate deletion of shared package* save across player slots
        package *shared_save = s_players[s_active_slot].save;
        for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
        {
            if (s_players[i].save && s_players[i].save != shared_save)
                delete s_players[i].save;
            s_players[i].save = nullptr;
        }
        delete shared_save;

        for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
        {
            s_players[i] = player();
            s_players[i].mid = mid_for_slot(i);
            s_downed[i] = false;
            s_acted_this_round[i] = false;
            s_aut_clock[i] = 0;
            s_proxy_mid[i] = 0;
            s_proxy_mindex[i] = NON_MONSTER;
            s_damage_dealt[i] = 0;
            s_support_acts[i] = 0;
        }
        s_world_aut_clock = 0;
        s_active_slot = 0;
        real_you = &s_players[0];
        s_switching_floor_context = false;
        s_last_stand_floor.clear();
        s_last_tasting_floor.clear();
    }

    bool is_enabled()
    {
        return s_player_count > 1;
    }

    int player_count()
    {
        return min(max(s_player_count, 1), MAX_PARTY_PLAYERS);
    }

    void set_player_count(int count)
    {
        _ensure_default_member_configs();
        s_player_count = min(max(count, 1), MAX_PARTY_PLAYERS);
    }

    static bool _parse_combo_spec(const string &raw_token, member_setup &out)
    {
        string token = trimmed_string(raw_token);
        if (token.empty())
            return false;

        string combo_str = token;
        const size_t colon = token.find(':');
        if (colon != string::npos)
        {
            string maybe_name = trimmed_string(token.substr(0, colon));
            if (!maybe_name.empty())
                out.name = maybe_name;
            combo_str = trimmed_string(token.substr(colon + 1));
        }

        // Optional weapon and creation seed preserve older party arguments.
        out.weapon = WPN_UNKNOWN;
        out.starting_seed = 0;
        out.trait = character_trait::none;
        const size_t combo_slash = combo_str.find('/');
        const size_t weapon_slash = combo_slash == string::npos
            ? string::npos : combo_str.find('/', combo_slash + 1);
        if (weapon_slash != string::npos)
        {
            string weapon = trimmed_string(combo_str.substr(weapon_slash + 1));
            const size_t seed_slash = weapon.find('/');
            if (seed_slash != string::npos)
            {
                string seed = weapon.substr(seed_slash + 1);
                const size_t trait_slash = seed.find('/');
                if (trait_slash != string::npos)
                {
                    const string trait = lowercase_string(trimmed_string(seed.substr(trait_slash + 1)));
                    if (!parse_character_trait(trait, out.trait))
                        return false;
                    seed = seed.substr(0, trait_slash);
                }
                if (seed.empty() || seed.find_first_not_of("0123456789") != string::npos
                    || seed.size() > 16)
                    return false;
                out.starting_seed = strtoull(seed.c_str(), nullptr, 10);
                weapon = weapon.substr(0, seed_slash);
            }
            out.weapon = str_to_weapon(weapon);
            combo_str = combo_str.substr(0, weapon_slash);
        }

        if (combo_str.length() == 4)
        {
            const string sp_abbr = combo_str.substr(0, 2);
            const string jb_abbr = combo_str.substr(2, 2);
            const species_type sp = species::from_abbrev(sp_abbr.c_str());
            const job_type jb = get_job_by_abbrev(jb_abbr.c_str());
            if (sp != SP_UNKNOWN && jb != JOB_UNKNOWN)
            {
                if (check_trait(out.trait, sp, jb) != trait_restriction::allowed)
                    return false;
                out.species = sp;
                out.job = jb;
                return true;
            }
        }

        const size_t slash = combo_str.find('/');
        if (slash != string::npos)
        {
            const string sp_str = trimmed_string(combo_str.substr(0, slash));
            const string jb_str = trimmed_string(combo_str.substr(slash + 1));
            species_type sp = sp_str.length() == 2
                ? species::from_abbrev(sp_str.c_str())
                : species::from_str_loose(sp_str, true);
            job_type jb = jb_str.length() == 2
                ? get_job_by_abbrev(jb_str.c_str())
                : get_job_by_name(jb_str.c_str());
            if (sp != SP_UNKNOWN && jb != JOB_UNKNOWN)
            {
                if (check_trait(out.trait, sp, jb) != trait_restriction::allowed)
                    return false;
                out.species = sp;
                out.job = jb;
                return true;
            }
        }

        return false;
    }

    void configure_from_arg(const std::string &spec)
    {
        _ensure_default_member_configs();
        string s = trimmed_string(spec);
        if (s.empty())
            return;

        // Pure integer count (e.g. "-party 3")
        bool all_digits = true;
        for (char c : s)
        {
            if (!isadigit(c))
            {
                all_digits = false;
                break;
            }
        }
        if (all_digits)
        {
            set_player_count(atoi(s.c_str()));
            return;
        }

        vector<string> parts = split_string(",", s);
        int explicit_count = -1;
        int member_idx = 0;

        for (const string &raw_part : parts)
        {
            string part = trimmed_string(raw_part);
            if (part.empty())
                continue;

            const string lower = lowercase_string(part);
            if (lower == "shared_fate=on" || lower == "shared_fate=off")
            {
                s_shared_fate = lower == "shared_fate=on";
                continue;
            }
            if (lower == "runelocks=off" || lower == "runelocks=on")
            {
                s_no_rune_locks = lower == "runelocks=off";
                continue;
            }
            if (lower == "traps=normal" || lower == "traps=none"
                || lower == "traps=floor" || lower == "traps=random")
            {
                s_trap_mode = lower == "traps=none" ? game_modifiers::traps::none
                            : lower == "traps=floor" ? game_modifiers::traps::floor_only
                            : lower == "traps=random" ? game_modifiers::traps::random_only
                            : game_modifiers::traps::normal;
                continue;
            }
            if (lower == "mp=on")
            {
                set_multiplayer(true);
                continue;
            }
            if (lower == "ff=on" || lower == "ff=true"
                || lower == "friendly_fire=on" || lower == "friendly_fire=true")
            {
                set_friendly_fire(true);
                continue;
            }
            if (lower == "ff=off" || lower == "ff=false"
                || lower == "friendly_fire=off" || lower == "friendly_fire=false")
            {
                set_friendly_fire(false);
                continue;
            }
            if (lower == "seasoning=fast_boil")
            {
                s_seasoning_fast_boil = true;
                continue;
            }
            if (lower == "seasoning=shared_ladle")
            {
                s_seasoning_shared_ladle = true;
                continue;
            }
            if (lower == "seasoning=heavy_pebbles")
            {
                s_seasoning_heavy_pebbles = true;
                continue;
            }
            if (lower == "seasoning=soul_tether")
            {
                s_seasoning_soul_tether = true;
                continue;
            }
            if (lower == "seasoning=chaotic_ladle")
            {
                s_seasoning_chaotic_ladle = true;
                continue;
            }

            if (part.length() == 1 && isadigit(part[0]))
            {
                explicit_count = part[0] - '0';
                continue;
            }

            // Support "3:Lyra:DECj" on the first token
            if (member_idx == 0 && part.length() > 2 && isadigit(part[0]) && part[1] == ':')
            {
                explicit_count = part[0] - '0';
                part = trimmed_string(part.substr(2));
            }

            // Fill slot 1..3 if count was prefix, or 0..3 if full party list
            const int target_slot = (explicit_count > 0 && member_idx == 0 && parts.size() < (size_t)explicit_count)
                ? 1
                : min(member_idx, MAX_PARTY_PLAYERS - 1);

            member_setup cfg = s_member_configs[target_slot];
            if (_parse_combo_spec(part, cfg))
            {
                s_member_configs[target_slot] = cfg;
                if (target_slot == 0 && part.find(':') != string::npos)
                    s_slot0_name_configured = true;
                member_idx = target_slot + 1;
            }
            else if (count(part.begin(), part.end(), '/') >= 4)
                end(1, false, "Invalid or incompatible party trait selection.");
        }

        if (explicit_count > 0)
            set_player_count(explicit_count);
        else if (member_idx > 1)
            set_player_count(member_idx);
    }

    static void _unfocus_member_stats(player &p)
    {
        for (int i = 0; i < NUM_STATS; ++i)
        {
            int j = (i + 1) % NUM_STATS;
            int k = (i + 2) % NUM_STATS;
            int needed = 3 - p.base_stats[i];
            if (needed > 0)
            {
                if (p.base_stats[j] > p.base_stats[k])
                    p.base_stats[j] -= needed;
                else
                    p.base_stats[k] -= needed;
                p.base_stats[i] = 3;
            }
        }
    }

    void apply_starting_campaign_modifiers(player& leader)
    {
        game_modifiers::set_campaign(leader, s_no_rune_locks, s_trap_mode,
                                     s_shared_fate);
    }

    bool starting_no_rune_locks() { return s_no_rune_locks; }
    game_modifiers::traps starting_trap_mode() { return s_trap_mode; }
    bool starting_shared_fate() { return s_shared_fate; }
    void set_starting_shared_fate(bool enabled) { s_shared_fate = enabled; }

    bool shared_fate_enabled()
    {
        return multiplayer_enabled() && game_modifiers::shared_fate(you);
    }

    void set_starting_campaign_modifiers(bool no_rune_locks, game_modifiers::traps mode)
    {
        s_no_rune_locks = no_rune_locks;
        s_trap_mode = mode;
    }

    const member_setup &starting_member(int slot)
    {
        _ensure_default_member_configs();
        ASSERT_RANGE(slot, 0, MAX_PARTY_PLAYERS);
        return s_member_configs[slot];
    }

    void set_starting_trait(int slot, character_trait trait)
    {
        _ensure_default_member_configs();
        ASSERT_RANGE(slot, 0, MAX_PARTY_PLAYERS);
        s_member_configs[slot].trait = trait;
    }

    const string &starting_name(int slot)
    {
        const auto &member = get_player(slot);
        const auto &configured = starting_member(slot);
        if (slot == 0 && ((s_slot0_name_configured && !configured.name.empty())
                         || member.your_name.empty()))
        {
            return configured.name;
        }
        return member.your_name;
    }

    static void _init_party_member_slot(int slot)
    {
        if (slot <= 0 || slot >= MAX_PARTY_PLAYERS)
            return;

        _ensure_default_member_configs();
        s_downed[slot] = false;
        s_aut_clock[slot] = s_world_aut_clock;
        s_proxy_mid[slot] = 0;

        const member_setup &cfg = s_member_configs[slot];

        scoped_player_context ctx(slot);

        // Clear save before resetting so we never free slot 0's package*
        you.save = nullptr;
        you = player();

        you.mid = mid_for_slot(slot);
        you.game_seed = s_players[0].game_seed;
        you.deterministic_levelgen = s_players[0].deterministic_levelgen;
        you.where_are_you = s_players[0].where_are_you;
        you.depth = s_players[0].depth;
        you.save = s_players[0].save;
        you.zot_orb_monster = s_players[0].zot_orb_monster;
        _copy_world_generation(you, s_players[0]);
        you.last_mid = s_players[0].last_mid;
        you.last_item_uid = s_players[0].last_item_uid;
        you.type_ids = s_players[0].type_ids;
        you.unique_items = s_players[0].unique_items;
        you.unique_creatures = s_players[0].unique_creatures;
        you.gold = s_players[0].gold;
        you.attribute[ATTR_GOLD_FOUND] = s_players[0].attribute[ATTR_GOLD_FOUND];
        you.attribute[ATTR_PURCHASES] = s_players[0].attribute[ATTR_PURCHASES];
        you.attribute[ATTR_DONATIONS] = s_players[0].attribute[ATTR_DONATIONS];
        you.attribute[ATTR_MISC_SPENDING] = s_players[0].attribute[ATTR_MISC_SPENDING];
        you.attribute[ATTR_GOLD_GENERATED] = s_players[0].attribute[ATTR_GOLD_GENERATED];
        you.attribute[ATTR_GOZAG_GOLD_USED] = s_players[0].attribute[ATTR_GOZAG_GOLD_USED];
        you.attribute[ATTR_VOUCHER] = s_players[0].attribute[ATTR_VOUCHER];
        you.runes = s_players[0].runes;
        you.gems_found = s_players[0].gems_found;
        you.gems_shattered = s_players[0].gems_shattered;
        you.gem_time_spent = s_players[0].gem_time_spent;

#if TAG_MAJOR_VERSION == 34
        you.props[REMOVED_DEAD_SHOPS_KEY] = true;
#endif

        you.your_name = cfg.name.empty()
            ? make_stringf("Player %d", slot + 1)
            : cfg.name;
        if (you.your_name == s_players[0].your_name)
            you.your_name += make_stringf("-%d", slot + 1);

        you.species = species::is_starting_species(cfg.species)
            ? cfg.species
            : SP_DEEP_ELF;
        you.char_class = is_starting_job(cfg.job) && character_is_allowed(you.species, cfg.job)
            ? cfg.job
            : JOB_CONJURER;
        you.chr_class_name = get_job_name(you.char_class);
        if (set_character_trait(you, cfg.trait) != trait_restriction::allowed)
            die("Incompatible character trait in party setup");

        // A reserved creation roll is independent of dungeon generation and
        // party-slot compaction, so a lobby preview survives into the expedition.
        std::unique_ptr<rng::subgenerator> creation_rng;
        if (cfg.starting_seed)
            creation_rng.reset(new rng::subgenerator(cfg.starting_seed, STARTING_CHARACTER_SEQUENCE));

        species_stat_init(you.species);
        update_vision_range();
        job_stat_init(you.char_class);
        _unfocus_member_stats(you);
        give_basic_mutations(you.species);
        give_basic_trait_mutations();

        newgame_def ng_member;
        ng_member.name = you.your_name;
        ng_member.type = crawl_state.type;
        ng_member.species = you.species;
        ng_member.job = you.char_class;
        ng_member.weapon = default_starting_weapon(ng_member);
        for (const auto& choice : starting_weapon_choices(ng_member))
            if (choice.first == cfg.weapon)
                ng_member.weapon = cfg.weapon;

        give_items_skills(ng_member);
        roll_demonspawn_mutations();
        if (you.has_mutation(MUT_MULTILIVED))
            you.lives = 1;

        identify_inventory();
        mark_inventory_sets_unknown();

        for (int i = 0; i < ENDOFPACK; ++i)
        {
            auto &item = you.inv[i];
            if (!item.defined())
                continue;
            item.pos = ITEM_IN_INVENTORY;
            item.link = i;
            item.slot = index_to_letter(item.link >= MAX_GEAR
                                            ? item.link - MAX_GEAR
                                            : item.link);
            item_colour(item);
        }

        if (item_def* wpn = you.weapon())
            swap_inv_slots(*wpn, 0, false);

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

        calc_hp();
        calc_mp();
        set_hp(you.hp_max);
        set_mp(you.max_magic_points);
        apply_starting_background_effects();
        set_hp(you.hp_max);
        set_mp(you.max_magic_points);

#ifdef USE_TILE
        if (cfg.starting_seed)
            randomize_doll_base();
#endif

        s_players[0].last_mid = max(s_players[0].last_mid, you.last_mid);
        s_players[0].last_item_uid = max(s_players[0].last_item_uid, you.last_item_uid);
        // Starting libraries are merged by sync_shared_state_from_active(),
        // which applies each recipient's species restrictions.
    }

    void setup_party_members_on_new_game()
    {
        _ensure_default_member_configs();
        s_players[0].mid = MID_PLAYER;
        s_downed[0] = false;
        s_aut_clock[0] = 0;
        s_world_aut_clock = 0;

        s_players[0].your_name = starting_name(0);

        if (!is_enabled())
            return;

        unwind_bool no_more(crawl_state.show_more_prompt, false);

        for (int slot = 1; slot < s_player_count; ++slot)
            _init_party_member_slot(slot);

        sync_shared_state_from_active();

        if (in_bounds(s_players[0].pos()))
        {
            place_party_around_active();
            sync_all_proxies();
        }
    }

    bool add_party_member(const std::string &spec)
    {
        if (s_player_count >= MAX_PARTY_PLAYERS)
            return false;

        _ensure_default_member_configs();
        const int new_slot = s_player_count;

        if (!spec.empty())
        {
            member_setup cfg = s_member_configs[new_slot];
            if (!_parse_combo_spec(spec, cfg))
                return false;
            s_member_configs[new_slot] = cfg;
        }

        s_player_count = new_slot + 1;

        // If the dungeon is already active, spawn the companion right next to the active player!
        if (in_bounds(you.pos()))
        {
            unwind_bool no_more(crawl_state.show_more_prompt, false);
            sync_shared_state_from_active();
            _init_party_member_slot(new_slot);
            s_players[new_slot].where_are_you = you.where_are_you;
            s_players[new_slot].depth = you.depth;

            // Find an open habitable cell near the active player
            coord_def spawn_pos = you.pos();
            for (distance_iterator di(you.pos(), false, true, 5); di; ++di)
            {
                if (!in_bounds(*di) || *di == you.pos())
                    continue;
                if (env.mgrid(*di) != NON_MONSTER)
                    continue;
                if (player_slot_at(*di, true) >= 0)
                    continue;
                if (!mons_class_can_pass(MONS_PLAYER_ILLUSION, env.grid(*di)))
                    continue;
                spawn_pos = *di;
                break;
            }
            s_players[new_slot].set_position(spawn_pos);
            _record_spawn_place(s_players[new_slot]);
            sync_shared_state_from_active();
            sync_player_to_proxy(new_slot);
            {
                scoped_player_context context(new_slot);
                if (you.char_class == JOB_CARAVAN && you.on_current_level)
                    mercenary::ensure_starter_companion();
            }
        }

        return true;
    }

    bool friendly_fire_enabled()
    {
        return s_friendly_fire;
    }

    void set_friendly_fire(bool enabled)
    {
        s_friendly_fire = enabled;
    }

    void save_friendly_fire()
    {
        s_players[0].props["party_friendly_fire"] = s_friendly_fire;
    }

    void restore_friendly_fire()
    {
        const auto &props = s_players[0].props;
        if (props.exists("party_friendly_fire"))
            s_friendly_fire = props["party_friendly_fire"].get_bool();
    }

    bool has_seasoning_fast_boil()
    {
        return s_seasoning_fast_boil;
    }

    bool has_seasoning_shared_ladle()
    {
        return s_seasoning_shared_ladle;
    }

    bool has_seasoning_heavy_pebbles()
    {
        return s_seasoning_heavy_pebbles;
    }

    bool has_seasoning_soul_tether()
    {
        return s_seasoning_soul_tether;
    }

    bool has_seasoning_chaotic_ladle()
    {
        return s_seasoning_chaotic_ladle;
    }

    int slot_damage_dealt(int slot)
    {
        return (slot >= 0 && slot < MAX_PARTY_PLAYERS) ? s_damage_dealt[slot] : 0;
    }

    int slot_support_acts(int slot)
    {
        return (slot >= 0 && slot < MAX_PARTY_PLAYERS) ? s_support_acts[slot] : 0;
    }

    std::string slot_mvp_title(int slot)
    {
        if (slot < 0 || slot >= s_player_count)
            return "Sous-Cook";
        int top_dmg_slot = 0, top_sup_slot = 0;
        for (int i = 1; i < s_player_count; ++i)
        {
            if (s_damage_dealt[i] > s_damage_dealt[top_dmg_slot])
                top_dmg_slot = i;
            if (s_support_acts[i] > s_support_acts[top_sup_slot])
                top_sup_slot = i;
        }
        if (slot == top_sup_slot && s_support_acts[slot] > 0)
            return "Master Ladler";
        if (slot == top_dmg_slot)
            return "Head Butcher";
        return "Pot Stirrer";
    }

    bool simultaneous_turns_enabled()
    {
        return s_simultaneous_turns;
    }

    void set_simultaneous_turns(bool enabled)
    {
        s_simultaneous_turns = enabled;
    }

    int active_slot()
    {
        return s_active_slot;
    }

    player& get_player(int slot)
    {
        const int clamped = min(max(slot, 0), MAX_PARTY_PLAYERS - 1);
        return s_players[clamped];
    }

    void sync_monster_ids()
    {
        mid_t highest = you.last_mid;
        for (int slot = 0; slot < player_count(); ++slot)
            highest = max(highest, s_players[slot].last_mid);
        you.last_mid = highest;
        for (int slot = 0; slot < player_count(); ++slot)
            s_players[slot].last_mid = highest;
    }

    mid_t mid_for_slot(int slot)
    {
        if (slot <= 0)
            return MID_PLAYER;
        return MID_PARTY_PLAYER_BASE + static_cast<mid_t>(min(slot, MAX_PARTY_PLAYERS - 1));
    }

    int slot_for_mid(mid_t m)
    {
        if (m == 0)
            return -1;
        if (m == MID_PLAYER)
            return 0;
        if (m >= MID_PARTY_PLAYER_BASE
            && m < MID_PARTY_PLAYER_BASE + static_cast<mid_t>(MAX_PARTY_PLAYERS))
        {
            const int slot = static_cast<int>(m - MID_PARTY_PLAYER_BASE);
            return slot < s_player_count ? slot : -1;
        }
        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_players[i].mid == m || s_proxy_mid[i] == m)
                return i;
        }
        return -1;
    }

    player* player_by_mid(mid_t m)
    {
        const int slot = slot_for_mid(m);
        if (slot >= 0 && slot < s_player_count)
            return &s_players[slot];
        return nullptr;
    }

    bool is_party_mid(mid_t m)
    {
        return player_by_mid(m) != nullptr;
    }

    int player_slot_at(const coord_def &pos, bool include_active)
    {
        if (!in_bounds(pos))
            return -1;

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (!include_active && i == s_active_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (s_players[i].pos() == pos)
                return i;
        }
        return -1;
    }

    player* player_at(const coord_def &pos, bool include_active)
    {
        const int slot = player_slot_at(pos, include_active);
        return slot >= 0 ? &s_players[slot] : nullptr;
    }

    void sync_shared_gold(int amount)
    {
        const int clamped = max(0, amount);
        for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
        {
            s_players[i].gold = clamped;
            if (i < s_player_count && s_players[i].religion == GOD_GOZAG)
                s_players[i].redraw_title = true;
        }
    }

    void sync_shared_state_from_active()
    {
        if (s_player_count <= 1)
            return;

        player &active = s_players[s_active_slot];
        auto shared_spell_library = active.spell_library;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot)
                continue;
            if (!multiplayer_enabled())
                active.elapsed_time = max(active.elapsed_time, s_players[i].elapsed_time);
            active.last_mid = max(active.last_mid, s_players[i].last_mid);
            active.last_item_uid = max(active.last_item_uid, s_players[i].last_item_uid);
            active.runes |= s_players[i].runes;
            active.gems_found |= s_players[i].gems_found;
            active.gems_shattered |= s_players[i].gems_shattered;
            for (int g = 0; g < NUM_GEM_TYPES; ++g)
            {
                active.gem_time_spent[g] =
                    max(active.gem_time_spent[g], s_players[i].gem_time_spent[g]);
            }
            active.unique_creatures |= s_players[i].unique_creatures;
            _merge_world_generation(active, s_players[i]);
            shared_spell_library |= s_players[i].spell_library;
            active.attribute[ATTR_GOLD_GENERATED] =
                max(active.attribute[ATTR_GOLD_GENERATED],
                    s_players[i].attribute[ATTR_GOLD_GENERATED]);
            active.attribute[ATTR_PURCHASES] =
                max(active.attribute[ATTR_PURCHASES],
                    s_players[i].attribute[ATTR_PURCHASES]);
            active.attribute[ATTR_DONATIONS] =
                max(active.attribute[ATTR_DONATIONS],
                    s_players[i].attribute[ATTR_DONATIONS]);
            active.attribute[ATTR_MISC_SPENDING] =
                max(active.attribute[ATTR_MISC_SPENDING],
                    s_players[i].attribute[ATTR_MISC_SPENDING]);
            active.attribute[ATTR_GOZAG_GOLD_USED] =
                max(active.attribute[ATTR_GOZAG_GOLD_USED],
                    s_players[i].attribute[ATTR_GOZAG_GOLD_USED]);
        }

        // Copy campaign-wide state without overwriting per-player where_are_you / depth!
        for (int i = 0; i < s_player_count; ++i)
        {
            player &p = s_players[i];
            // Keep the complete pool for other species even when the active
            // hero cannot engrave every shared spell.
            p.spell_library = shared_spell_library;
            if (p.species == SP_AUTOMATON)
            {
                for (int s = 0; s < NUM_SPELLS; ++s)
                    if (p.spell_library[s]
                        && !automaton::has_automatic_trigger(static_cast<spell_type>(s)))
                    {
                        p.spell_library.set(s, false);
                    }
            }
            if (i == s_active_slot)
                continue;
            if (!multiplayer_enabled())
                p.elapsed_time = active.elapsed_time;
            p.last_mid = active.last_mid;
            p.last_item_uid = active.last_item_uid;
            p.game_seed = active.game_seed;
            p.deterministic_levelgen = active.deterministic_levelgen;
            p.gold = active.gold;
            p.attribute[ATTR_GOLD_FOUND] = active.attribute[ATTR_GOLD_FOUND];
            p.attribute[ATTR_PURCHASES] = active.attribute[ATTR_PURCHASES];
            p.attribute[ATTR_DONATIONS] = active.attribute[ATTR_DONATIONS];
            p.attribute[ATTR_MISC_SPENDING] = active.attribute[ATTR_MISC_SPENDING];
            p.attribute[ATTR_GOLD_GENERATED] = active.attribute[ATTR_GOLD_GENERATED];
            p.attribute[ATTR_GOZAG_GOLD_USED] = active.attribute[ATTR_GOZAG_GOLD_USED];
            p.attribute[ATTR_VOUCHER] = active.attribute[ATTR_VOUCHER];
            p.runes = active.runes;
            p.gems_found = active.gems_found;
            p.gems_shattered = active.gems_shattered;
            p.gem_time_spent = active.gem_time_spent;
            p.unique_creatures = active.unique_creatures;
            _copy_world_generation(p, active);
            p.unique_items = active.unique_items;
            p.type_ids = active.type_ids;
            p.item_description = active.item_description;
            p.zot_orb_monster = active.zot_orb_monster;
            p.royal_jelly_dead = active.royal_jelly_dead;
            p.chapter = active.chapter;
            p.save = active.save;

            for (item_def &it : p.inv)
            {
                if (it.defined() && is_xp_evoker(it))
                    it.plus = evoker_plus(it.sub_type);
            }
        }
    }

    void sync_shared_state_to_all()
    {
        sync_shared_state_from_active();
    }

    void switch_to_player(int slot)
    {
        if (slot < 0 || slot >= s_player_count)
            return;

        if (slot == s_active_slot)
        {
            real_you = &s_players[slot];
            return;
        }

        switch_travel_context(s_active_slot, slot);
        const int old_slot = s_active_slot;
        player &old_player = s_players[old_slot];
        player &new_player = s_players[slot];

        sync_shared_state_from_active();

        const bool floor_changed = !_same_floor(old_player, new_player);

        if (floor_changed && old_player.save && old_player.on_current_level
            && in_bounds(old_player.pos()) && new_player.depth >= 1
            && in_bounds(new_player.pos()) && !crawl_state.game_is_arena())
        {
            const level_id old_lid(old_player.where_are_you, old_player.depth);
            const coord_def saved_new_pos = new_player.pos();

            // Remove all proxies before saving outgoing floor so proxy monsters
            // are not serialized as permanent level monsters.
            remove_all_proxies();
            save_level(old_lid);

            s_active_slot = slot;
            real_you = &s_players[slot];

            {
                unwind_bool switching_guard(s_switching_floor_context, true);
                load_level(DNGN_STONE_STAIRS_DOWN_I, LOAD_VISITOR, old_lid);
            }

            if (in_bounds(saved_new_pos) && !feat_is_solid(env.grid(saved_new_pos)))
            {
                if (env.mgrid(saved_new_pos) != NON_MONSTER
                    && !is_proxy_monster(env.mons[env.mgrid(saved_new_pos)]))
                {
                    const coord_def alt = _find_habitable_tile_near(saved_new_pos, slot, 3);
                    you.set_position(alt);
                }
                else
                    you.set_position(saved_new_pos);
            }

            // Ensure any downed ghosts follow the currently active survivor
            for (int i = 0; i < s_player_count; ++i)
            {
                if (i != s_active_slot && is_player_downed(i))
                    relocate_downed_ghost_to_survivor(i);
            }

            sync_all_proxies();
            you.turn_is_over = false;
            you.time_taken = player_speed();
            you.pos_at_turn_start = you.pos();
            if (in_bounds(you.pos()))
            {
                crawl_view.set_player_at(you.pos());
                los_changed();
            }
            return;
        }

        // Same-floor switch: remove incoming player's proxy so active `you`
        // never collides with its own proxy in env.mgrid, and remap monster
        // foe indices so monsters keep targeting the same party member.
        const monster *prev_target_proxy = get_proxy_monster(slot);
        const int prev_target_proxy_idx =
            prev_target_proxy ? prev_target_proxy->mindex() : MHITNOT;

        _remove_proxy_for_slot(slot);

        s_active_slot = slot;
        real_you = &s_players[slot];

        if (in_bounds(old_player.pos()))
            sync_player_to_proxy(old_slot);

        const monster *new_old_proxy = get_proxy_monster(old_slot);
        const int new_old_proxy_idx =
            (!is_player_downed(old_slot) && new_old_proxy)
                ? new_old_proxy->mindex()
                : MHITNOT;

        for (int i = 0; i < MAX_MONSTERS; ++i)
        {
            monster &m = env.mons[i];
            if (m.type == MONS_NO_MONSTER || is_proxy_monster(m))
                continue;
            if (m.friendly() && !m.has_ench(ENCH_FRENZIED))
                continue;

            if (m.foe == MHITYOU)
                m.foe = new_old_proxy_idx;
            else if (prev_target_proxy_idx != MHITNOT
                     && m.foe == prev_target_proxy_idx)
            {
                m.foe = MHITYOU;
            }
        }

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i != s_active_slot && is_player_downed(i))
                sync_player_to_proxy(i);
        }

        you.turn_is_over = false;
        you.time_taken = player_speed();
        you.pos_at_turn_start = you.pos();
        if (in_bounds(you.pos()))
        {
            crawl_view.set_player_at(you.pos());
            los_changed();
        }
    }

    scoped_player_context::scoped_player_context(int target_slot, bool swap_proxies)
        : m_prev_slot(s_active_slot), m_switched(false), m_swapped_proxies(false)
    {
        if (target_slot >= 0 && target_slot < MAX_PARTY_PLAYERS
            && target_slot != s_active_slot)
        {
            if (s_players[m_prev_slot].save && !s_players[target_slot].save)
                s_players[target_slot].save = s_players[m_prev_slot].save;
            m_switched = true;

            if (swap_proxies && is_enabled() && target_slot < s_player_count
                && !is_player_downed(target_slot)
                && _same_floor(s_players[m_prev_slot], s_players[target_slot])
                && in_bounds(s_players[m_prev_slot].pos())
                && in_bounds(s_players[target_slot].pos()))
            {
                m_swapped_proxies = true;
                const monster *prev_target_proxy = get_proxy_monster(target_slot);
                const int prev_target_proxy_idx =
                    prev_target_proxy ? prev_target_proxy->mindex() : MHITNOT;

                _remove_proxy_for_slot(target_slot);
                s_active_slot = target_slot;
                real_you = &s_players[target_slot];
                sync_player_to_proxy(m_prev_slot);

                const monster *new_prev_proxy = get_proxy_monster(m_prev_slot);
                const int new_prev_proxy_idx =
                    (!is_player_downed(m_prev_slot) && new_prev_proxy)
                        ? new_prev_proxy->mindex()
                        : MHITNOT;

                for (int i = 0; i < MAX_MONSTERS; ++i)
                {
                    monster &m = env.mons[i];
                    if (m.type == MONS_NO_MONSTER || is_proxy_monster(m))
                        continue;
                    if (m.friendly() && !m.has_ench(ENCH_FRENZIED))
                        continue;

                    if (m.foe == MHITYOU)
                        m.foe = new_prev_proxy_idx;
                    else if (prev_target_proxy_idx != MHITNOT
                             && m.foe == prev_target_proxy_idx)
                    {
                        m.foe = MHITYOU;
                    }
                }
            }
            else
            {
                if (is_enabled() && target_slot < s_player_count)
                {
                    if (monster *proxy = get_proxy_monster(target_slot))
                    {
                        if (in_bounds(proxy->pos())
                            && env.mgrid(proxy->pos()) == proxy->mindex())
                        {
                            env.mgrid(proxy->pos()) = NON_MONSTER;
                        }
                    }
                }
                s_active_slot = target_slot;
                real_you = &s_players[target_slot];
            }
        }
    }

    scoped_player_context::~scoped_player_context()
    {
        if (m_switched)
        {
            const int target_slot = s_active_slot;
            if (m_swapped_proxies)
            {
                const monster *curr_prev_proxy = get_proxy_monster(m_prev_slot);
                const int curr_prev_proxy_idx =
                    curr_prev_proxy ? curr_prev_proxy->mindex() : MHITNOT;

                _remove_proxy_for_slot(m_prev_slot);
                s_active_slot = m_prev_slot;
                real_you = &s_players[m_prev_slot];

                if (is_enabled() && target_slot < s_player_count)
                {
                    s_players[m_prev_slot].attribute[ATTR_GOLD_FOUND] =
                        s_players[target_slot].attribute[ATTR_GOLD_FOUND];
                    if (in_bounds(s_players[m_prev_slot].pos()))
                        sync_player_to_proxy(target_slot);
                }

                const monster *restored_target_proxy = get_proxy_monster(target_slot);
                const int restored_target_proxy_idx =
                    (!is_player_downed(target_slot) && restored_target_proxy)
                        ? restored_target_proxy->mindex()
                        : MHITNOT;

                for (int i = 0; i < MAX_MONSTERS; ++i)
                {
                    monster &m = env.mons[i];
                    if (m.type == MONS_NO_MONSTER || is_proxy_monster(m))
                        continue;
                    if (m.friendly() && !m.has_ench(ENCH_FRENZIED))
                        continue;

                    if (m.foe == MHITYOU)
                        m.foe = restored_target_proxy_idx;
                    else if (curr_prev_proxy_idx != MHITNOT
                             && m.foe == curr_prev_proxy_idx)
                    {
                        m.foe = MHITYOU;
                    }
                }
            }
            else
            {
                s_active_slot = m_prev_slot;
                real_you = &s_players[m_prev_slot];
                if (is_enabled() && target_slot < s_player_count)
                {
                    s_players[m_prev_slot].attribute[ATTR_GOLD_FOUND] =
                        s_players[target_slot].attribute[ATTR_GOLD_FOUND];
                    if (in_bounds(s_players[m_prev_slot].pos()))
                    {
                        const player &p = s_players[target_slot];
                        const bool downed = is_player_downed(target_slot);
                        monster *proxy = get_proxy_monster(target_slot);
                        if (proxy
                            && _same_floor(p, s_players[m_prev_slot])
                            && in_bounds(p.pos())
                            && proxy->pos() == p.pos()
                            && p.pos() != s_players[m_prev_slot].pos()
                            && proxy->type == (downed ? MONS_PLAYER_GHOST : MONS_PLAYER_ILLUSION)
                            && proxy->hit_points == (downed ? max(1, p.hp_max) : max(1, p.hp))
                            && proxy->max_hit_points == max(1, p.hp_max)
                            && env.mgrid(proxy->pos()) == NON_MONSTER)
                        {
                            env.mgrid(proxy->pos()) = proxy->mindex();
                        }
                        else
                            sync_player_to_proxy(target_slot);
                    }
                }
            }
        }
    }

    bool is_proxy_monster(const monster &mon)
    {
        return mon.type != MONS_NO_MONSTER && mon.props.exists(PROXY_SLOT_KEY);
    }

    int proxy_slot(const monster &mon)
    {
        if (!mon.props.exists(PROXY_SLOT_KEY))
            return -1;
        return mon.props[PROXY_SLOT_KEY].get_int();
    }

    bool same_actor_identity(const actor* first, const actor* second)
    {
        if (!first || !second)
            return false;
        if (first == second)
            return true;
        const auto actor_slot = [](const actor* act)
        {
            if (act->is_player())
                return slot_for_mid(act->mid);
            const monster* mon = act->as_monster();
            return mon && is_proxy_monster(*mon) ? proxy_slot(*mon) : -1;
        };
        const int first_slot = actor_slot(first);
        return first_slot >= 0 && first_slot < player_count()
               && first_slot == actor_slot(second);
    }

    monster* get_proxy_monster(int slot)
    {
        if (slot < 0 || slot >= MAX_PARTY_PLAYERS)
            return nullptr;

        const int cached = s_proxy_mindex[slot];
        if (cached >= 0 && cached < MAX_MONSTERS)
        {
            monster &mon = env.mons[cached];
            if (mon.type != MONS_NO_MONSTER
                && mon.props.exists(PROXY_SLOT_KEY)
                && mon.props[PROXY_SLOT_KEY].get_int() == slot)
            {
                return &mon;
            }
            s_proxy_mindex[slot] = NON_MONSTER;
        }
        else if (s_proxy_mid[slot] == 0)
            return nullptr;

        for (int i = 0; i < MAX_MONSTERS; ++i)
        {
            monster &mon = env.mons[i];
            if (mon.type == MONS_NO_MONSTER)
                continue;
            if (mon.props.exists(PROXY_SLOT_KEY)
                && mon.props[PROXY_SLOT_KEY].get_int() == slot)
            {
                s_proxy_mindex[slot] = i;
                return &mon;
            }
        }
        return nullptr;
    }

    static coord_def _find_habitable_tile_near(const coord_def &center,
                                               int for_slot,
                                               int max_radius)
    {
        if (!in_bounds(center))
            return center;

        for (int r = 1; r <= max_radius; ++r)
        {
            for (radius_iterator ri(center, r, C_SQUARE); ri; ++ri)
            {
                const coord_def c = *ri;
                if (!in_bounds(c) || c == center)
                    continue;
                if (grid_distance(c, center) != r)
                    continue;
                if (feat_is_solid(env.grid(c)) || feat_is_lava(env.grid(c))
                    || env.grid(c) == DNGN_DEEP_WATER)
                {
                    continue;
                }
                if (player_slot_at(c, true) != -1)
                    continue;

                const int mgrid_val = env.mgrid(c);
                if (mgrid_val != NON_MONSTER)
                {
                    const monster &occupant = env.mons[mgrid_val];
                    if (!is_proxy_monster(occupant) || proxy_slot(occupant) != for_slot)
                        continue;
                }
                return c;
            }
        }
        return center;
    }

    void sync_player_to_proxy(int slot)
    {
        if (slot < 0 || slot >= MAX_PARTY_PLAYERS)
            return;

        if (!is_enabled() || slot >= s_player_count || slot == s_active_slot)
        {
            _remove_proxy_for_slot(slot);
            return;
        }

        const player &active = s_players[s_active_slot];
        player &p = s_players[slot];
        const bool downed = is_player_downed(slot);

        // Downed players haunt and follow the surviving active party
        if (downed && !multiplayer_enabled() && in_bounds(active.pos()))
        {
            p.where_are_you = active.where_are_you;
            p.depth = active.depth;
            if (!in_bounds(p.pos()) || p.pos() == active.pos()
                || grid_distance(p.pos(), active.pos()) > 2)
            {
                const coord_def follow_pos = _find_habitable_tile_near(active.pos(), slot, 2);
                if (in_bounds(follow_pos) && follow_pos != active.pos())
                    p.set_position(follow_pos);
            }
        }

        // Only place a proxy monster on env.mgrid if on the same floor as active player
        if (!_same_floor(p, active) || !in_bounds(p.pos()))
        {
            _remove_proxy_for_slot(slot);
            return;
        }

        monster *mon = get_proxy_monster(slot);
        if (!mon)
        {
            mon = get_free_monster();
            if (!mon)
                return;
            mon->reset();
        }

        mon->type = downed ? MONS_PLAYER_GHOST : MONS_PLAYER_ILLUSION;
        mon->base_attitude = ATT_FRIENDLY;
        mon->mname = p.your_name;
        mon->mid = mid_for_slot(slot);
        mon->props[PROXY_SLOT_KEY] = slot;
        if (downed)
            mon->props[PROXY_DOWNED_KEY] = true;
        else if (mon->props.exists(PROXY_DOWNED_KEY))
            mon->props.erase(PROXY_DOWNED_KEY);

        mon->flags |= MF_NO_REWARD | MF_WAS_IN_VIEW | MF_SEEN;

        ghost_demon gd;
        gd.barebones_init();
        gd.name = p.your_name;
        gd.species = p.species;
        gd.job = p.char_class;
        gd.religion = p.religion;
        gd.xl = max(1, p.experience_level);
        gd.max_hp = max(1, p.hp_max);
        {
            player *saved_you = real_you;
            real_you = &p;
            // Proxies are refreshed by personal views and context switches.
            // Snapshot display stats without the combat accessors' random
            // rounding, so observing a hero cannot advance gameplay RNG.
            gd.ac = p.armour_class_scaled(1);
            gd.ev = p.evasion_scaled(1, false);
            real_you = saved_you;
        }
        mon->set_ghost(gd);

        mon->set_hit_dice(max(1, p.experience_level));
        mon->max_hit_points = max(1, p.hp_max);
        mon->hit_points = downed ? max(1, p.hp_max) : max(1, p.hp);
        mon->speed = 10;
        mon->speed_increment = 0;
        mon->foe = MHITYOU;
        mon->behaviour = BEH_SEEK;

        static const colour_t slot_colours[MAX_PARTY_PLAYERS] =
        {
            WHITE, LIGHTCYAN, YELLOW, LIGHTMAGENTA
        };
        mon->colour = downed ? DARKGREY : slot_colours[slot % MAX_PARTY_PLAYERS];

        const int mindex = mon->mindex();
        if (in_bounds(mon->pos()) && env.mgrid(mon->pos()) == mindex)
        {
            if (mon->pos() != p.pos())
                env.mgrid(mon->pos()) = NON_MONSTER;
        }
        else if (!in_bounds(mon->pos()) || mon->pos() != p.pos())
        {
            for (rectangle_iterator ri(0); ri; ++ri)
            {
                if (env.mgrid(*ri) == mindex && *ri != p.pos())
                    env.mgrid(*ri) = NON_MONSTER;
            }
        }

        if (p.pos() == active.pos())
        {
            const coord_def alt = _find_habitable_tile_near(active.pos(), slot, 3);
            if (in_bounds(alt) && alt != active.pos())
                p.set_position(alt);
        }

        if (p.pos() != active.pos()
            && (env.mgrid(p.pos()) == NON_MONSTER || env.mgrid(p.pos()) == mindex))
        {
            env.mgrid(p.pos()) = mindex;
            mon->set_position(p.pos());
        }
        else
            mon->set_position(p.pos());

        s_proxy_mindex[slot] = mindex;
        s_proxy_mid[slot] = mon->mid;
    }

    static void _forward_proxy_buffs_to_player(int slot, monster &mon)
    {
        if (slot < 0 || slot >= s_player_count || is_player_downed(slot))
            return;

        player &p = s_players[slot];
        struct proxy_buff_map
        {
            enchant_type ench;
            duration_type dur;
            const char *desc;
        };
        static const proxy_buff_map buff_table[] =
        {
            { ENCH_HASTE,            DUR_HASTE,            "hasted" },
            { ENCH_MIGHT,            DUR_MIGHT,            "mighty" },
            { ENCH_INVIS,            DUR_INVIS,            "invisible" },
#if TAG_MAJOR_VERSION == 34
            { ENCH_REGENERATION,     DUR_REGENERATION,     "regenerating" },
#endif
            { ENCH_SWIFT,            DUR_SWIFTNESS,        "swift" },
            { ENCH_RESISTANCE,       DUR_RESISTANCE,       "resistant to the elements" },
#if TAG_MAJOR_VERSION == 34
            { ENCH_DEFLECT_MISSILES, DUR_DEFLECT_MISSILES, "protected from missiles" },
#endif
            { ENCH_EMPOWERED_SPELLS, DUR_BRILLIANCE,       "brilliant" },
        };

        for (const auto &entry : buff_table)
        {
            if (mon.has_ench(entry.ench))
            {
                mon.del_ench(entry.ench, true, false);
                if (p.religion == GOD_CHEIBRIADOS
                    && (entry.dur == DUR_HASTE || entry.dur == DUR_SWIFTNESS))
                {
                    mprf(MSGCH_GOD, "%s's deliberate pace shrugs off the haste under Cheibriados's gaze.",
                         p.your_name.c_str());
                    continue;
                }
                if (p.religion == GOD_TROG && entry.dur == DUR_BRILLIANCE)
                {
                    mprf(MSGCH_GOD, "Trog's anti-magic fury burns away the arcane brilliance around %s!",
                         p.your_name.c_str());
                    continue;
                }
                p.duration[entry.dur] = min(max(p.duration[entry.dur], 100 * BASELINE_DELAY),
                                            p.duration[entry.dur] + 180);
                if (entry.dur == DUR_SWIFTNESS)
                    p.attribute[ATTR_SWIFTNESS] = p.duration[DUR_SWIFTNESS];
                mprf(MSGCH_RECOVERY, "%s is invigorated by your magic! (%s)",
                     p.your_name.c_str(), entry.desc);
            }
        }

        if (mon.has_ench(ENCH_DIVINE_SHIELD))
        {
            mon.del_ench(ENCH_DIVINE_SHIELD, true, false);
            const god_type src_god = s_players[s_active_slot].religion;
            if (src_god == GOD_NO_GOD || are_gods_concordant(src_god, p.religion))
            {
                p.duration[DUR_DIVINE_SHIELD] = max(p.duration[DUR_DIVINE_SHIELD], 5);
                mprf(MSGCH_RECOVERY, "%s is invigorated by your magic!",
                     p.your_name.c_str());
            }
        }
    }

    void sync_proxy_to_player(int slot)
    {
        if (slot < 0 || slot >= s_player_count || slot == s_active_slot)
            return;
        if (!_same_floor(s_players[slot], s_players[s_active_slot]))
            return;

        monster *mon = get_proxy_monster(slot);
        if (!mon)
            return;

        if (!is_player_downed(slot))
        {
            if (in_bounds(mon->pos()) && mon->pos() != s_players[s_active_slot].pos())
                s_players[slot].set_position(mon->pos());
            if (mon->hit_points > 0)
            {
                const int old_hp = s_players[slot].hp;
                int new_hp = min(s_players[slot].hp_max, mon->hit_points);

                if (new_hp < old_hp
                    && (s_players[slot].duration[DUR_PHALANX_BARRIER] > 0
                        || s_players[slot].duration[DUR_HEROISM] > 0)
                    && s_players[slot].props.exists(AEGIS_ANCHOR_SLOT_KEY))
                {
                    const int anchor_slot =
                        s_players[slot].props[AEGIS_ANCHOR_SLOT_KEY].get_int();
                    if (anchor_slot >= 0 && anchor_slot < s_player_count
                        && anchor_slot != slot
                        && !is_player_downed(anchor_slot)
                        && s_players[anchor_slot].hp > 1
                        && _same_floor(s_players[slot], s_players[anchor_slot])
                        && grid_distance(s_players[slot].pos(),
                                         s_players[anchor_slot].pos()) <= LOS_RADIUS)
                    {
                        const int loss = old_hp - new_hp;
                        const int redirected = min((loss * 35 + 50) / 100,
                                                   s_players[anchor_slot].hp - 1);
                        if (redirected > 0)
                        {
                            new_hp = min(s_players[slot].hp_max, new_hp + redirected);
                            mon->hit_points = new_hp;
                            s_players[anchor_slot].hp -= redirected;
                            if (anchor_slot != s_active_slot)
                                sync_player_to_proxy(anchor_slot);
                            mprf(MSGCH_PLAIN,
                                 "The Aegis Standard redirects %d of %s's damage to %s!",
                                 redirected,
                                 s_players[slot].your_name.c_str(),
                                 s_players[anchor_slot].your_name.c_str());
                        }
                    }
                }

                s_players[slot].hp = new_hp;
            }

            _forward_proxy_buffs_to_player(slot, *mon);
        }
    }

    bool slot_is_alive(int slot)
    {
        if (!is_enabled() || slot < 0 || slot >= s_player_count)
            return false;
        return !is_player_downed(slot) && s_players[slot].hp > 0;
    }

    bool slot_is_on_current_floor(int slot)
    {
        if (!is_enabled() || slot < 0 || slot >= s_player_count)
            return false;
        return _same_floor(s_players[slot], s_players[s_active_slot]);
    }

    void heal_or_buff_party_member(int slot, int heal_amount,
                                   duration_type dur, int dur_turns,
                                   bool cleanse_debuffs)
    {
        heal_or_buff_party_member(slot, heal_amount, 0, dur, dur_turns,
                                  nullptr, cleanse_debuffs);
    }

    void heal_or_buff_party_member(int slot, int heal_amount, int mp_amount,
                                   duration_type dur, int dur_turns,
                                   const char *msg_prefix,
                                   bool cleanse_debuffs)
    {
        if (!is_enabled() || slot < 0 || slot >= s_player_count)
            return;
        if (is_player_downed(slot) || s_players[slot].hp <= 0)
            return;

        player &p = s_players[slot];
        bool did_effect = false;
        if (heal_amount > 0 && p.hp < p.hp_max && !p.duration[DUR_DEATHS_DOOR])
        {
            p.hp = min(p.hp_max, p.hp + heal_amount);
            did_effect = true;
        }
        if (p.uses_magic_reserve() && mp_amount > 0 && p.magic_points < p.max_magic_points)
        {
            p.magic_points = min(p.max_magic_points, p.magic_points + mp_amount);
            did_effect = true;
        }

        if (cleanse_debuffs)
        {
            p.duration[DUR_SICKNESS] = 0;
            p.duration[DUR_POISONING] = 0;
            p.duration[DUR_CONF] = 0;
            p.duration[DUR_SLOW] = 0;
            p.duration[DUR_PETRIFYING] = 0;
            p.duration[DUR_WEAK] = 0;
            p.hp_max_adj_temp = 0;
            did_effect = true;
        }

        if (dur != NUM_DURATIONS && dur_turns > 0)
        {
            if (p.religion == GOD_CHEIBRIADOS
                && (dur == DUR_HASTE || dur == DUR_SWIFTNESS
                    || dur == DUR_FINESSE || dur == DUR_BERSERK))
            {
                // Cheibriados forbids haste/finesse/swiftness/berserk on followers.
                dur = NUM_DURATIONS;
            }
            else if (p.religion == GOD_TROG && dur == DUR_BRILLIANCE)
            {
                dur = NUM_DURATIONS;
            }
        }

        if (dur != NUM_DURATIONS && dur_turns > 0)
        {
            if (dur == DUR_DIVINE_SHIELD)
                p.duration[DUR_DIVINE_SHIELD] = max(p.duration[DUR_DIVINE_SHIELD], dur_turns);
            else
            {
                const int aut_add = dur_turns * BASELINE_DELAY;
                p.duration[dur] = min(max(p.duration[dur], 100 * BASELINE_DELAY),
                                      p.duration[dur] + aut_add);
                if (dur == DUR_DIVINE_VIGOUR && p.attribute[ATTR_DIVINE_VIGOUR] <= 0)
                    p.attribute[ATTR_DIVINE_VIGOUR] = 1;
                if (dur == DUR_SWIFTNESS)
                    p.attribute[ATTR_SWIFTNESS] = p.duration[DUR_SWIFTNESS];
            }
            did_effect = true;
        }

        if (did_effect && msg_prefix && *msg_prefix)
            mprf(MSGCH_RECOVERY, "%s %s!", msg_prefix, p.your_name.c_str());

        if (slot != s_active_slot)
            sync_player_to_proxy(slot);
    }

    static bool _is_divine_aura_duration(duration_type dur)
    {
        return dur == DUR_DIVINE_SHIELD
               || dur == DUR_DIVINE_VIGOUR
               || dur == DUR_DIVINE_STAMINA
               || dur == DUR_TROGS_HAND
               || dur == DUR_HEROISM
               || dur == DUR_FINESSE
               || dur == DUR_CHANNEL_ENERGY;
    }

    void apply_party_aura_buff(duration_type dur, int turns,
                               int radius, bool include_active,
                               god_type source_god)
    {
        if (!is_enabled() || dur == NUM_DURATIONS || turns <= 0)
            return;

        const player &active = s_players[s_active_slot];
        const god_type eff_god = (source_god != GOD_NO_GOD)
            ? source_god
            : (_is_divine_aura_duration(dur) ? active.religion : GOD_NO_GOD);

        for (int i = 0; i < s_player_count; ++i)
        {
            if (!include_active && i == s_active_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()) || !in_bounds(you.pos()))
                continue;
            if (grid_distance(s_players[i].pos(), you.pos()) > radius)
                continue;

            if (eff_god != GOD_NO_GOD && i != s_active_slot
                && !are_gods_concordant(eff_god, s_players[i].religion))
            {
                continue;
            }
            if (radius <= LOS_RADIUS && !you.see_cell_no_trans(s_players[i].pos()))
                continue;

            heal_or_buff_party_member(i, 0, dur, turns, false);
        }
    }

    void sync_all_proxies()
    {
        if (!is_enabled())
        {
            remove_all_proxies();
            return;
        }

        _remove_proxy_for_slot(s_active_slot);
        for (int slot = 0; slot < s_player_count; ++slot)
        {
            if (slot != s_active_slot)
                sync_player_to_proxy(slot);
        }
    }

    void remove_all_proxies()
    {
        for (int i = 0; i < MAX_MONSTERS; ++i)
        {
            monster &mon = env.mons[i];
            if (mon.type == MONS_NO_MONSTER)
                continue;
            if (!mon.props.exists(PROXY_SLOT_KEY))
                continue;

            const int mindex = mon.mindex();
            for (rectangle_iterator ri(0); ri; ++ri)
            {
                if (env.mgrid(*ri) == mindex)
                    env.mgrid(*ri) = NON_MONSTER;
            }
            mon.reset();
        }
        for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
            s_proxy_mid[i] = 0;
    }

    bool any_player_sees_cell(const coord_def &p, bool no_trans)
    {
        if (!in_bounds(p))
            return false;

        if (!is_enabled())
            return no_trans ? you.see_cell_no_trans(p) : you.see_cell(p);

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (grid_distance(s_players[i].pos(), p) > LOS_MAX_RANGE)
                continue;

            if (i == s_active_slot)
            {
                if (no_trans ? you.see_cell_no_trans(p) : you.see_cell(p))
                    return true;
            }
            else if (cell_see_cell(s_players[i].pos(), p,
                                   no_trans ? LOS_NO_TRANS : LOS_DEFAULT))
            {
                return true;
            }
        }
        return false;
    }

    player* nearest_visible_player(const actor *observer)
    {
        if (!observer)
            return &you;

        if (!is_enabled())
            return observer->can_see(you) ? &you : nullptr;

        const player &active = s_players[s_active_slot];
        player *best = nullptr;
        int best_slot = -1;
        int best_dist = INT_MAX;

        int current_foe_slot = -1;
        if (observer->is_monster())
        {
            const monster *mon_obs = observer->as_monster();
            if (mon_obs->foe == MHITYOU)
                current_foe_slot = s_active_slot;
            else if (mon_obs->foe < MAX_MONSTERS
                     && is_proxy_monster(env.mons[mon_obs->foe])
                     && !env.mons[mon_obs->foe].props.exists(PROXY_DOWNED_KEY))
            {
                current_foe_slot = proxy_slot(env.mons[mon_obs->foe]);
            }
        }

        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;

            bool visible = false;
            if (i == s_active_slot)
                visible = observer->can_see(you);
            else
            {
                visible = observer->see_cell(s_players[i].pos())
                          && s_players[i].visible_to(observer);
            }

            if (!visible)
                continue;

            const int d = grid_distance(observer->pos(), s_players[i].pos());
            const bool better_tie =
                (d == best_dist)
                && (i == current_foe_slot
                    || (best_slot != current_foe_slot && i == s_active_slot));
            if (d < best_dist || better_tie)
            {
                best_dist = d;
                best_slot = i;
                best = &s_players[i];
            }
        }
        return best;
    }

    bool party_feels_safe()
    {
        if (!is_enabled())
            return i_feel_safe();
        if (multiplayer_enabled())
            return region_feels_safe(s_active_slot);

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;

            scoped_player_context ctx(i);
            if (!i_feel_safe())
                return false;
        }
        return true;
    }

    bool resolve_pending_revivals()
    {
        if (!is_enabled())
            return false;

        bool revived = false;
        const int active = s_active_slot;
        for (int slot = 0; slot < s_player_count; ++slot)
        {
            if (slot == active || is_player_downed(slot)
                || !s_players[slot].pending_revival
                || !_same_floor(s_players[slot], s_players[active]))
            {
                continue;
            }
            {
                scoped_player_context ctx(slot, true);
                revive();
                bring_to_safety();
            }
            mprf("%s returns to life.", s_players[slot].your_name.c_str());
            revived = true;
        }
        return revived;
    }

    bool is_player_downed(int slot)
    {
        if (slot < 0 || slot >= s_player_count)
            return false;
        return s_downed[slot];
    }

    void restore_downed_state()
    {
        for (int slot = 0; slot < s_player_count; ++slot)
        {
            const auto& props = s_players[slot].props;
            s_downed[slot] = props.exists("party_downed") && props["party_downed"].get_bool();
        }
    }

    void relocate_downed_ghost_to_survivor(int downed_slot)
    {
        if (multiplayer_enabled())
            return;
        if (downed_slot < 0 || downed_slot >= s_player_count)
            return;

        int survivor_slot = -1;
        if (s_active_slot != downed_slot
            && !s_downed[s_active_slot]
            && s_players[s_active_slot].hp > 0)
        {
            survivor_slot = s_active_slot;
        }
        else
        {
            for (int i = 0; i < s_player_count; ++i)
            {
                if (i != downed_slot && !s_downed[i] && s_players[i].hp > 0)
                {
                    survivor_slot = i;
                    break;
                }
            }
        }

        if (survivor_slot < 0)
            return;

        player &ghost_plr = s_players[downed_slot];
        const player &survivor = s_players[survivor_slot];
        ghost_plr.where_are_you = survivor.where_are_you;
        ghost_plr.depth = survivor.depth;

        if (_same_floor(survivor, s_players[s_active_slot]) && in_bounds(survivor.pos()))
        {
            const coord_def near_pos = _find_habitable_tile_near(survivor.pos(), downed_slot, 2);
            ghost_plr.set_position(near_pos);
            if (downed_slot != s_active_slot)
                sync_player_to_proxy(downed_slot);
        }
        else
        {
            ghost_plr.set_position(survivor.pos());
            _remove_proxy_for_slot(downed_slot);
        }
    }

    void set_player_downed(int slot, bool downed)
    {
        if (slot < 0 || slot >= s_player_count)
            return;

        s_downed[slot] = downed;
        player &p = s_players[slot];
        p.props["party_downed"] = downed;

        if (downed)
        {
            p.hp = 1;
            p.delay_queue.clear();
            p.running.clear();
            s_aut_clock[slot] = s_world_aut_clock;
            relocate_downed_ghost_to_survivor(slot);

            const monster *proxy = get_proxy_monster(slot);
            const int proxy_idx = proxy ? proxy->mindex() : MHITNOT;
            for (int i = 0; i < MAX_MONSTERS; ++i)
            {
                monster &m = env.mons[i];
                if (m.type == MONS_NO_MONSTER || is_proxy_monster(m))
                    continue;
                if (m.friendly() && !m.has_ench(ENCH_FRENZIED))
                    continue;
                if ((slot == s_active_slot && m.foe == MHITYOU)
                    || (proxy_idx != MHITNOT && m.foe == proxy_idx))
                {
                    m.foe = MHITNOT;
                }
            }
        }
        else
        {
            if (p.hp <= 0)
                p.hp = max(1, p.hp_max / 3);
            s_aut_clock[slot] = s_world_aut_clock;
            if (slot != s_active_slot)
                sync_player_to_proxy(slot);
        }
    }

    bool any_other_player_alive(int excluding_slot)
    {
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == excluding_slot)
                continue;
            if (!s_downed[i] && s_players[i].hp > 0)
                return true;
        }
        return false;
    }

    bool any_player_alive()
    {
        for (int i = 0; i < s_player_count; ++i)
        {
            if (!s_downed[i] && s_players[i].hp > 0)
                return true;
        }
        return false;
    }

    bool prepare_survivor_for_death(int falling_slot)
    {
        if (shared_fate_enabled())
            return false;
        // Another member can have an extra life pending during the same
        // monster turn in which the last standing member falls.
        resolve_pending_revivals();
        return any_other_player_alive(falling_slot);
    }

    // All resurrection sources must update the saved and live downed state,
    // pending extra lives and recovery clock together.
    void apply_resurrection_cost()
    {
        if (!multiplayer_enabled())
            return;
        const int previous_cap = you.get_max_xl();
        reduce_level_cap(1);
        if (you.get_max_xl() < previous_cap)
            mprf(MSGCH_WARN, "Resurrection diminishes your potential. Your maximum level is now %d.",
                 you.get_max_xl());
        else
            mpr("Your maximum level cannot fall below 1.");
    }

    static void _restore_downed_member(int slot, int hp_numerator,
                                       int hp_denominator, int mp_denominator,
                                       bool preserve_mp = false)
    {
        player &p = s_players[slot];
        {
            scoped_player_context context(slot);
            apply_resurrection_cost();
        }
        // A cap reduction can also lower XL and maximum HP/MP. Calculate the
        // recovery from those new maxima, retaining exact fractional rounding.
        p.hp = max(1, p.hp_max * hp_numerator / hp_denominator);
        const int mp = max(0, p.max_magic_points / mp_denominator);
        if (p.uses_magic_reserve())
            p.magic_points = preserve_mp ? min(p.max_magic_points, max(p.magic_points, mp)) : mp;
        p.pending_revival = false;
        // While still downed, join the destination encounter at its current
        // clock instead of carrying pre-death recovery into the resurrection.
        if (multiplayer_enabled())
            reconcile_floor_regions();
        set_player_downed(slot, false);
    }

    void revive_downed_players(bool on_floor_transition, int hp_drain_percent)
    {
        if (!is_enabled() || shared_fate_enabled())
            return;

        bool any_downed = false;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_downed[i])
            {
                any_downed = true;
                break;
            }
        }
        if (!any_downed)
            return;

        if (!on_floor_transition && hp_drain_percent > 0)
        {
            const int eff_drain_pct = s_seasoning_soul_tether
                ? max(5, hp_drain_percent / 2) : hp_drain_percent;
            for (int i = 0; i < s_player_count; ++i)
            {
                if (!s_downed[i] && s_players[i].hp > 1)
                {
                    const int drain = max(1, (s_players[i].hp * eff_drain_pct) / 100);
                    s_players[i].hp = max(1, s_players[i].hp - drain);
                }
            }
        }

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (!s_downed[i])
                continue;

            player &p = s_players[i];
            p.where_are_you = active.where_are_you;
            p.depth = active.depth;
            p.level_stack = active.level_stack;
            _restore_downed_member(i, 1, 3, 3);
            if (s_seasoning_soul_tether)
            {
                heal_or_buff_party_member(i, 0, DUR_MIGHT, 12, false);
                heal_or_buff_party_member(i, 0, DUR_HASTE, 10, false);
            }

            if (in_bounds(active.pos()))
            {
                const coord_def pos = _find_habitable_tile_near(active.pos(), i, 3);
                p.set_position(pos);
            }

            mprf(MSGCH_RECOVERY, "%s returns from the threshold of death%s!",
                 p.your_name.c_str(),
                 s_seasoning_soul_tether ? " (Soul Tether: Haste, Might)" : "");
        }

        sync_all_proxies();
    }

    bool try_last_stand_revive(int falling_slot)
    {
        if (!is_enabled() || multiplayer_enabled())
            return false;

        bool any_downed = false;
        for (int i = 0; i < s_player_count; ++i)
            if (i != falling_slot && s_downed[i])
                any_downed = true;
        if (!any_downed)
            return false;

        const player &faller = s_players[falling_slot];
        const string floor = level_id(faller.where_are_you,
                                      faller.depth).describe();
        if (s_last_stand_floor == floor)
            return false;
        s_last_stand_floor = floor;

        mprf(MSGCH_DANGER,
             "As %s falls, the party's fallen rise for a last stand!",
             faller.your_name.c_str());
        // No HP drain: the only standing player is the one going down.
        revive_downed_players(true, 0);
        return true;
    }

    void place_party_around_active()
    {
        if (!is_enabled() || s_switching_floor_context)
            return;

        const player &active = s_players[s_active_slot];
        if (!in_bounds(active.pos()))
            return;

        for (int slot = 0; slot < s_player_count; ++slot)
        {
            if (slot == s_active_slot)
                continue;

            player &p = s_players[slot];
            if (is_player_downed(slot))
            {
                p.where_are_you = active.where_are_you;
                p.depth = active.depth;
            }
            if (!_same_floor(p, active))
                continue;

            const coord_def dest = _find_habitable_tile_near(active.pos(), slot, 4);
            p.set_position(dest);
            _record_spawn_place(p);
        }

        const string cur_floor = level_id(active.where_are_you, active.depth).describe();
        if (!s_last_tasting_floor.empty() && s_last_tasting_floor != cur_floor)
        {
            int top_slot = 0;
            for (int i = 1; i < s_player_count; ++i)
            {
                if (s_damage_dealt[i] > s_damage_dealt[top_slot])
                    top_slot = i;
            }
            if (s_damage_dealt[top_slot] > 0)
            {
                mprf(MSGCH_INTRINSIC_GAIN,
                     "Floor Tasting Note (%s) — Head Butcher: %s (%d dmg dealt)%s",
                     s_last_tasting_floor.c_str(),
                     s_players[top_slot].your_name.c_str(),
                     s_damage_dealt[top_slot],
                     s_seasoning_fast_boil ? " [Fast Boil +25%]" : "");
            }
        }
        s_last_tasting_floor = cur_floor;

        sync_all_proxies();
    }

    bool all_living_players_nearby(const coord_def &pos, int max_dist)
    {
        if (!is_enabled())
            return true;

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                return false;
            if (!in_bounds(s_players[i].pos()))
                return false;
            if (grid_distance(s_players[i].pos(), pos) > max_dist)
                return false;
        }
        return true;
    }

    int get_player_aut_clock(int slot)
    {
        if (multiplayer_enabled())
            return member_aut_clock(slot);
        if (slot < 0 || slot >= MAX_PARTY_PLAYERS)
            return s_world_aut_clock;
        return s_aut_clock[slot];
    }

    int get_world_aut_clock()
    {
        if (multiplayer_enabled())
            return member_region_clock(active_slot());
        return s_world_aut_clock;
    }

    int get_player_aut_lead(int slot)
    {
        if (multiplayer_enabled())
            return max(0, member_aut_clock(slot) - member_region_clock(slot));
        if (slot < 0 || slot >= MAX_PARTY_PLAYERS)
            return 0;
        return max(0, s_aut_clock[slot] - s_world_aut_clock);
    }

    void sync_idle_player_clocks_to(int target_clock)
    {
        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_aut_clock[i] < target_clock)
                s_aut_clock[i] = target_clock;
        }
    }

    int select_next_acting_player()
    {
        if (!is_enabled())
            return 0;

        const player &active = s_players[s_active_slot];
        int best_slot = -1;
        int best_clock = INT_MAX;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!same_region(i, s_active_slot))
                continue;
            const int clock = get_player_aut_clock(i);
            if (clock < best_clock)
            {
                best_clock = clock;
                best_slot = i;
            }
        }

        if (best_slot < 0)
        {
            for (int i = 0; i < s_player_count; ++i)
            {
                if (is_player_downed(i) || s_players[i].hp <= 0)
                    continue;
                if (!_same_floor(s_players[i], active))
                    continue;
                const int clock = get_player_aut_clock(i);
                if (clock < best_clock)
                {
                    best_clock = clock;
                    best_slot = i;
                }
            }
        }

        if (best_slot < 0 && !multiplayer_enabled())
        {
            for (int i = 0; i < s_player_count; ++i)
            {
                if (is_player_downed(i) || s_players[i].hp <= 0)
                    continue;
                if (s_aut_clock[i] < best_clock)
                {
                    best_clock = s_aut_clock[i];
                    best_slot = i;
                }
            }
        }

        return best_slot >= 0 ? best_slot : s_active_slot;
    }

    int record_player_turn_and_get_world_delta(int time_taken, int *out_floor_delta)
    {
        if (multiplayer_enabled())
            return advance_region_clock(time_taken, out_floor_delta);
        const int step = max(0, time_taken);
        s_players[s_active_slot].props["multiplayer_last_action_aut"] = step;
        if (!is_enabled())
        {
            s_aut_clock[0] += step;
            s_world_aut_clock = s_aut_clock[0];
            if (out_floor_delta)
                *out_floor_delta = step;
            return step;
        }

        reconcile_floor_regions();

        // If this player already had a positive aut_lead over s_world_aut_clock
        // (e.g. acting again in Simultaneous Mode while a teammate stood still),
        // bring lagging teammates' clocks up to s_aut_clock[s_active_slot] first
        // so monsters always receive the full aut delta.
        if (step > 0 && s_aut_clock[s_active_slot] > s_world_aut_clock)
            sync_idle_player_clocks_to(s_aut_clock[s_active_slot]);

        if (step > 0)
            s_acted_this_round[s_active_slot] = true;
        s_aut_clock[s_active_slot] += step;

        // In Safe Exploration with Simultaneous Turns, advance s_world_aut_clock
        // by this player's exact action cost (e.g. 6 aut for Spriggan, 10 aut
        // for Minotaur) and bring idle teammates up to s_world_aut_clock.
        if (s_simultaneous_turns && region_feels_safe(s_active_slot))
        {
            sync_idle_player_clocks_to(s_aut_clock[s_active_slot]);
            const int delta = max(0, s_aut_clock[s_active_slot] - s_world_aut_clock);
            s_world_aut_clock += delta;
            for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
                s_acted_this_round[i] = false;
            if (out_floor_delta)
                *out_floor_delta = delta;
            return delta;
        }

        const player &active = s_players[s_active_slot];
        int min_clock = INT_MAX;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!same_region(i, s_active_slot))
                continue;
            min_clock = min(min_clock, s_aut_clock[i]);
        }

        if (min_clock == INT_MAX)
            min_clock = s_aut_clock[s_active_slot];

        for (int i = 0; i < s_player_count; ++i)
        {
            if (is_player_downed(i) || s_players[i].hp <= 0
                || !_same_floor(s_players[i], active))
            {
                s_aut_clock[i] = max(s_aut_clock[i], min_clock);
            }
        }

        const int delta = max(0, min_clock - s_world_aut_clock);
        if (delta > 0)
        {
            s_world_aut_clock += delta;
            for (int i = 0; i < MAX_PARTY_PLAYERS; ++i)
            {
                if (s_aut_clock[i] <= s_world_aut_clock)
                    s_acted_this_round[i] = false;
            }
        }
        if (out_floor_delta)
            *out_floor_delta = delta;
        return delta;
    }

    static bool s_in_witness_conduct = false;

    pantheon_relation_type get_god_political_relation(god_type a, god_type b)
    {
        if (a <= GOD_NO_GOD || b <= GOD_NO_GOD || a >= NUM_GODS || b >= NUM_GODS)
            return pantheon_relation_type::NONE;
        if (a == b)
            return pantheon_relation_type::SHARED_COVENANT;
        // Only the good gods acknowledge one another in native religion.
        // Similar portfolios do not establish alliances between other gods.
        if (god_likes_your_god(a, b) && god_likes_your_god(b, a))
            return pantheon_relation_type::ALLIED_CONCORDAT;
        if ((is_good_god(a) && god_hates_your_god(a, b))
            || (is_good_god(b) && god_hates_your_god(b, a)))
        {
            return pantheon_relation_type::ANATHEMA;
        }
        return pantheon_relation_type::NEUTRAL;
    }

    bool are_gods_concordant(god_type a, god_type b)
    {
        const pantheon_relation_type rel = get_god_political_relation(a, b);
        return rel == pantheon_relation_type::SHARED_COVENANT
               || rel == pantheon_relation_type::ALLIED_CONCORDAT;
    }

    bool are_slots_concordant(int slot_a, int slot_b)
    {
        if (!is_enabled() || slot_a < 0 || slot_a >= s_player_count
            || slot_b < 0 || slot_b >= s_player_count)
        {
            return false;
        }
        if (slot_a == slot_b)
            return true;
        return are_gods_concordant(s_players[slot_a].religion,
                                   s_players[slot_b].religion);
    }

    const char* pantheon_relation_label(pantheon_relation_type rel)
    {
        switch (rel)
        {
        case pantheon_relation_type::SHARED_COVENANT:  return "Shared faith";
        case pantheon_relation_type::ALLIED_CONCORDAT: return "Good gods";
        case pantheon_relation_type::NEUTRAL:          return "Neutral";
        case pantheon_relation_type::RIVAL:            return "Rival";
        case pantheon_relation_type::ANATHEMA:         return "Anathema";
        default:                                       return "";
        }
    }

    static int _relation_priority(pantheon_relation_type rel)
    {
        switch (rel)
        {
        case pantheon_relation_type::ANATHEMA:         return 5;
        case pantheon_relation_type::SHARED_COVENANT:  return 4;
        case pantheon_relation_type::RIVAL:            return 3;
        case pantheon_relation_type::ALLIED_CONCORDAT: return 2;
        case pantheon_relation_type::NEUTRAL:          return 1;
        default:                                       return 0;
        }
    }

    pantheon_relation_type get_slot_pantheon_standing(int slot, int *partner_slot_out)
    {
        if (partner_slot_out)
            *partner_slot_out = -1;
        if (!coop_content::enabled() || !is_enabled() || slot < 0 || slot >= s_player_count)
            return pantheon_relation_type::NONE;

        const god_type my_god = s_players[slot].religion;
        if (my_god == GOD_NO_GOD)
            return pantheon_relation_type::NONE;

        pantheon_relation_type best_rel = pantheon_relation_type::NONE;
        int best_prio = 0;
        int best_partner = -1;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == slot || s_players[i].religion == GOD_NO_GOD)
                continue;
            const pantheon_relation_type rel =
                get_god_political_relation(my_god, s_players[i].religion);
            const int prio = _relation_priority(rel);
            if (prio > best_prio)
            {
                best_prio = prio;
                best_rel = rel;
                best_partner = i;
            }
        }

        if (partner_slot_out)
            *partner_slot_out = best_partner;
        return best_rel;
    }

    std::string describe_party_god_politics(int slot)
    {
        int partner_slot = -1;
        const pantheon_relation_type rel = get_slot_pantheon_standing(slot, &partner_slot);
        if (rel == pantheon_relation_type::NONE
            || rel == pantheon_relation_type::NEUTRAL
            || partner_slot < 0)
        {
            return "";
        }

        const player &partner = s_players[partner_slot];
        switch (rel)
        {
        case pantheon_relation_type::SHARED_COVENANT:
            return make_stringf("Shared faith with %s", partner.your_name.c_str());
        case pantheon_relation_type::ALLIED_CONCORDAT:
            return make_stringf("Good gods: %s serves %s",
                                partner.your_name.c_str(),
                                god_name(partner.religion).c_str());
        case pantheon_relation_type::RIVAL:
            return make_stringf("Rival (vs. %s's %s)",
                                partner.your_name.c_str(),
                                god_name(partner.religion).c_str());
        case pantheon_relation_type::ANATHEMA:
            return make_stringf("Anathema (vs. %s's %s)",
                                partner.your_name.c_str(),
                                god_name(partner.religion).c_str());
        default:
            return "";
        }
    }

    void on_player_join_god(int slot, god_type new_god, god_type /*old_god*/)
    {
        if (!coop_content::enabled() || !is_enabled()
            || slot < 0 || slot >= s_player_count || new_god == GOD_NO_GOD)
        {
            return;
        }
        // Companions do not convert when another hero joins a religion.
        // Native apostasy and conduct rules own piety and divine punishment.
        for (int i = 0; i < s_player_count; ++i)
            if (i != slot && slot_is_alive(i) && !is_player_downed(i)
                && are_gods_concordant(new_god, s_players[i].religion))
            {
                mprf(MSGCH_GOD, "%s shares %s's faith with %s.",
                     s_players[slot].your_name.c_str(), god_name(new_god).c_str(),
                     s_players[i].your_name.c_str());
            }
    }

    int adjust_kill_piety_for_party_politics(int base_piety)
    {
        // Judge the worshipper's deed, not a companion's choice of patron.
        if (coop_content::enabled() && s_seasoning_chaotic_ladle
            && base_piety > 0 && !s_in_witness_conduct)
        {
            base_piety += div_rand_round(base_piety * 15, 100);
        }
        return base_piety;
    }

    void broadcast_party_kill_conducts(const monster &mons, killer_type killer,
                                       int /*killer_index*/, bool gives_xp)
    {
        if (!coop_content::enabled() || !is_enabled() || !gives_xp || is_proxy_monster(mons))
            return;

        const bool player_party_kill =
            killer == KILL_YOU || killer == KILL_YOU_MISSILE
            || killer == KILL_YOU_CONF || killer == KILL_MON
            || killer == KILL_MON_MISSILE;
        if (!player_party_kill)
            return;

        const int killer_slot = active_slot();
        const player &active = s_players[killer_slot];
        const god_type killer_god = active.religion;

        unwind_bool witness_guard(s_in_witness_conduct, true);

        for (int slot = 0; slot < s_player_count; ++slot)
        {
            if (slot == killer_slot || is_player_downed(slot)
                || s_players[slot].hp <= 0)
            {
                continue;
            }
            if (!_same_floor(s_players[slot], active))
                continue;
            const god_type wit_god = s_players[slot].religion;
            if (wit_god == GOD_NO_GOD)
                continue;

            // Must be within LOS of either the slain monster or the killer.
            const coord_def wit_pos = s_players[slot].pos();
            if (!in_bounds(wit_pos))
                continue;
            if (!cell_see_cell(wit_pos, mons.pos(), LOS_DEFAULT)
                && !cell_see_cell(wit_pos, active.pos(), LOS_DEFAULT))
            {
                continue;
            }

            scoped_player_context ctx(slot);

            // 1. Ru sacrifice progress for witnessed kills (only if not Anathema)
            const pantheon_relation_type rel =
                get_god_political_relation(wit_god, killer_god);

            if (you_worship(GOD_RU)
                && rel != pantheon_relation_type::ANATHEMA
                && you.props.exists(RU_SACRIFICE_PROGRESS_KEY)
                && mons_threat_level(mons) >= MTHRT_TRIVIAL
                && coinflip())
            {
                you.props[RU_SACRIFICE_PROGRESS_KEY].get_int()++;
            }

            // 2. Yredelemnul Black Torch stoking for witnessed kills (only if not Anathema)
            if (you_worship(GOD_YREDELEMNUL)
                && rel != pantheon_relation_type::ANATHEMA
                && (mons.holiness() & (MH_NATURAL | MH_DEMONIC | MH_HOLY))
                && !yred_torch_is_raised()
                && coinflip())
            {
                yred_feed_torch(&mons);
            }

            // Shared credit is possible only within the same faith or the
            // good gods. Another hero's patron never creates a punitive hit.
            if (mons.is_holy() && is_good_god(wit_god))
                continue;

            if (!are_gods_concordant(wit_god, killer_god))
                continue;

            const int share_pct =
                (rel == pantheon_relation_type::SHARED_COVENANT) ? 75 : 65;

            if (!x_chance_in_y(share_pct, 100))
                continue;

            const mon_holy_type holiness = mons.holiness();
            if (holiness & MH_DEMONIC)
                did_kill_conduct(DID_KILL_DEMON, mons);
            else if (holiness & (MH_NATURAL | MH_PLANT))
            {
                did_kill_conduct(DID_KILL_LIVING, mons);
                if (mons.evil())
                    did_kill_conduct(DID_KILL_NATURAL_EVIL, mons);
            }
            else if (holiness & MH_UNDEAD)
                did_kill_conduct(DID_KILL_UNDEAD, mons);
            else if (holiness & MH_NONLIVING)
                did_kill_conduct(DID_KILL_NONLIVING, mons);

            if (mons.how_unclean())
                did_kill_conduct(DID_KILL_UNCLEAN, mons);
            else if (mons.how_chaotic())
                did_kill_conduct(DID_KILL_CHAOTIC, mons);

            if (mons.is_actual_spellcaster())
                did_kill_conduct(DID_KILL_WIZARD, mons);
            if (mons.is_priest())
                did_kill_conduct(DID_KILL_PRIEST, mons);
            if (mons.is_holy() && !is_good_god(wit_god))
                did_kill_conduct(DID_KILL_HOLY, mons);
            if (cheibriados_thinks_mons_is_fast(mons) && !mons.cannot_move())
                did_kill_conduct(DID_KILL_FAST, mons);
        }
    }

    void on_party_hurt_monster(const monster &victim, int damage_done,
                               beam_type /*flavour*/, kill_method_type /*kill_type*/)
    {
        if (!coop_content::enabled() || !is_enabled() || damage_done <= 0 || victim.is_firewood()
            || is_proxy_monster(victim))
        {
            return;
        }

        const int attacker_slot = active_slot();
        if (attacker_slot >= 0 && attacker_slot < MAX_PARTY_PLAYERS)
            s_damage_dealt[attacker_slot] += damage_done;
        const player &active = s_players[attacker_slot];

        if (s_seasoning_chaotic_ladle && one_chance_in(22))
        {
            const int boon_slot = random2(s_player_count);
            if (!is_player_downed(boon_slot) && s_players[boon_slot].hp > 0
                && _same_floor(s_players[boon_slot], active))
            {
                const duration_type boons[] = {
                    DUR_MIGHT,
#if TAG_MAJOR_VERSION == 34
                    DUR_REGENERATION,
#endif
                    DUR_BRILLIANCE, DUR_SWIFTNESS
                };
                const duration_type chosen = boons[random2(ARRAYSZ(boons))];
                heal_or_buff_party_member(boon_slot, 3 + random2(5), chosen,
                                          random_range(6, 11), false);
                mprf(MSGCH_GOD,
                     "The Chaotic Ladle bubbles over, splashing %s with wild vigour!",
                     s_players[boon_slot].your_name.c_str());
            }
        }

        // Elemental interactions belong to native beams, clouds and terrain.
        // Backgrounds are starting kits, not permanent support classes.
        for (int slot = 0; slot < s_player_count; ++slot)
        {
            if (slot == attacker_slot || is_player_downed(slot)
                || s_players[slot].hp <= 0)
            {
                continue;
            }
            if (!_same_floor(s_players[slot], active))
                continue;

            player &p = s_players[slot];
            if (p.religion != GOD_USKAYAW && p.religion != GOD_BEOGH)
                continue;
            if (!are_gods_concordant(p.religion, active.religion))
                continue;
            if (!in_bounds(p.pos()) || !cell_see_cell(p.pos(), victim.pos(), LOS_DEFAULT))
                continue;

            const int shared_dmg = max(1, damage_done / 2);
            if (p.religion == GOD_USKAYAW)
            {
                const int hurt_val = victim.max_hit_points > 0
                    ? random2(2) + sqr((mons_threat_level(victim) + 1) * 2)
                                   * shared_dmg / victim.max_hit_points
                    : 0;
                p.props[USKAYAW_NUM_MONSTERS_HURT].get_int() += 1;
                p.props[USKAYAW_MONSTER_HURT_VALUE].get_int() += hurt_val;
            }
            else if (p.religion == GOD_BEOGH)
            {
                const int bonus = min(victim.hit_points,
                                      min(shared_dmg, max(1, victim.max_hit_points / 2)));
                p.props[BEOGH_DAMAGE_DONE_KEY].get_int() += bonus;
            }
        }
    }

    void on_party_witness_conduct(conduct_type, int, const monster *)
    {
        // Native god conduct judges the acting worshipper. Merely seeing a
        // companion cast, haste or receive a gift does not create divine wrath.
    }

    void apply_pantheon_gift_resonance(int recipient_slot, god_type god,
                                       const std::string &gift_desc)
    {
        if (!coop_content::enabled() || !is_enabled() || recipient_slot < 0 || recipient_slot >= s_player_count
            || god == GOD_NO_GOD)
        {
            return;
        }

        const player &recipient = s_players[recipient_slot];
        if (!gift_desc.empty() && s_player_count > 1)
        {
            mprf(MSGCH_GOD, "%s bestows %s upon %s!",
                 god_name(god).c_str(),
                 gift_desc.c_str(),
                 recipient.your_name.c_str());
        }

        // Sync shared spell library across all party members whenever any god
        // grants spells/books (Vehumet, Sif Muna, Kiku).
        {
            scoped_player_context ctx(recipient_slot);
            sync_shared_state_from_active();
        }

        // The gift and its timeout belong to its recipient. Books still
        // join the ordinary shared library; no bonus buffs or jealous backlash.
    }

    bool any_party_member_on_floor_worships(god_type god, int *slot_out)
    {
        if (slot_out)
            *slot_out = -1;
        if (!is_enabled())
        {
            if (you_worship(god))
            {
                if (slot_out)
                    *slot_out = 0;
                return true;
            }
            return false;
        }

        const int cur = active_slot();
        if (!is_player_downed(cur) && s_players[cur].hp > 0
            && s_players[cur].religion == god)
        {
            if (slot_out)
                *slot_out = cur;
            return true;
        }

        const player &active = s_players[cur];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == cur || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (s_players[i].religion == god)
            {
                if (slot_out)
                    *slot_out = i;
                return true;
            }
        }
        return false;
    }

    bool any_party_member_on_floor_has_passive(passive_t pas, int *slot_out)
    {
        if (slot_out)
            *slot_out = -1;
        if (!is_enabled())
        {
            if (have_passive(pas))
            {
                if (slot_out)
                    *slot_out = 0;
                return true;
            }
            return false;
        }

        const int cur = active_slot();
        if (!is_player_downed(cur) && s_players[cur].hp > 0 && have_passive(pas))
        {
            if (slot_out)
                *slot_out = cur;
            return true;
        }

        const player &active = s_players[cur];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == cur || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            scoped_player_context ctx(i);
            if (have_passive(pas))
            {
                if (slot_out)
                    *slot_out = i;
                return true;
            }
        }
        return false;
    }

    bool is_coop_potion(int sub_type)
    {
        return sub_type == POT_EMPATHY
               || sub_type == POT_SOUL_AMBROSIA
               || sub_type == POT_CONCORD
               || sub_type == POT_TRANSFUSION;
    }

    bool is_coop_scroll(int sub_type)
    {
        return sub_type == SCR_SOUL_RECALL
               || sub_type == SCR_RALLYING
               || sub_type == SCR_PHASE_SWAP
               || sub_type == SCR_SHARED_VIGOUR;
    }

    int count_allies_in_radius(int radius)
    {
        if (!is_enabled())
            return 0;

        int count = 0;
        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()) || !in_bounds(active.pos()))
                continue;
            if (grid_distance(s_players[i].pos(), active.pos()) > radius)
                continue;
            if (radius <= LOS_DEFAULT_RANGE && !you.see_cell(s_players[i].pos()))
                continue;
            ++count;
        }
        return count;
    }

    int count_living_allies_near(const coord_def &center, int max_dist,
                                 int exclude_slot, bool require_los)
    {
        if (!is_enabled() || !in_bounds(center))
            return 0;

        const int ref_slot = (exclude_slot >= 0 && exclude_slot < s_player_count)
                             ? exclude_slot : s_active_slot;
        const player &ref_player = s_players[ref_slot];
        int count = 0;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == exclude_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], ref_player))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (grid_distance(center, s_players[i].pos()) > max_dist)
                continue;
            if (require_los && !cell_see_cell(center, s_players[i].pos(), LOS_NO_TRANS))
                continue;
            ++count;
        }
        return count;
    }

    int nearest_living_ally_slot(const coord_def &center, int max_dist,
                                 int exclude_slot, bool require_los)
    {
        if (!is_enabled() || !in_bounds(center))
            return -1;

        const int ref_slot = (exclude_slot >= 0 && exclude_slot < s_player_count)
                             ? exclude_slot : s_active_slot;
        const player &ref_player = s_players[ref_slot];
        int best_slot = -1;
        int best_dist = max_dist + 1;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == exclude_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], ref_player))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;

            const int d = grid_distance(center, s_players[i].pos());
            if (d > max_dist)
                continue;
            if (require_los && !cell_see_cell(center, s_players[i].pos(), LOS_NO_TRANS))
                continue;

            if (d < best_dist
                || (d == best_dist && best_slot >= 0
                    && s_players[i].hp > s_players[best_slot].hp))
            {
                best_dist = d;
                best_slot = i;
            }
        }
        return best_slot;
    }

    bool pos_adjacent_to_living_ally(const coord_def &target_pos, int exclude_slot)
    {
        if (!is_enabled() || !in_bounds(target_pos))
            return false;

        const int ref_slot = (exclude_slot >= 0 && exclude_slot < s_player_count)
                             ? exclude_slot : s_active_slot;
        const player &ref_player = s_players[ref_slot];

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == exclude_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], ref_player))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (adjacent(target_pos, s_players[i].pos()))
                return true;
        }
        return false;
    }

    int aegis_of_fellowship_projected_sh()
    {
        if (!is_enabled() || !in_bounds(you.pos()))
            return 0;

        const player &active = s_players[s_active_slot];
        int bonus = 0;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (grid_distance(you.pos(), s_players[i].pos()) > 2)
                continue;

            scoped_player_context ctx(i);
            if (you.unrand_equipped(UNRAND_AEGIS_OF_FELLOWSHIP))
                bonus += 6 * 2; // +6 SH in SHIELD_SCALE (2) units
        }
        return bonus;
    }

    bool has_twin_soul_resonance(int *partner_slot_out)
    {
        if (partner_slot_out)
            *partner_slot_out = -1;
        if (!is_enabled() || !in_bounds(you.pos()))
            return false;
        if (!you.unrand_equipped(UNRAND_TWIN_SOUL_RING))
            return false;

        const int my_slot = s_active_slot;
        const player &me = s_players[my_slot];

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == my_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], me))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (!cell_see_cell(me.pos(), s_players[i].pos(), LOS_NO_TRANS))
                continue;

            scoped_player_context ctx(i);
            if (you.unrand_equipped(UNRAND_TWIN_SOUL_RING))
            {
                if (partner_slot_out)
                    *partner_slot_out = i;
                return true;
            }
        }
        return false;
    }

    bool has_dawn_dusk_resonance(int *partner_slot_out)
    {
        if (partner_slot_out)
            *partner_slot_out = -1;
        if (!is_enabled() || !in_bounds(you.pos()))
            return false;

        const bool have_dawn = you.unrand_equipped(UNRAND_DAWNFORGED);
        const bool have_dusk = you.unrand_equipped(UNRAND_DUSKWEAVER);
        if (!have_dawn && !have_dusk)
            return false;

        const int my_slot = s_active_slot;
        const player &me = s_players[my_slot];

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == my_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], me))
                continue;
            if (!in_bounds(s_players[i].pos()))
                continue;
            if (!cell_see_cell(me.pos(), s_players[i].pos(), LOS_NO_TRANS))
                continue;

            scoped_player_context ctx(i);
            if ((have_dawn && you.unrand_equipped(UNRAND_DUSKWEAVER))
                || (have_dusk && you.unrand_equipped(UNRAND_DAWNFORGED)))
            {
                if (partner_slot_out)
                    *partner_slot_out = i;
                return true;
            }
        }
        return false;
    }


    static bool s_in_empathy_propagation = false;

    void propagate_empathy_healing(int amount)
    {
        if (!is_enabled() || amount <= 1 || s_in_empathy_propagation)
            return;
        if (!you.duration[DUR_EMPATHY])
            return;

        unwind_bool guard(s_in_empathy_propagation, true);
        const int shared = max(1, amount / 2);
        const player &active = s_players[s_active_slot];

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!s_players[i].duration[DUR_EMPATHY])
                continue;
            if (s_players[i].hp < s_players[i].hp_max
                && !s_players[i].duration[DUR_DEATHS_DOOR])
            {
                s_players[i].hp = min(s_players[i].hp_max, s_players[i].hp + shared);
                sync_player_to_proxy(i);
            }
        }
    }

    int split_empathy_damage(int dam)
    {
        if (!is_enabled() || dam < 4 || s_in_empathy_propagation)
            return dam;
        if (!you.duration[DUR_EMPATHY] && !s_seasoning_shared_ladle)
            return dam;

        const player &active = s_players[s_active_slot];
        vector<int> bonded_slots;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;
            if (!s_players[i].duration[DUR_EMPATHY] && !s_seasoning_shared_ladle)
                continue;
            if (s_players[i].hp * 100 / max(1, s_players[i].hp_max) <= 30)
                continue;
            bonded_slots.push_back(i);
        }

        if (bonded_slots.empty())
            return dam;

        unwind_bool guard(s_in_empathy_propagation, true);
        const int redirected_total = (dam * 2) / 5; // 40% redirected
        const int per_ally = max(1, redirected_total / (int)bonded_slots.size());
        int actually_absorbed = 0;

        for (int slot : bonded_slots)
        {
            player &ally = s_players[slot];
            const int min_safe_hp = max(1, (ally.hp_max * 25) / 100);
            if (ally.hp <= min_safe_hp)
                continue;
            const int take = min(per_ally, ally.hp - min_safe_hp);
            if (take > 0)
            {
                ally.hp -= take;
                actually_absorbed += take;
                sync_player_to_proxy(slot);
            }
        }

        if (actually_absorbed > 0)
        {
            mprf(MSGCH_RECOVERY,
                 "Your empathic bond disperses %d damage across your party!",
                 actually_absorbed);
        }

        return max(1, dam - actually_absorbed);
    }

    bool any_living_ally_on_current_floor()
    {
        if (!is_enabled())
            return false;

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot)
                continue;
            if (is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (_same_floor(s_players[i], active))
                return true;
        }
        return false;
    }

    bool scroll_soul_recall()
    {
        if (!coop_content::enabled() || !is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const player &active = s_players[s_active_slot];
        if (!in_bounds(active.pos()))
            return false;

        // Resurrect fallen companions before applying the living-party recall.
        int revived_count = 0;
        bool blocked_revival = false;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || !s_downed[i])
                continue;

            const coord_def pos = _find_habitable_tile_near(active.pos(), i, LOS_RADIUS);
            if (shared_fate_enabled() || pos == active.pos())
            {
                blocked_revival = true;
                continue;
            }
            player &p = s_players[i];
            p.where_are_you = active.where_are_you;
            p.depth = active.depth;
            p.level_stack = active.level_stack;
            p.set_position(pos);
            _restore_downed_member(i, 1, 2, 2);
            _record_spawn_place(p);

            heal_or_buff_party_member(i, 0, DUR_DIVINE_SHIELD, 6, true);
            place_cloud(CLOUD_TLOC_ENERGY, pos, 3 + random2(4), &you);

            mprf(MSGCH_RECOVERY,
                 "Golden astral threads weave around %s's spirit, restoring them to life!",
                 p.your_name.c_str());
            ++revived_count;
        }

        if (revived_count > 0)
        {
            heal_or_buff_party_member(s_active_slot, 0, DUR_DIVINE_SHIELD, 5, false);
            sync_all_proxies();
            return true;
        }
        if (blocked_revival)
        {
            mpr(shared_fate_enabled() ? "Shared Fate prevents resurrection."
                                     : "There is no room nearby for your fallen companions to return.");
            return false;
        }

        // Priority 2: Recall separated living teammates (off-floor or > 2 tiles away)
        // and grant a Sanctuary Ward to all living allies.
        int recalled_count = 0;
        int warded_count = 0;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || s_downed[i] || s_players[i].hp <= 0)
                continue;

            player &p = s_players[i];
            const bool off_floor = !_same_floor(p, active);
            const bool far_away = off_floor
                                  || !in_bounds(p.pos())
                                  || grid_distance(p.pos(), active.pos()) > 2;

            if (far_away)
            {
                const coord_def old_pos = p.pos();
                p.where_are_you = active.where_are_you;
                p.depth = active.depth;

                const coord_def dest = _find_habitable_tile_near(active.pos(), i, 2);
                if (!off_floor && in_bounds(old_pos))
                    place_cloud(CLOUD_TLOC_ENERGY, old_pos, 2 + random2(3), &you);
                p.set_position(dest);
                place_cloud(CLOUD_TLOC_ENERGY, dest, 2 + random2(3), &you);
                ++recalled_count;
            }

            const int heal = max(6, p.hp_max / 6);
            heal_or_buff_party_member(i, heal, DUR_DIVINE_SHIELD, 6, false);
#if TAG_MAJOR_VERSION == 34
            heal_or_buff_party_member(i, 0, DUR_REGENERATION, random_range(10, 16), false);
#endif
            ++warded_count;
        }

        const int self_heal = max(6, you.hp_max / 6);
        heal_or_buff_party_member(s_active_slot, self_heal, DUR_DIVINE_SHIELD, 6, false);
#if TAG_MAJOR_VERSION == 34
        heal_or_buff_party_member(s_active_slot, 0, DUR_REGENERATION, random_range(10, 16), false);
#endif

        sync_all_proxies();

        if (recalled_count > 0)
        {
            mprf(MSGCH_RECOVERY,
                 "The scroll's astral tether pulls your companions to your side and wards the party!");
        }
        else if (warded_count > 0)
        {
            mprf(MSGCH_RECOVERY,
                 "A golden sanctuary ward envelops you and your companions!");
        }
        else
        {
            mprf(MSGCH_RECOVERY,
                 "A golden sanctuary ward briefly surrounds you.");
        }

        return true;
    }

    bool scroll_rallying()
    {
        if (!coop_content::enabled() || !is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const player &active = s_players[s_active_slot];
        if (!in_bounds(active.pos()))
            return false;

        int rallied = 0;
        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_downed[i] || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;

            player &p = s_players[i];

            {
                scoped_player_context ctx(i);
                you.stop_constricting_all(false, true);
                you.stop_being_constricted(true);
                you.clear_beholders();
                you.clear_fearmongers();
                you.duration[DUR_SLEEP] = 0;
                you.duration[DUR_PARALYSIS] = 0;
                you.duration[DUR_DAZED] = 0;
            }

            if (i != s_active_slot
                && (!in_bounds(p.pos()) || grid_distance(p.pos(), active.pos()) > 1))
            {
                const coord_def dest = _find_habitable_tile_near(active.pos(), i, 2);
                if (in_bounds(dest))
                    p.set_position(dest);
            }

            const int turns = random_range(12, 20);
            heal_or_buff_party_member(i, 0, DUR_MIGHT, turns, true);
            heal_or_buff_party_member(i, 0, DUR_RESISTANCE, turns, false);
#if TAG_MAJOR_VERSION == 34
            heal_or_buff_party_member(i, 0, DUR_DEFLECT_MISSILES, turns, false);
#endif
            if (i != s_active_slot)
                ++rallied;
        }

        sync_all_proxies();

        if (rallied > 0)
        {
            mprf(MSGCH_RECOVERY,
                 "Clarion horns ring out! Your party snaps into an iron phalanx around you!");
        }
        else
        {
            mprf(MSGCH_RECOVERY,
                 "Clarion horns ring out, steeling your resolve and defences!");
        }

        return true;
    }

    bool scroll_phase_swap(const coord_def &preferred_target)
    {
        if (!coop_content::enabled() || !is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        player &active = s_players[s_active_slot];
        if (!in_bounds(active.pos()))
            return false;

        int target_slot = -1;
        if (in_bounds(preferred_target))
        {
            const int slot_at = player_slot_at(preferred_target, false);
            if (slot_at >= 0 && !s_downed[slot_at] && s_players[slot_at].hp > 0
                && _same_floor(s_players[slot_at], active))
            {
                target_slot = slot_at;
            }
        }

        if (target_slot < 0)
        {
            int worst_hp_pct = 101;
            int best_dist = INT_MAX;
            for (int i = 0; i < s_player_count; ++i)
            {
                if (i == s_active_slot || s_downed[i] || s_players[i].hp <= 0)
                    continue;
                if (!_same_floor(s_players[i], active) || !in_bounds(s_players[i].pos()))
                    continue;

                const int hp_pct = (s_players[i].hp * 100) / max(1, s_players[i].hp_max);
                const int d = grid_distance(s_players[i].pos(), active.pos());
                const bool in_los = you.see_cell_no_trans(s_players[i].pos());

                const int effective_score = hp_pct + (in_los ? 0 : 25);
                if (effective_score < worst_hp_pct
                    || (effective_score == worst_hp_pct && d < best_dist))
                {
                    worst_hp_pct = effective_score;
                    best_dist = d;
                    target_slot = i;
                }
            }
        }

        if (target_slot < 0)
        {
            mpr("You have no living companions on this floor to swap places with!");
            return false;
        }

        player &ally = s_players[target_slot];
        const coord_def my_old_pos = active.pos();
        const coord_def ally_old_pos = ally.pos();

        if (!in_bounds(ally_old_pos) || my_old_pos == ally_old_pos)
            return false;

        _remove_proxy_for_slot(target_slot);

        {
            scoped_player_context ctx(target_slot);
            you.stop_constricting_all(false, true);
            you.stop_being_constricted(true);
        }
        you.stop_constricting_all(false, true);
        you.stop_being_constricted(true);

        you.set_position(ally_old_pos);
        ally.set_position(my_old_pos);

        place_cloud(CLOUD_TLOC_ENERGY, my_old_pos, 2 + random2(3), &you);
        place_cloud(CLOUD_TLOC_ENERGY, ally_old_pos, 2 + random2(3), &you);

        const int turns = random_range(8, 12);
        heal_or_buff_party_member(s_active_slot, 0, DUR_SWIFTNESS, turns, false);
        heal_or_buff_party_member(s_active_slot, 0, DUR_DIVINE_SHIELD, 5, false);
        heal_or_buff_party_member(target_slot, 0, DUR_SWIFTNESS, turns, false);
        heal_or_buff_party_member(target_slot, 0, DUR_DIVINE_SHIELD, 5, false);

        for (adjacent_iterator ai(you.pos()); ai; ++ai)
        {
            if (monster *mon = monster_at(*ai))
            {
                if (!mon->wont_attack() && !is_proxy_monster(*mon) && coinflip())
                    mon->add_ench(mon_enchant(ENCH_DAZED, &you, random_range(20, 40)));
            }
        }

        sync_all_proxies();
        crawl_view.set_player_at(you.pos());
        los_changed();

        mprf(MSGCH_RECOVERY,
             "Space folds! You swap positions with %s in a flash of protective phase-light!",
             ally.your_name.c_str());
        return true;
    }

    bool scroll_shared_vigour()
    {
        if (!coop_content::enabled() || !is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const player &active = s_players[s_active_slot];
        int best_hp_pct = 0;
        int best_mp_pct = 0;
        int living_on_floor = 0;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_downed[i] || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;

            const player &p = s_players[i];
            const int hp_pct = (p.hp * 100) / max(1, p.hp_max);
            const int mp_pct = p.uses_magic_reserve() && p.max_magic_points > 0
                               ? (p.magic_points * 100) / p.max_magic_points
                               : 0;
            best_hp_pct = max(best_hp_pct, hp_pct);
            best_mp_pct = max(best_mp_pct, mp_pct);
            ++living_on_floor;
        }

        if (living_on_floor == 0)
            return false;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (s_downed[i] || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active))
                continue;

            player &p = s_players[i];
            if (!p.duration[DUR_DEATHS_DOOR])
            {
                const int target_hp = (p.hp_max * best_hp_pct) / 100;
                const int bonus_hp = max(8, p.hp_max / 5);
                p.hp = min(p.hp_max, max(p.hp, target_hp) + bonus_hp);
            }

            if (p.uses_magic_reserve() && p.max_magic_points > 0)
            {
                const int target_mp = (p.max_magic_points * best_mp_pct) / 100;
                const int bonus_mp = max(4, p.max_magic_points / 4);
                p.magic_points = min(p.max_magic_points,
                                     max(p.magic_points, target_mp) + bonus_mp);
            }

            const int turns = random_range(15, 25);
#if TAG_MAJOR_VERSION == 34
            heal_or_buff_party_member(i, 0, DUR_REGENERATION, turns, true);
#else
            heal_or_buff_party_member(i, 0, NUM_DURATIONS, 0, true);
#endif
            heal_or_buff_party_member(i, 0, DUR_SOUL_AMBROSIA, turns, false);
        }

        sync_all_proxies();
        mprf(MSGCH_RECOVERY,
             "Vitality and arcane power surge in harmony across the entire party!");
        return true;
    }

    bool try_revive_downed_ghost_in_radius(const coord_def &center, int radius,
                                           int hp_pct)
    {
        if (!is_enabled() || shared_fate_enabled())
            return false;

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || !is_player_downed(i))
                continue;
            if (!_same_floor(s_players[i], active) || !in_bounds(s_players[i].pos()))
                continue;
            if (grid_distance(s_players[i].pos(), center) > radius)
                continue;

            player &p = s_players[i];
            _restore_downed_member(i, hp_pct, 100, 4, true);
            sync_all_proxies();
            sync_player_to_proxy(i);
            mprf(MSGCH_RECOVERY,
                 "The splashed soul ambrosia coalesces around %s's spirit, restoring them to flesh!",
                 p.your_name.c_str());
            return true;
        }
        return false;
    }

    bool any_teammate_sees_hostile_for_scroll(scroll_type scroll)
    {
        if (!is_enabled())
            return false;

        const player &active = s_players[s_active_slot];
        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == s_active_slot || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], active) || !in_bounds(s_players[i].pos()))
                continue;

            scoped_player_context ctx(i);
            for (monster_near_iterator mi(&you, LOS_NO_TRANS); mi; ++mi)
            {
                if (is_proxy_monster(**mi))
                    continue;

                switch (scroll)
                {
                case SCR_FEAR:
                    if (!mi->wont_attack() && !mi->is_stationary())
                        return true;
                    break;
                case SCR_IMMOLATION:
                    if (!mi->wont_attack() && !mi->is_summoned()
                        && !mons_invuln_will(**mi))
                    {
                        return true;
                    }
                    break;
                case SCR_POISON:
                    if (!mi->friendly() && mi->res_poison() <= 0)
                        return true;
                    break;
                case SCR_VULNERABILITY:
                case SCR_TORMENT:
                    if (!mi->wont_attack())
                        return true;
                    break;
                default:
                    break;
                }
            }
        }
        return false;
    }

    int apply_coop_scroll_chorus(scroll_type scroll, coord_def origin_pos)
    {
        if (!is_enabled())
            return 0;

        const int reader_slot = s_active_slot;
        const player &reader = s_players[reader_slot];
        const coord_def anchor_pos = in_bounds(origin_pos) ? origin_pos : reader.pos();
        int chorus_count = 0;

        for (int i = 0; i < s_player_count; ++i)
        {
            if (i == reader_slot || is_player_downed(i) || s_players[i].hp <= 0)
                continue;
            if (!_same_floor(s_players[i], reader) || !in_bounds(s_players[i].pos()))
                continue;

            player &ally = s_players[i];

            switch (scroll)
            {
            case SCR_FOG:
            {
                scoped_player_context ctx(i);
                big_cloud(random_smoke_type(), &you, you.pos(), 30, 4 + random2(4));
                ++chorus_count;
                break;
            }
            case SCR_BUTTERFLIES:
            {
                scoped_player_context ctx(i);
                bool spawned = false;
                const int count = 2 + random2(4);
                for (int n = 0; n < count; ++n)
                {
                    if (create_monster(
                            mgen_data(MONS_BUTTERFLY, BEH_FRIENDLY, you.pos(),
                                      MHITYOU, MG_FORCE_BEH)
                            .set_summoned(&you, SPELL_NO_SPELL, 2, false, false)))
                    {
                        spawned = true;
                    }
                }
                if (spawned)
                {
                    ++chorus_count;
                    mprf(MSGCH_RECOVERY,
                         "A secondary flutter of butterflies erupts around %s!",
                         ally.your_name.c_str());
                }
                break;
            }
            case SCR_SUMMONING:
            {
                scoped_player_context ctx(i);
                mgen_data mg(MONS_SHAPESHIFTER, BEH_FRIENDLY, you.pos(), MHITYOU);
                mg.set_summoned(&you, MON_SUMM_SCROLL, summ_dur(3));
                mg.hd = (you.experience_level + 1) * 5 / 6;
                if (create_monster(mg))
                {
                    ++chorus_count;
                    mprf(MSGCH_RECOVERY,
                         "The scroll's chorus weave summons a guardian beside %s!",
                         ally.your_name.c_str());
                }
                break;
            }
            case SCR_REVELATION:
            {
                scoped_player_context ctx(i);
                you.set_duration(DUR_REVELATION, you.duration[DUR_REVELATION]
                                 + random_range(30, 50) * BASELINE_DELAY);
                ++chorus_count;
                break;
            }
            case SCR_FEAR:
            {
                scoped_player_context ctx(i);
                bool scared_any = false;
                for (monster_near_iterator mi(&you, LOS_NO_TRANS); mi; ++mi)
                {
                    if (is_proxy_monster(**mi) || mi->wont_attack())
                        continue;
                    if (!reader.see_cell_no_trans(mi->pos()))
                    {
                        if (mi->add_ench(mon_enchant(ENCH_FEAR, &you)))
                        {
                            behaviour_event(*mi, ME_SCARE, &you);
                            scared_any = true;
                        }
                    }
                }
                if (scared_any)
                    ++chorus_count;
                break;
            }
            case SCR_IMMOLATION:
            {
                scoped_player_context ctx(i);
                bool burned_any = false;
                for (monster_near_iterator mi(&you, LOS_NO_TRANS); mi; ++mi)
                {
                    if (is_proxy_monster(**mi) || mi->wont_attack()
                        || mi->is_summoned() || mons_invuln_will(**mi))
                    {
                        continue;
                    }
                    if (!reader.see_cell_no_trans(mi->pos()))
                    {
                        if (mi->add_ench(mon_enchant(ENCH_INNER_FLAME, &you)))
                            burned_any = true;
                    }
                }
                if (burned_any)
                    ++chorus_count;
                break;
            }
            case SCR_BLINKING:
            {
                if (in_bounds(anchor_pos)
                    && grid_distance(ally.pos(), anchor_pos) <= 1
                    && !ally.no_tele(true))
                {
                    if (yesno(make_stringf("Pull %s along through your phase-slip to your new position?",
                                           ally.your_name.c_str()).c_str(),
                              true, 'y'))
                    {
                        const coord_def dest = _find_habitable_tile_near(reader.pos(), i, 2);
                        if (in_bounds(dest) && dest != ally.pos())
                        {
                            place_cloud(CLOUD_TLOC_ENERGY, ally.pos(), 1 + random2(3), &you);
                            ally.set_position(dest);
                            sync_player_to_proxy(i);
                            ++chorus_count;
                            mprf(MSGCH_RECOVERY,
                                 "%s slips through the phase-wake to land beside you!",
                                 ally.your_name.c_str());
                        }
                    }
                }
                break;
            }
            case SCR_TELEPORTATION:
            {
                if (grid_distance(ally.pos(), reader.pos()) <= 1
                    && !ally.no_tele(false))
                {
                    scoped_player_context ctx(i);
                    if (!you.duration[DUR_TELEPORT])
                    {
                        you.set_duration(DUR_TELEPORT, 3 + random2(3));
                        ++chorus_count;
                        mprf(MSGCH_RECOVERY,
                             "The translocation vortex catches adjacent %s as well!",
                             ally.your_name.c_str());
                    }
                }
                break;
            }
            case SCR_ENCHANT_WEAPON:
            case SCR_ENCHANT_ARMOUR:
            {
                if (grid_distance(ally.pos(), reader.pos()) <= 2
                    && x_chance_in_y(2, 5))
                {
                    scoped_player_context ctx(i);
                    item_def *target_item = nullptr;
                    if (scroll == SCR_ENCHANT_WEAPON)
                    {
                        item_def *wpn = you.weapon();
                        if (wpn && is_enchantable_weapon(*wpn, false))
                            target_item = wpn;
                    }
                    else
                    {
                        vector<item_def*> candidates;
                        for (int s = SLOT_MIN_ARMOUR; s <= SLOT_MAX_ARMOUR; ++s)
                        {
                            for (item_def *arm : you.equipment.get_slot_items((equipment_slot)s))
                            {
                                if (arm && is_enchantable_armour(*arm, false))
                                    candidates.push_back(arm);
                            }
                        }
                        if (!candidates.empty())
                            target_item = candidates[random2(candidates.size())];
                    }

                    if (target_item)
                    {
                        target_item->plus++;
                        ++chorus_count;
                        mprf(MSGCH_RECOVERY,
                             "Resonant forge-sparks leap to %s's %s, enchanting it to %+d!",
                             ally.your_name.c_str(),
                             target_item->name(DESC_BASENAME).c_str(),
                             target_item->plus);
                    }
                }
                break;
            }
            default:
                break;
            }
        }

        return chorus_count;
    }

    bool has_active_aura_near(const coord_def &pos, spell_type aura_spell,
                              int *best_pow_out, int radius)
    {
        int best_pow = 0;
        for (int slot : aura_sources_near(pos, aura_spell, radius))
        {
            const player& member = is_enabled() ? s_players[slot] : you;
            best_pow = max(best_pow, auras::power(member, aura_spell));
        }
        if (best_pow_out)
            *best_pow_out = best_pow;
        return best_pow > 0;
    }

    vector<int> aura_sources_near(const coord_def& pos, spell_type spell, int range_limit)
    {
        vector<int> sources;
        if (!is_enabled())
        {
            if (auras::power(you, spell) && auras::reaches(you, pos, range_limit))
                sources.push_back(s_active_slot);
            return sources;
        }
        for (int i = 0; i < s_player_count; ++i)
        {
            const player& member = s_players[i];
            if (!is_player_downed(i) && member.hp > 0
                && member.where_are_you == you.where_are_you && member.depth == you.depth
                && auras::power(member, spell) && auras::reaches(member, pos, range_limit))
            {
                sources.push_back(i);
            }
        }
        return sources;
    }

    int active_aura_count_near(const coord_def &pos, int radius)
    {
        int count = 0;
        for (spell_type sp : auras::spells)
            if (has_active_aura_near(pos, sp, nullptr, radius))
                ++count;
        return count;
    }

    int paladin_aura_tier_near(const coord_def &pos, int radius)
    {
        return active_aura_count_near(pos, radius);
    }
}
