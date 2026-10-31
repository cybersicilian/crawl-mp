/**
 * @file
 * @brief Machine-readable statistics for the WebTiles /stats pages.
 *
 * Contract: docs/stats.md.
 *  - stats_reference_json(): the `crawl -stats-json` reference dump.
 *  - stats_append_*(): `hero_snapshot` lines appended to stats_events.jsonl.
 */

#pragma once

#include "monster-type.h"
#include "object-class-type.h"

class scorefile_entry;

// Contract 1: full reference dump (engine tables) as a JSON string.
string stats_reference_json();

// Stable lowercase snake_case keys shared by the reference dump and the
// per-hero kill counts in hero snapshots.
string stats_monster_key(monster_type mc);
string stats_item_key(object_class_type base, int sub_type);

// Contract 2: hero snapshots. These never throw and silently ignore I/O
// failures; they do not touch the gameplay RNG or the save format.

// Serialise one party slot (0 for solo games) as a single-line JSON object.
// `se` is only used when `final` is set and the slot is the one the
// scorefile entry describes; outcome is "alive" when not final.
string stats_hero_snapshot_json(int slot, bool final, const string &outcome,
                                const scorefile_entry *se);

// Called on every save: one non-final snapshot per party hero.
void stats_append_hero_snapshots();

// Called once when the game ends (death/win/quit/leave): one final snapshot
// per party hero. The active hero's outcome comes from `se`; other heroes are
// "dead" if downed, otherwise share the active hero's outcome.
void stats_append_final_snapshots(const scorefile_entry &se);

// Called when a party hero is downed (not a permadeath): remember the killer
// on the hero and append a non-final snapshot for that hero.
void stats_note_hero_downed(const scorefile_entry &se);
