/** Native perception and bounded single-action control for decision agents. */
#include "AppHdr.h"
#ifdef USE_TILE_WEB
#include "tileweb.h"
#include "ability.h"
#include "command.h"
#include "env.h"
#include "item-name.h"
#include "item-use.h"
#include "level-id.h"
#include "level-time.h"
#include "losglobal.h"
#include "map-cell.h"
#include "mon-info.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "quiver.h"
#include "spl-util.h"
#include "terrain.h"
#include "unwind.h"

namespace
{
struct agent_action
{
    string id, description;
    command_type command = CMD_NO_CMD;
    spell_type spell = SPELL_NO_SPELL;
    int item = -1;
    agent_action(string identity, string label, command_type cmd = CMD_NO_CMD,
                 spell_type power = SPELL_NO_SPELL, int inventory_slot = -1)
        : id(identity), description(label), command(cmd), spell(power), item(inventory_slot) {}
};

vector<agent_action> actions()
{
    vector<agent_action> result;
    if (party::is_player_downed(party::active_slot())
        || !party::member_can_act(party::active_slot()))
        return result;
    result.push_back({"wait", "Wait one ordinary turn; recover health and magic", CMD_WAIT});
    const coord_def directions[] = {{-1,0}, {0,1}, {0,-1}, {1,0}, {-1,-1}, {-1,1}, {1,-1}, {1,1}};
    const char* names[] = {"west", "south", "north", "east", "northwest", "southwest", "northeast", "southeast"};
    const command_type commands[] = {CMD_MOVE_LEFT, CMD_MOVE_DOWN, CMD_MOVE_UP, CMD_MOVE_RIGHT,
        CMD_MOVE_UP_LEFT, CMD_MOVE_DOWN_LEFT, CMD_MOVE_UP_RIGHT, CMD_MOVE_DOWN_RIGHT};
    for (int d = 0; d < 8; ++d)
    {
        const coord_def cell = you.pos() + directions[d];
        if (!in_bounds(cell) || !you.see_cell(cell) || party::player_at(cell))
            continue;
        const auto feat = env.map_knowledge(cell).feat();
        const monster* mon = monster_at(cell);
        if (mon && (!you.can_see(*mon) || mon->attitude() != ATT_HOSTILE))
            continue;
        if ((feat_is_solid(feat) && !feat_is_closed_door(feat))
            || feat_is_runed(feat) || feat_is_sealed(feat) || feat_is_trap(feat)
            || is_feat_dangerous(feat) || env.map_knowledge(cell).cloud() != CLOUD_NONE)
            continue;
        result.push_back({"step_" + string(names[d]),
            string(mon ? "Melee attack " : feat_is_closed_door(feat) ? "Open door " : "Move ") + names[d], commands[d]});
    }
    const auto stairs = feat_stair_direction(env.map_knowledge(you.pos()).feat());
    if (stairs == CMD_GO_UPSTAIRS || stairs == CMD_GO_DOWNSTAIRS)
        result.push_back({"stairs", stairs == CMD_GO_UPSTAIRS ? "Use the upstairs" : "Use the downstairs", stairs});
    bool hostile = false;
    for (int y = max(0, you.pos().y - LOS_MAX_RANGE); y <= min(GYM - 1, you.pos().y + LOS_MAX_RANGE); ++y)
        for (int x = max(0, you.pos().x - LOS_MAX_RANGE); x <= min(GXM - 1, you.pos().x + LOS_MAX_RANGE); ++x)
            if (you.see_cell(coord_def(x, y)))
                if (const monster* mon = monster_at(coord_def(x, y)))
                    hostile = hostile || (you.can_see(*mon) && mon->attitude() == ATT_HOSTILE);
    bool knows_spells = false;
    for (const auto spell : you.spells)
        if (spell != SPELL_NO_SPELL)
        {
            knows_spells = true;
            if (spell != SPELL_NO_SPELL && quiver::can_quick_cast(spell)
                && hostile
                && quiver::spell_to_action(spell)->is_enabled())
                result.push_back({"spell_" + to_string(spell),
                    "Quick cast " + string(spell_title(spell)) + " using native targeting",
                    CMD_NO_CMD, spell});
        }
    if (knows_spells)
        result.push_back({"cast", "Choose a known spell in the native spell prompt, then aim it", CMD_CAST_SPELL});
    if (!your_talents(false).empty())
        result.push_back({"ability", "Choose and use a native ability, answering its prompts", CMD_USE_ABILITY});
    bool potions = false, scrolls = false, devices = false, weapons = false, armour = false, jewellery = false;
    for (int i = 0; i < ENDOFPACK; ++i)
    {
        const auto& item = you.inv[i];
        if (!item.defined())
            continue;
        potions = potions || item.base_type == OBJ_POTIONS;
        scrolls = scrolls || item.base_type == OBJ_SCROLLS;
        devices = devices || item.base_type == OBJ_WANDS || item.base_type == OBJ_MISCELLANY;
        weapons = weapons || item.base_type == OBJ_WEAPONS;
        armour = armour || item.base_type == OBJ_ARMOUR;
        jewellery = jewellery || item.base_type == OBJ_JEWELLERY;
        if (you.hp < you.hp_max && item.defined() && item.base_type == OBJ_POTIONS
            && item_type_known(item) && (item.sub_type == POT_CURING || item.sub_type == POT_HEAL_WOUNDS))
            result.push_back({"heal_" + to_string(i), "Drink " + item.name(DESC_PLAIN, true),
                              CMD_NO_CMD, SPELL_NO_SPELL, i});
    }
    if (potions)
        result.push_back({"quaff", "Choose a potion in the native inventory prompt and drink it", CMD_QUAFF});
    if (scrolls)
        result.push_back({"read", "Choose and read a scroll, answering any follow-up prompts", CMD_READ});
    if (devices)
        result.push_back({"evoke", "Choose and evoke a wand or device, then aim it", CMD_EVOKE});
    if (hostile && quiver::get_primary_action()->is_enabled())
        result.push_back({"primary_attack", "Attack with the wielded weapon, choosing a native target", CMD_PRIMARY_ATTACK});
    if (hostile && quiver::get_secondary_action()->is_valid() && quiver::get_secondary_action()->is_enabled())
        result.push_back({"fire", "Fire " + quiver::get_secondary_action()->quiver_description(true).tostring()
            + ", choosing its target in the native prompt", CMD_FIRE});
    if (you.visible_igrd(you.pos()) != NON_ITEM)
        result.push_back({"pickup", "Pick up useful items here using the native pickup prompt", CMD_PICKUP});
    if (!hostile)
    {
        if (weapons)
            result.push_back({"wield", "Choose a better weapon in the native wield prompt", CMD_WIELD_WEAPON});
        if (armour)
            result.push_back({"wear", "Choose improved armour in the native equipment prompt", CMD_WEAR_ARMOUR});
        if (jewellery)
            result.push_back({"jewellery", "Choose useful jewellery in the native equipment prompt", CMD_WEAR_JEWELLERY});
    }
    return result;
}
}

