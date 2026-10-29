#pragma once

enum class spret;

namespace paladin
{
bool can_intervene(bool quiet = false);
spret intervene(bool fail);
}
