#pragma once

// Species-specific starts and bonuses tied to authenticated WebTiles accounts.
namespace account_start
{
void give_items();
// Call once after the new game's starting floor and party positions are loaded.
void place_features();
}
