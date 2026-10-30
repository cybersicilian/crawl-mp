#pragma once

#include "coord.h"
class actor;
class monster;
class level_id;
enum class spret;

namespace bunker
{
bool available(const actor& owner);
monster* find(const actor& owner);
spret deploy(const coord_def& target);
void retrieve_after_moving();
void retrieve_on_departure();
void retrieve_party_on_departure(const level_id& source, bool transport_party);
}
