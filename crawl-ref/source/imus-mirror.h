#pragma once

#include "coord.h"
#include "enum.h"

class actor;
class monster;
struct ranged_attack_beam;
enum class spret;

namespace imus_mirror
{
monster* find(const actor& owner);
void abandon();
spret cast(int power, bool fail);
void replay_spell(spell_type spell, int power, const coord_def& target,
                  const vector<coord_def>& path = {});
void replay_projectile(const ranged_attack_beam& projectile);
bool act(monster& mirror);
}