string TilesFramework::_ai_state_json()
{
    unwind_var<string> buffer(m_msg_buf, "");
    unwind_var<vector<JsonFrame>> frames(m_json_stack, vector<JsonFrame>());
    json_open_object();
    json_write_int("slot", party::active_slot());
    json_write_string("floor", level_id::current().describe());
    json_write_int("floor_time", level_elapsed_time());
    json_write_int("global_time", party::global_elapsed_time());
    json_write_int("turns", you.num_turns);
    json_write_int("hp", you.hp);
    json_write_int("hp_max", you.hp_max);
    json_write_int("mp", you.magic_points);
    json_write_int("mp_max", you.max_magic_points);
    json_write_int("x", you.pos().x);
    json_write_int("y", you.pos().y);
    json_write_bool("can_act", party::member_can_act(party::active_slot()));
    json_write_bool("confused", you.confused());
    json_write_bool("berserk", you.berserk());
    json_write_string("terrain_legend", "17x17 rows centered on self; ? unknown, # solid, . walkable, + door, ! hazard/trap/cloud, < upstairs, > downstairs. Terrain memory is shared; monsters use personal sight only.");
    json_open_array("terrain");
    for (int dy = -8; dy <= 8; ++dy)
    {
        string row;
        for (int dx = -8; dx <= 8; ++dx)
        {
            const coord_def cell = you.pos() + coord_def(dx, dy);
            char mark = '?';
            if (in_bounds(cell))
            {
                const auto& known = env.map_knowledge(cell);
                const auto feat = known.feat();
                if (feat != DNGN_UNSEEN)
                    mark = feat_is_closed_door(feat) ? '+' : feat_is_solid(feat) ? '#'
                        : feat_stair_direction(feat) == CMD_GO_UPSTAIRS ? '<'
                        : feat_stair_direction(feat) == CMD_GO_DOWNSTAIRS ? '>'
                        : feat_is_trap(feat) || is_feat_dangerous(feat)
                          || (you.see_cell(cell) && known.cloud() != CLOUD_NONE) ? '!' : '.';
            }
            row += mark;
        }
        json_write_string(row);
    }
    json_close_array();
    json_open_array("creatures");
    for (int dy = -LOS_MAX_RANGE; dy <= LOS_MAX_RANGE; ++dy)
        for (int dx = -LOS_MAX_RANGE; dx <= LOS_MAX_RANGE; ++dx)
        {
            const coord_def cell = you.pos() + coord_def(dx, dy);
            if (!in_bounds(cell) || !you.see_cell(cell))
                continue;
            const monster* mon = monster_at(cell);
            if (!mon || !you.can_see(*mon))
                continue;
            const monster_info info(mon);
            json_open_object();
            json_write_string("name", info.full_name());
            json_write_int("dx", dx);
            json_write_int("dy", dy);
            json_write_bool("hostile", info.attitude == ATT_HOSTILE);
            json_write_int("threat", info.threat);
            json_write_string("wounds", info.damage_desc());
            json_close_object();
        }
    json_close_array();
    json_open_array("party");
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        const auto& member = party::get_player(slot);
        json_open_object();
        json_write_int("slot", slot);
        json_write_string("floor", level_id(member.where_are_you, member.depth).describe());
        json_write_int("x", member.pos().x);
        json_write_int("y", member.pos().y);
        json_write_int("turns", member.num_turns);
        json_write_int("hp", member.hp);
        json_write_bool("alive", !party::is_player_downed(slot));
        json_close_object();
    }
    json_close_array();
    json_open_object("actions");
    for (const auto& action : actions())
        json_write_string(action.id, action.description);
    json_close_object();
    json_close_object();
    return m_msg_buf;
}

