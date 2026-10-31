/**
 * @file
 * @brief Multiplayer / Party management, active-player context switching,
 *        proxy monster synchronization, and hybrid turn scheduling.
**/

#pragma once

#include <string>
#include <vector>

#include "beam-type.h"
#include "character-trait.h"
#include "conduct-type.h"
#include "coord-def.h"
#include "defines.h"
#include "duration-type.h"
#include "externs.h"
#include "god-type.h"
#include "game-modifiers.h"
#include "item-prop-enum.h"
#include "job-type.h"
#include "kill-method-type.h"
#include "killer-type.h"
#include "potion-type.h"
#include "species-type.h"
#include "spell-type.h"

enum class passive_t;

#ifndef DUR_SONG_OF_SLAYING
#define DUR_SONG_OF_SLAYING DUR_SLAYING
#endif
#ifndef SONG_OF_SLAYING_KEY
#define SONG_OF_SLAYING_KEY "song_of_slaying_bonus"
#endif

class actor;
class monster;
class player;

namespace party
{
    constexpr int MAX_PARTY_PLAYERS = 4;
    constexpr mid_t MID_PARTY_PLAYER_BASE = 0xfffffff0u;
    constexpr int REGION_ACTIVE_MONS_RADIUS = 24;

    bool multiplayer_enabled();
    void set_multiplayer(bool enabled);
    int floor_aut_clock(int slot);
    int member_aut_clock(int slot);
    int member_last_action_aut(int slot);
    int member_region_id(int slot);
    int member_region_clock(int slot);
    bool region_feels_safe(int slot);
    bool region_combat_locked(int slot);
    bool same_region(int slot_a, int slot_b);
    void reconcile_floor_regions();
    // While one of these is alive the world is being serialised, not
    // simulated: reconcile_floor_regions() runs once and is then memoised
    // until the outermost snapshot ends. Never hold one across an action.
    class scoped_region_snapshot
    {
    public:
        scoped_region_snapshot();
        ~scoped_region_snapshot();
        scoped_region_snapshot(const scoped_region_snapshot&) = delete;
        scoped_region_snapshot& operator=(const scoped_region_snapshot&) = delete;
    };
    int advance_floor_clock(int time_taken);
    int advance_region_clock(int time_taken, int *out_floor_delta = nullptr);
    bool monster_in_active_region(const monster &mon, int actor_slot = -1);
    bool position_in_active_region(const coord_def &pos, int actor_slot = -1);
    bool cloud_in_active_region(const coord_def &pos, int actor_slot = -1);
    bool member_can_act(int slot);
    std::string member_activity(int slot);
    void reset_activities();
    void cancel_activity();
    bool start_yielding();
    void interrupt_unsafe_activities();
    void step_activity();

    struct member_setup
    {
        std::string name;
        species_type species;
        job_type job;
        weapon_type weapon = WPN_UNKNOWN;
        uint64_t starting_seed = 0;
        character_trait trait = character_trait::none;

        member_setup() : name(), species(SP_HUMAN), job(JOB_FIGHTER) {}
        member_setup(const std::string &n, species_type sp, job_type jb)
            : name(n), species(sp), job(jb) {}
    };

    // Lifecycle & configuration
    void init();
    void reset();
    bool is_enabled();
    inline bool is_active() { return is_enabled(); }
    int player_count();
    inline int extra_player_count() { return player_count() > 1 ? player_count() - 1 : 0; }
    void set_player_count(int count);
    void configure_from_arg(const std::string &spec);
    // Install the chosen campaign rules on the newly initialized leader.
    void apply_starting_campaign_modifiers(player& leader);
    bool starting_no_rune_locks();
    game_modifiers::traps starting_trap_mode();
    bool starting_shared_fate();
    void set_starting_shared_fate(bool enabled);
    bool shared_fate_enabled();
    void set_starting_campaign_modifiers(bool no_rune_locks, game_modifiers::traps mode);
    const member_setup &starting_member(int slot);
    void set_starting_trait(int slot, character_trait trait);
    // Final hero name during creation, before the leader's lobby name is applied.
    const std::string &starting_name(int slot);
    void setup_party_members_on_new_game();
    bool add_party_member(const std::string &spec = "");

    // Friendly fire defaults to enabled; disabled protects party members.
    bool friendly_fire_enabled();
    void set_friendly_fire(bool enabled);
    void save_friendly_fire();
    void restore_friendly_fire();

