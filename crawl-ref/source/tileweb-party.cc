/** Side-effect-free native perception projected into recipient-owned streams. */
#include "AppHdr.h"
#ifdef USE_TILE_WEB
#include "tileweb.h"
#include <tuple>

#include "env.h"
#include "level-id.h"
#include "libutil.h"
#include "losglobal.h"
#include "map-knowledge.h"
#include "party.h"
#include "player.h"
#include "random.h"
#include "show.h"
#include "state.h"
#include "terrain.h"
#include "tile-env.h"
#include "tileview.h"
#include "rltiles/tiledef-main.h"
#include "unwind.h"
#include "view.h"

// No entities or visibility flags belong in this shared terrain journal.
// Comparing scalar terrain state once on floor reload preserves private view
// caches when independent heroes take turns on different native floors.
static auto _terrain_stamp(const coord_def& cell)
{
    const auto& known = env.map_knowledge(cell);
    const auto& flavour = tile_env.flv(cell);
    return std::make_tuple(known.feat(), known.feat_colour(),
        known.flags & (MAP_SEEN_FLAG | MAP_MAGIC_MAPPED_FLAG),
        tile_env.remembered_flavour.feat_flavour(cell),
        tile_env.remembered_flavour.feat_flavour_idx(cell),
        flavour.floor, flavour.wall, flavour.feat, flavour.special,
        flavour.floor_idx, flavour.wall_idx, flavour.feat_idx,
        env.pgrid(cell), env.floor_colour, env.rock_colour);
}

struct TilesFramework::personal_floor_cache
{
    owned_grid<decltype(_terrain_stamp(coord_def())), GXM, GYM> terrain;
    bool ready = false;
};

// Each cache owns a complete filtered knowledge grid. Swapping grid ownership
// makes actor projection independent of floor area between baseline resets.
struct TilesFramework::personal_view_cache
{
    level_id floor = level_id::current();
    MapKnowledge knowledge;
    owned_grid<tile_fg_store, GXM, GYM> foreground;
    owned_grid<tile_with_flags_t, GXM, GYM> background;
    owned_grid<tileidx_t, GXM, GYM> clouds;
    flavour_knowledge flavour;
    map<coord_def, set<tileidx_t>> icons;
    set<coord_def> visible;
    map<coord_def, string> cells;
    int sequence = 0;

    personal_view_cache()
    {
        background.init(0);
        clouds.init(0);
    }

    void release_foreground()
    {
        // tile_fg_store assignment owns mcache references; its destructor does
        // not. Drop them while the native cache still exists.
        for (int y = 0; y < GYM; ++y)
            for (int x = 0; x < GXM; ++x)
                foreground(coord_def(x, y)) = 0;
    }

    void exchange()
    {
        knowledge.swap(env.map_knowledge);
        foreground.swap(tile_env.bk_fg);
        background.swap(tile_env.bk_bg);
        clouds.swap(tile_env.bk_cloud);
        flavour.swap(tile_env.remembered_flavour);
        icons.swap(tile_env.icons);
        visible.swap(env.visible);
    }
};

void TilesFramework::_clear_personal_views()
{
    // Release references during native runtime, never during unspecified global
    // destructor ordering (the mcache manager may already have been destroyed).
    for (const auto& view : m_personal_views)
        if (view)
            view->release_foreground();
    m_personal_views.clear();
    m_personal_floors.clear();
}

string TilesFramework::_personal_cell_json(const coord_def& cell)
{
    unwind_var<string> buffer(m_msg_buf, "");
    unwind_var<vector<JsonFrame>> frames(m_json_stack, vector<JsonFrame>());
    screen_cell_t empty{};
    empty.glyph = ' ';
    empty.colour = 7;
    empty.tile.bg = TILE_FLAG_UNSEEN;
    screen_cell_t rendered{};
    draw_cell(&rendered, cell, false, 0, 0);
    map_cell unknown;
    map<uint32_t, coord_def> monster_locs;
    json_open_object();
    json_write_int("x", cell.x);
    json_write_int("y", cell.y);
    // Self-contained cell records can replace a stale entity or tile property
    // without retaining native screen cells or mcache pointers in the stream.
    json_write_bool("reset", true);
    _send_cell(cell, empty, rendered, unknown, env.map_knowledge(cell), monster_locs, true);
    json_close_object();
    return m_msg_buf;
}