string TilesFramework::_ai_guard()
{
    // Projection temporarily swaps map knowledge; compare simulation identity
    // and clocks rather than a temporary renderer representation at execution.
    return level_id::current().describe() + ":" + to_string(level_elapsed_time())
        + ":" + to_string(party::global_elapsed_time()) + ":" + to_string(you.num_turns)
        + ":" + to_string(you.hp) + ":" + to_string(you.magic_points)
        + ":" + to_string(you.pos().x) + ":" + to_string(you.pos().y);
}

void TilesFramework::_send_ai_state()
{
    const int slot = party::active_slot();
    if (!(m_ai_slots & (1 << slot)))
        return;
    const string state = _ai_state_json();
    if (m_ai_snapshots[slot] != state)
    {
        m_ai_snapshots[slot] = state;
        ++m_ai_revisions[slot];
    }
    m_ai_guards[slot] = _ai_guard();
    json_open_object();
    json_write_string("msg", "ai_state");
    json_write_int("revision", m_ai_revisions[slot]);
    json_write_name("state");
    write_message("%s", state.c_str());
    json_close_object();
    finish_message();
}

bool TilesFramework::_handle_ai_action(const JsonNode* obj)
{
    const int slot = party::active_slot();
    const auto revision = json_find_member(obj, "revision");
    const auto choice = json_find_member(obj, "choice");
    if (slot < 0 || slot >= 4 || !(m_ai_slots & (1 << slot)) || !revision || revision->tag != JSON_NUMBER
        || revision->number_ != m_ai_revisions[slot] || !choice || choice->tag != JSON_STRING
        || m_ai_snapshots[slot].empty() || m_ai_guards[slot] != _ai_guard())
        return false;
    for (const auto& action : actions())
        if (action.id == choice->string_)
        {
            // Consume before execution, including a zero-turn rejection or a
            // prompt. A delayed result can never replay this native action.
            ++m_ai_revisions[slot];
            m_ai_snapshots[slot].clear();
            party::cancel_activity();
            if (action.spell != SPELL_NO_SPELL)
                quiver::spell_to_action(action.spell)->trigger();
            else if (action.item >= 0)
                drink(&you.inv[action.item]);
            else
                process_command(action.command);
            return true;
        }
    return false;
}
#endif
