#pragma once

#include "ray.h"
#include "target.h"

enum class spret;

// One ray per shard; the same deterministic count is used by the preview
// and the actual cast so every possible hit is shown before confirmation.
int icicle_burst_count(int power);

class icicle_burst_targeter : public targeter
{
public:
    icicle_burst_targeter(const actor* caster, int power, int range);
    bool valid_aim(coord_def where) override;
    bool set_aim(coord_def where) override;
    aff_type is_affected(coord_def where) override;

    vector<ray_def> rays;
private:
    map<coord_def, int> zapped;
    int range;
};

spret cast_icicle_burst(int power, coord_def target, bool fail);
