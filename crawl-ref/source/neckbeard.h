#pragma once

#include <memory>
#include <string>

#include "coord.h"
class targeter;
enum class spret;

namespace neckbeard
{
coord_def landing(const coord_def& origin, const coord_def& foe);
std::string blocked_reason();
std::unique_ptr<targeter> step_targeter();
spret step_behind(const coord_def& target);
}
