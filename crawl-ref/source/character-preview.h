#pragma once

#include <string>

// Creates an in-memory party using native new-game setup. Never enters a
// dungeon or writes a save, Chronicle entry, hero record, or gameplay event.
std::string character_preview_json(const std::string &party_spec);