    // Pebble Broth Seasonings (Run Modifiers) & Superlatives
    bool has_seasoning_fast_boil();
    bool has_seasoning_shared_ladle();
    bool has_seasoning_heavy_pebbles();
    bool has_seasoning_soul_tether();
    bool has_seasoning_chaotic_ladle();
    int slot_damage_dealt(int slot);
    int slot_support_acts(int slot);
    std::string slot_mvp_title(int slot);

    // Simultaneous (We-Go) turns setting (default true)
    bool simultaneous_turns_enabled();
    void set_simultaneous_turns(bool enabled);

    // Player slot access & context switching
    int active_slot();
    player& get_player(int slot);
    // Publish the greatest allocated monster ID across all party members.
    // Scoped player contexts can allocate monsters without a full turn switch.
    void sync_monster_ids();
    inline player& Member(int slot) { return get_player(slot); }
    inline player& player_in_Slot(int slot) { return get_player(slot); }
    inline player& player_in_slot(int slot) { return get_player(slot); }
    bool slot_is_alive(int slot);
    bool slot_is_on_current_floor(int slot);
    inline bool is_player_on_current_floor(int slot) { return slot_is_on_current_floor(slot); }
    player* player_by_mid(mid_t m);
    bool is_party_mid(mid_t m);
    mid_t mid_for_slot(int slot);
    int slot_for_mid(mid_t m);
    // A live player and their monster proxy represent the same actor.
    bool same_actor_identity(const actor* first, const actor* second);
    int player_slot_at(const coord_def &pos, bool include_active = true);
    player* player_at(const coord_def &pos, bool include_active = true);

    // Switches active `real_you` to `slot`, updating proxy monsters and shared state.
    void switch_to_player(int slot);
    void sync_shared_state_from_active();
    void sync_shared_state_to_all();
    void sync_shared_gold(int amount);

    // RAII context switcher for delegating damage/effects/queries to a specific player slot
    class scoped_player_context
    {
    public:
        explicit scoped_player_context(int target_slot, bool swap_proxies = false);
        ~scoped_player_context();

        scoped_player_context(const scoped_player_context&) = delete;
        scoped_player_context& operator=(const scoped_player_context&) = delete;

    private:
        int m_prev_slot;
        bool m_switched;
        bool m_swapped_proxies;
    };

    // Proxy monster management in env.mons / env.mgrid for inactive party members
    bool is_proxy_monster(const monster &mon);
    int proxy_slot(const monster &mon);
    monster* get_proxy_monster(int slot);
    void sync_all_proxies();
    void sync_player_to_proxy(int slot);
    void sync_proxy_to_player(int slot);
    void remove_all_proxies();
    void heal_or_buff_party_member(int slot, int heal_amount,
                                   duration_type dur = NUM_DURATIONS,
                                   int dur_turns = 0,
                                   bool cleanse_debuffs = false);
    void heal_or_buff_party_member(int slot, int heal_amount, int mp_amount,
                                   duration_type dur, int dur_turns,
                                   const char *msg_prefix = nullptr,
                                   bool cleanse_debuffs = false);
    void apply_party_aura_buff(duration_type dur, int turns,
                               int radius = LOS_RADIUS,
                               bool include_active = false,
                               god_type source_god = GOD_NO_GOD);

    // Vision & Monster AI helpers
    bool any_player_sees_cell(const coord_def &p, bool no_trans = false);
    player* nearest_visible_player(const actor *observer);
    bool party_feels_safe();

    // Downed / Ghost Spectator & Revival mechanics
    bool is_player_downed(int slot);
    // Charge successful multiplayer resurrections, including personal lives.
    void apply_resurrection_cost();
    // Resolve pending extra lives for inactive party members on this floor.
    bool resolve_pending_revivals();
    void restore_downed_state();
    void set_player_downed(int slot, bool downed);
    bool any_other_player_alive(int excluding_slot);
    bool prepare_survivor_for_death(int falling_slot);
    bool any_player_alive();
    void revive_downed_players(bool on_floor_transition, int hp_drain_percent = 35);
    // When the last standing player falls while teammates are downed, revive
    // the downed teammates instead of ending the run. Solo parties only,
    // once per floor; multiplayer requires an explicit resurrection resource.
    bool try_last_stand_revive(int falling_slot);
    void relocate_downed_ghost_to_survivor(int downed_slot);

    // Tethered Floor Placement & Gathering
    void place_party_around_active();
    bool all_living_players_nearby(const coord_def &pos, int max_dist = LOS_RADIUS);