void TilesFramework::_send_personal_views(bool force_full, int force_slot)
{
    if (!party::multiplayer_enabled() || m_projecting_view || !in_bounds(you.pos()))
        return;
    unwind_bool projection(m_projecting_view, true);
    rng::generator ui_rng(rng::UI);
    party::scoped_region_snapshot regions;
    const level_id floor = level_id::current();
    const int native_actor = party::active_slot();
    const auto shared_invis = env.invis_knowledge;
    const auto geometry = crawl_view;
    const player_info active_info = m_current_player_info;
    m_origin = coord_def(0, 0);
    // Keep journals only for occupied floors. Native package loading can still
    // scan scalar terrain once; sight, tiles and transport remain incremental.
    set<string> occupied;
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        const auto& member = party::get_player(slot);
        occupied.insert(level_id(member.where_are_you, member.depth).describe());
    }
    for (auto it = m_personal_floors.begin(); it != m_personal_floors.end(); )
        if (!occupied.count(it->first))
            it = m_personal_floors.erase(it);
        else
            ++it;
    auto& journal_ptr = m_personal_floors[floor.describe()];
    if (!journal_ptr)
        journal_ptr = std::make_shared<personal_floor_cache>();
    auto& journal = *journal_ptr;
    set<coord_def> terrain_changes;
    const bool reconcile_floor = m_personal_reset || !journal.ready;
    const auto note_terrain = [&](const coord_def& cell) {
        const auto stamp = _terrain_stamp(cell);
        if (!journal.ready || journal.terrain(cell) != stamp)
            terrain_changes.insert(cell);
        journal.terrain(cell) = stamp;
    };
    if (reconcile_floor)
        for (int y = 0; y < GYM; ++y)
            for (int x = 0; x < GXM; ++x)
                note_terrain(coord_def(x, y));
    else
        for (const auto& cell : m_personal_changed)
            note_terrain(cell);
    journal.ready = true;
    m_personal_reset = false;
    for (size_t slot = party::player_count(); slot < m_personal_views.size(); ++slot)
        if (m_personal_views[slot])
            m_personal_views[slot]->release_foreground();
    m_personal_views.resize(party::player_count());

    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        player& member = party::get_player(slot);
        if (level_id(member.where_are_you, member.depth) != floor || !in_bounds(member.pos()))
            continue;
        auto& saved = m_personal_views[slot];
        if (!saved || saved->floor != floor)
        {
            if (saved)
                saved->release_foreground();
            saved = std::make_shared<personal_view_cache>();
        }
        auto& cache = *saved;
        const bool baseline = !cache.sequence
            || (force_full && (force_slot < 0 || force_slot == slot));
        party::scoped_player_context actor(slot, true);
        unwind_var<int> recipient(m_viewer_slot, slot);
        unwind_var<targeter*> range(crawl_state.darken_range,
                                   slot == native_actor ? crawl_state.darken_range : nullptr);
        unwind_var<vector<coord_def>*> flashes(crawl_state.flash_monsters,
                                   slot == native_actor ? crawl_state.flash_monsters : nullptr);
        crawl_view.set_player_at(member.pos(), false);
        set<coord_def> changed = reconcile_floor ? terrain_changes : m_personal_changed;
        changed.insert(cache.visible.begin(), cache.visible.end());
        cache.exchange(); // cache.knowledge now holds the untouched shared map.
        ON_UNWIND { cache.exchange(); env.invis_knowledge = shared_invis; };
        env.visible.clear();
        env.invis_knowledge = shared_invis.personal_view(slot);
        int los_checks = 0;
        const int radius = max<int>(LOS_MAX_RANGE, member.current_vision);
        if (!party::is_player_downed(slot))
            for (int y = max(0, member.pos().y - radius); y <= min(GYM - 1, member.pos().y + radius); ++y)
                for (int x = max(0, member.pos().x - radius); x <= min(GXM - 1, member.pos().x + radius); ++x)
                {
                    ++los_checks;
                    const coord_def cell(x, y);
                    if (member.see_cell(cell))
                        env.visible.insert(cell);
                }
        changed.insert(env.visible.begin(), env.visible.end());
        changed.insert(member.pos());
        if (baseline)
            for (int y = 0; y < GYM; ++y)
                for (int x = 0; x < GXM; ++x)
                    changed.insert(coord_def(x, y));

        // Terrain and feature joins read adjacent memory. A one-cell halo also
        // removes sprites at the old LOS edge after movement or opacity changes.
        const auto seeds = changed;
        for (const auto& cell : seeds)
            for (int dy = -1; dy <= 1; ++dy)
                for (int dx = -1; dx <= 1; ++dx)
                {
                    const coord_def adjacent = cell + coord_def(dx, dy);
                    if (map_bounds(adjacent))
                        changed.insert(adjacent);
                }
        for (const auto& cell : changed)
        {
            map_cell& known = env.map_knowledge(cell);
            const map_cell& shared = cache.knowledge(cell);
            known.clear();
            const auto terrain = shared.feat();
            known.set_feature(feat_is_trap(terrain) ? DNGN_FLOOR : terrain);
            known.set_feat_colour(static_cast<colour_t>(shared.feat_colour()));
            known.flags = shared.flags & (MAP_SEEN_FLAG | MAP_MAGIC_MAPPED_FLAG);
            tile_env.remembered_flavour.copy_at(cell, cache.flavour);
            tile_env.icons.erase(cell);
        }
        for (const auto& cell : env.visible)
        {
            env.map_knowledge(cell).flags |= MAP_SEEN_FLAG | MAP_VISIBLE_FLAG;
            show_update_at(cell);
        }
        vector<string> updates;
        for (const auto& cell : changed)
            tile_draw_map_cell(cell);
        for (const auto& cell : changed)
        {
            // Unknown cells must also replace previously known cells on forget.
            if (!cache.cells.count(cell) && env.map_knowledge(cell).feat() == DNGN_UNSEEN
                && cell != member.pos())
                continue;
            string rendered = _personal_cell_json(cell);
            if (baseline || cache.cells[cell] != rendered)
                updates.push_back(rendered);
            cache.cells[cell] = std::move(rendered);
        }

        m_current_player_info = player_info();
        _send_player(true);
        // Serialise the hero's party snapshot into a scratch frame and only
        // use the socket when it differs from the last frame this hero
        // received. A baseline (first view, explicit refresh) always sends.
        string frame;
        {
            unwind_var<string*> sink(m_frame_sink, &frame);
            _send_party_state();
        }
        if (baseline || frame != m_personal_party_frames[slot])
        {
            m_personal_party_frames[slot] = frame;
            _send_captured_frame(frame);
        }
        if (slot != native_actor || mouse_control::current_mode() == MOUSE_MODE_COMMAND)
        {
            send_message("{\"msg\":\"input_mode\",\"mode\":%d}", MOUSE_MODE_COMMAND);
            send_message("{\"msg\":\"ui_state\",\"state\":%d}", UI_NORMAL);
        }
        json_open_object();
        json_write_string("msg", "map");
        if (baseline)
            json_write_bool("clear", true);
        json_write_int("view_seq", ++cache.sequence);
        json_write_bool("player_on_level", true);
        json_write_string("floor", floor.describe());
        json_write_string("invis_mon_desc", env.invis_knowledge.get_unknown_monster_description());
        json_open_object("vgrdc");
        json_write_int("x", member.pos().x);
        json_write_int("y", member.pos().y);
        json_close_object();
        json_open_object("view_work");
        json_write_int("los", los_checks);
        json_write_int("cells", changed.size());
        json_write_int("sent", updates.size());
        json_write_bool("terrain_reconcile", reconcile_floor);
        json_close_object();
        json_open_array("cells");
        for (const auto& record : updates)
        {
            json_write_comma();
            m_msg_buf += record;
        }
        json_close_array();
        json_close_object();
        finish_message();
    }
    m_personal_changed.clear();
    crawl_view = geometry;
    m_current_player_info = active_info;
}
#endif
