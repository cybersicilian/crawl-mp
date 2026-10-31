#pragma once

// Absolute time for entities and events belonging to the loaded floor.
// Character durations and personal timers retain their character clock.
int level_elapsed_time();

class monster;

// Entity ages survive encounter-clock rebasing. Seed old saves before any
// independent region advances the floor's high-water timestamp.
void prepare_level_entity_clocks();
int level_elapsed_time(const monster& entity);
void advance_level_entity_clock(monster& entity, int delta);
