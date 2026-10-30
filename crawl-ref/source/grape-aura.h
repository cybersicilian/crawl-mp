#pragma once

#include <functional>

struct coord_def;

namespace grape_aura
{
constexpr int radius = 2;
bool exposed(const coord_def& pos);
// Advance a persistent countdown. next_interval must return a positive value.
void advance_clock(int delta, int& remaining,
                   const std::function<int()>& next_interval,
                   const std::function<void()>& tick);

// Called once per advancement of the loaded floor's clock.
void advance(int floor_delta);
}
