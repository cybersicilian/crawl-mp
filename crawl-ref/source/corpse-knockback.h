#pragma once

class actor;
struct item_def;
struct coord_def;

namespace corpse_knockback
{
// Move a real corpse up to distance cells away from the attack origin.
// The caller determines distance; this function handles terrain and collisions.
void launch(item_def& corpse, actor& attacker, const coord_def& origin,
            int distance, int damage);
}
