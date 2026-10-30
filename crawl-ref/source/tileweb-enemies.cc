/** Recipient-visible initiative and explicitly remembered invisible contacts. */
#include "AppHdr.h"
#ifdef USE_TILE_WEB
#include "tileweb.h"
#include "act-iter.h"
#include "env.h"
#include "map-knowledge.h"
#include "mon-energy.h"
#include "mon-util.h"
#include "party.h"
#include "player.h"
#include "web-monster-effect-keys.h"

void TilesFramework::_send_enemy_initiative()
{
    json_open_array("enemy_initiative");
    if (party::is_enabled() && party::is_player_downed(party::active_slot()))
    {
        json_close_array();
        return; // Match the personal map's suppressed sight for downed heroes.
    }
    set<mid_t> sent;
    const auto emit = [&](const monster_info& info, mid_t id,
                          coord_def pos, const monster* visible) {
        sent.insert(id);
        const coord_def relative = pos - m_origin;
        json_open_object();
        json_write_int("id", id);
        json_write_string("name", info.full_name());
        json_write_int("x", relative.x);
        json_write_int("y", relative.y);
        json_write_string("perception", visible ? "visible" : "last_known");
        if (visible)
        {
            json_write_int("damage_level", info.dam);
            json_write_string("health", info.damage_desc());
            json_write_int("energy_deficit", monster_energy_deficit(visible->speed_increment));
            json_write_int("speed", visible->speed);
            json_write_bool("ready", visible->has_action_energy());
            json_write_bool("statuses_known", true);
            json_open_array("statuses");
            for (const auto& condition : info.conditions())
            {
                json_open_object();
                json_write_int("id", condition.id);
                json_write_string("icon_key", web_monster_effect_key(condition.id));
                json_write_string("text", condition.name);
                json_write_string("desc", condition.description);
                if (condition.kind != monster_condition_kind::neutral)
                    json_write_bool("is_bad", condition.kind == monster_condition_kind::harmful);
                json_close_object();
            }
            json_close_array();
        }
        json_close_object();
    };
    for (monster_iterator mi; mi; ++mi)
    {
        if (!mi->alive() || mi->wont_attack() || party::is_proxy_monster(**mi))
            continue;
        if (you.can_see(**mi))
            emit(monster_info(*mi), mi->mid, mi->pos(), *mi);
    }
    const auto remembered = party::multiplayer_enabled() && !m_projecting_view
        ? env.invis_knowledge.personal_view(party::active_slot()).known_positions()
        : env.invis_knowledge.known_positions();
    for (const auto& info : remembered)
        if (!sent.count(info.mid))
            emit(info, info.mid, info.pos, nullptr);
    json_close_array();
}
#endif
