#pragma once

struct item_def;
class player;

namespace game_record
{
    string new_id();
    string game_id();
    string player_id(player &p);
    string item_id(item_def &item);
    string known_item_id(const item_def &item);
    void observe_item(item_def &item);
    void publish(bool saved = false);
}
