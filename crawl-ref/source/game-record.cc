/** Persistent identities and known-state records, independent of WebTiles UI. */
#include "AppHdr.h"
#include "game-record.h"

#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <random>

#include "artefact.h"
#include "describe.h"
#include "format.h"
#include "item-name.h"
#include "item-prop.h"
#include "jobs.h"
#include "json.h"
#include "json-wrapper.h"
#include "libutil.h"
#include "party.h"
#include "party-tally.h"
#include "player.h"
#include "species.h"
#include "state.h"
#include "stringutil.h"
#include "unwind.h"

namespace game_record
{
    static const char *GAME_KEY = "record_game_id";
    static const char *PLAYER_KEY = "record_player_id";
    static const char *ITEM_KEY = "record_item_id";
    static const char *JOURNAL_KEY = "record_randarts";

    string new_id()
    {
        // Do not consume Crawl's seeded gameplay RNG to allocate identities.
        static std::random_device entropy;
        unsigned char bytes[16];
        for (auto &byte : bytes)
            byte = entropy() & 255;
        bytes[6] = (bytes[6] & 15) | 64;
        bytes[8] = (bytes[8] & 63) | 128;
        string result;
        for (int i = 0; i < 16; ++i)
        {
            if (i == 4 || i == 6 || i == 8 || i == 10)
                result += '-';
            result += make_stringf("%02x", bytes[i]);
        }
        return result;
    }

    string player_id(player &p)
    {
        if (!p.props.exists(PLAYER_KEY))
            p.props[PLAYER_KEY] = new_id();
        return p.props[PLAYER_KEY].get_string();
    }

    string game_id()
    {
        player &root = party::is_enabled() ? party::get_player(0) : you;
        if (!root.props.exists(GAME_KEY))
        {
            const char *configured = getenv("CRAWL_GAME_ID");
            root.props[GAME_KEY] = configured && *configured ? string(configured) : new_id();
        }
        const string identifier = root.props[GAME_KEY].get_string();
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            player &p = party::get_player(slot);
            p.props[GAME_KEY] = identifier;
            player_id(p);
        }
        return identifier;
    }

    string item_id(item_def &item)
    {
        if (!item.props.exists(ITEM_KEY))
            item.props[ITEM_KEY] = new_id();
        return item.props[ITEM_KEY].get_string();
    }

    string known_item_id(const item_def &item)
    {
        if (!is_random_artefact(item) || !item.is_identified()
            || !item.props.exists(ITEM_KEY))
        {
            return "";
        }
        return item.props[ITEM_KEY].get_string();
    }

    static void text(JsonNode *obj, const char *key, const string &value)
    {
        json_append_member(obj, key, json_mkstring(value));
    }

    static void number(JsonNode *obj, const char *key, int value)
    {
        json_append_member(obj, key, json_mknumber(value));
    }

    void observe_item(item_def &item)
    {
        if (!is_random_artefact(item) || !item.is_identified())
            return;
        const string identifier = item_id(item);
        JsonWrapper record = json_mkobject();
        text(record.node, "id", identifier);
        text(record.node, "name", item.name(DESC_PLAIN));
        text(record.node, "description",
             formatted_string::parse_string(get_item_description(item)).tostring());
        text(record.node, "finder_id", player_id(you));
        text(record.node, "finder_name", you.your_name);
        text(record.node, "place", level_id::current().describe());
        number(record.node, "plus", item.plus);
        player &root = party::is_enabled() ? party::get_player(0) : you;
        auto &journal = root.props[JOURNAL_KEY].get_table();
        // Keep the original finder when another hero equips a shared item.
        if (journal.exists(identifier))
        {
            JsonWrapper old = json_decode(journal[identifier].get_string().c_str());
            for (const char *key : {"finder_id", "finder_name", "place"})
            {
                JsonNode *previous = json_find_member(old.node, key);
                if (previous && previous->tag == JSON_STRING)
                {
                    JsonNode *current = json_find_member(record.node, key);
                    json_remove_from_parent(current);
                    json_delete(current);
                    text(record.node, key, previous->string_);
                }
            }
        }
        char *encoded = json_encode(record.node);
        journal[identifier] = string(encoded);
        free(encoded);
    }

    void publish(bool saved)
    {
        if (!crawl_state.game_started || !you.save)
            return;
        const string identifier = game_id();
        const char *path = getenv("CRAWL_RECORD_PATH");
        // IDs still persist in native-only play without a web record sink.
        if (!path || !*path)
            return;
        JsonWrapper record = json_mkobject();
        text(record.node, "id", identifier);
        text(record.node, "seed", make_stringf("%llu", (unsigned long long)you.game_seed));
        number(record.node, "turns", you.num_turns);
        text(record.node, "place", level_id::current().describe());
        if (saved)
        {
            char stamp[32];
            time_t epoch = time(nullptr);
            strftime(stamp, sizeof(stamp), "%Y-%m-%dT%H:%M:%SZ", gmtime(&epoch));
            player &root = party::is_enabled() ? party::get_player(0) : you;
            root.props["record_saved_at"] = string(stamp);
        }
        player &root = party::is_enabled() ? party::get_player(0) : you;
        if (root.props.exists("record_saved_at"))
            text(record.node, "saved_at", root.props["record_saved_at"].get_string());
        JsonNode *members = json_mkarray();
        json_append_member(record.node, "players", members);
        for (int slot = 0; slot < party::player_count(); ++slot)
        {
            player &p = party::get_player(slot);
            unwind_var<player*> context(real_you, &p);
            JsonNode *member = json_mkobject();
            json_append_element(members, member);
            text(member, "id", player_id(p));
            text(member, "name", p.your_name);
            text(member, "species", species::name(p.species));
            text(member, "job", get_job_name(p.char_class));
            text(member, "place", level_id(p.where_are_you, p.depth).describe());
            number(member, "slot", slot);
            number(member, "xl", p.experience_level);
            number(member, "hp", p.hp);
            number(member, "hp_max", p.hp_max);
            number(member, "mp", p.magic_points);
            number(member, "mp_max", p.max_magic_points);
            number(member, "damage_dealt", party::slot_damage_dealt(slot));
            number(member, "support_acts", party::slot_support_acts(slot));
            number(member, "citation_points", party::slot_citation_points(slot));
            text(member, "mvp_title", party::slot_mvp_title(slot));
            for (auto &item : p.inv)
                if (item.defined())
                    observe_item(item);
        }
        JsonNode *items = json_mkarray();
        json_append_member(record.node, "randarts", items);
        if (root.props.exists(JOURNAL_KEY))
        {
            for (const auto &entry : root.props[JOURNAL_KEY].get_table())
                json_append_element(items, json_decode(entry.second.get_string().c_str()));
        }
        char *encoded = json_encode(record.node);
        static string last_snapshot;
        if (!saved && last_snapshot == encoded)
        {
            free(encoded);
            return;
        }
        const string temporary = string(path) + ".tmp";
        FILE *output = fopen(temporary.c_str(), "w");
        if (output)
        {
            const bool written = fputs(encoded, output) >= 0;
            const bool closed = fclose(output) == 0;
            if (written && closed)
            {
                if (rename(temporary.c_str(), path) == 0)
                    last_snapshot = encoded;
            }
        }
        free(encoded);
    }
}
