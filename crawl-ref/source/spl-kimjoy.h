#pragma once

#include "coord.h"
#include "spl-cast.h"

class actor;
class monster;

constexpr const char* ROOTSPIKE_CONSTRICTION_KEY = "rootspike_constriction";
int rootspike_constriction_damage(actor& caster, monster& target, int damage);
spret cast_eringyas_rootspike(int power, coord_def target, bool fail);
spret cast_olgrebs_last_mercy(int power, coord_def target, bool fail);
