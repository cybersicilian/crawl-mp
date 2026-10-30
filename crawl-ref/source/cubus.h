#pragma once

class actor;
class monster;

namespace cubus
{
enum class effect { disarm, allure };

// Check or apply the effect to the specified actor, including party proxies.
bool can_affect(const monster& caster, actor& target, effect which);
bool apply(monster& caster, actor& target, effect which, int power,
           bool check_will = true);
}
