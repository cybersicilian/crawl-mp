#pragma once

namespace agra_web
{
// Summon up to count short-lived, homing web balls. Returns false if none
// could be placed, so the ability can preserve the player's resources.
bool summon(int power, int count);
}