    // Hybrid Turn & Aut-Clock Scheduling
    int get_player_aut_clock(int slot);
    int get_world_aut_clock();
    // Campaign time follows the furthest-ahead hero, across regions/floors.
    // Personal elapsed_time and simulation/initiative clocks stay independent.
    int global_elapsed_time();
    int global_time_delta(int time_taken);
    int get_player_aut_lead(int slot);
    void sync_idle_player_clocks_to(int target_clock);
    int select_next_acting_player();
    // Called when active player finishes an action costing `time_taken` auts.
    // Returns the delta auts (>= 0) by which `world_reacts()` should advance the active region's monsters/clouds,
    // and optionally writes the floor-wide clock delta into `out_floor_delta`.
    int record_player_turn_and_get_world_delta(int time_taken, int *out_floor_delta = nullptr);

    enum class pantheon_relation_type
    {
        NONE = 0,
        SHARED_COVENANT,
        ALLIED_CONCORDAT,
        NEUTRAL,
        RIVAL,
        ANATHEMA,
    };

    // God Politics, Multiplayer Abilities, and Pantheon Synergy
    pantheon_relation_type get_god_political_relation(god_type a, god_type b);
    bool are_gods_concordant(god_type a, god_type b);
    bool are_slots_concordant(int slot_a, int slot_b);
    const char* pantheon_relation_label(pantheon_relation_type rel);
    pantheon_relation_type get_slot_pantheon_standing(int slot, int *partner_slot_out = nullptr);
    std::string describe_party_god_politics(int slot);
    void on_player_join_god(int slot, god_type new_god, god_type old_god);
    int adjust_kill_piety_for_party_politics(int base_piety);
    void broadcast_party_kill_conducts(const monster &mons, killer_type killer,
                                       int killer_index, bool gives_xp);
    void on_party_hurt_monster(const monster &victim, int damage_done,
                               beam_type flavour, kill_method_type kill_type);
    void on_party_witness_conduct(conduct_type thing_done, int level,
                                  const monster *victim = nullptr);
    void apply_pantheon_gift_resonance(int recipient_slot, god_type god,
                                       const std::string &gift_desc);
    bool any_party_member_on_floor_worships(god_type god, int *slot_out = nullptr);
    bool any_party_member_on_floor_has_passive(passive_t pas, int *slot_out = nullptr);

    // Co-op Potions & Scrolls helpers
    bool is_coop_potion(int sub_type);
    bool is_coop_scroll(int sub_type);
    int count_allies_in_radius(int radius = LOS_DEFAULT_RANGE);
    void propagate_empathy_healing(int amount);
    int split_empathy_damage(int dam);
    bool any_living_ally_on_current_floor();
    bool scroll_soul_recall();
    bool scroll_rallying();
    bool scroll_phase_swap(const coord_def &preferred_target = coord_def());
    bool scroll_shared_vigour();

    // Co-op Jewellery & Unrandarts helpers
    int count_living_allies_near(const coord_def &center, int max_dist,
                                 int exclude_slot = -1,
                                 bool require_los = false);
    int nearest_living_ally_slot(const coord_def &center, int max_dist,
                                 int exclude_slot = -1,
                                 bool require_los = true);
    bool pos_adjacent_to_living_ally(const coord_def &target_pos, int exclude_slot);
    int aegis_of_fellowship_projected_sh();
    bool has_twin_soul_resonance(int *partner_slot_out = nullptr);
    bool has_dawn_dusk_resonance(int *partner_slot_out = nullptr);


    // Co-op Thrown Potion & Scroll Chorus helpers
    bool try_revive_downed_ghost_in_radius(const coord_def &center, int radius,
                                           int hp_pct = 25);
    bool any_teammate_sees_hostile_for_scroll(scroll_type scroll);
    int apply_coop_scroll_chorus(scroll_type scroll,
                                 coord_def origin_pos = coord_def());

    // Active Aura Stance Spells (Protection / Zeal / Rime / Vitality / Sanctuary)
    bool has_active_aura_near(const coord_def &pos, spell_type aura_spell,
                              int *best_pow_out = nullptr, int radius = -1);
    std::vector<int> aura_sources_near(const coord_def& pos, spell_type spell, int range_limit = -1);
    int active_aura_count_near(const coord_def &pos, int radius = -1);
    int paladin_aura_tier_near(const coord_def &pos, int radius = -1);
}
