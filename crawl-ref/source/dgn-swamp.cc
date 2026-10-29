#include "AppHdr.h"

#include "dgn-swamp.h"

#include "coordit.h"
#include "dgn-height.h"
#include "dungeon.h"

static void _swamp_slushy_patches(int depth_multiplier)
{
    const int margin = 15;
    const int yinterval = 4;
    const int xinterval = 4;
    const int fuzz = 9;
    const int bx = dgn_builder_x();
    const coord_def tl = dgn_builder_tl();
    const coord_def br = dgn_builder_br();
    const coord_def grdc(GXM / 2, GYM / 2);
    for (int y = tl.y + margin; y < br.y - margin; y += yinterval)
    {
        for (int x = tl.x + margin; x < br.x - margin; x += xinterval)
        {
            const coord_def p(x, y);
            const coord_def c(dgn_random_point_from(p, fuzz, margin));
            const coord_def center_delta(grdc - c);
            const int max_dist_sq = (bx / 2) * (bx / 2);
            const int depth = max_dist_sq - center_delta.abs();
            const int depth_offset = depth * 10 / max_dist_sq;
            const int n_points = random_range(5, 25 - depth_multiplier / 2);
            const int radius = random_range(2, 6);
            dgn_island_centred_at(c, n_points, radius,
                                  int_range(8 + depth_offset,
                                            17 + depth_offset),
                                  margin);
        }
    }
}

static dungeon_feature_type _swamp_feature_for_height(int height)
{
    return height > (8 - you.depth * 2) ? DNGN_SHALLOW_WATER :
        height > -8 ? DNGN_FLOOR :
        height > -10 ? DNGN_SHALLOW_WATER :
        DNGN_MANGROVE;
}

static void _swamp_apply_features(int margin)
{
    const coord_def tl = dgn_builder_tl();
    const coord_def br = dgn_builder_br();
    for (rectangle_iterator ri(tl, br); ri; ++ri)
    {
        const coord_def c(*ri);
        if (!map_masked(c, MMT_VAULT))
        {
            if (c.x < tl.x + margin || c.y < tl.y + margin
                || c.x > br.x - margin || c.y > br.y - margin)
            {
                env.grid(c) = DNGN_MANGROVE;
            }
            else
                env.grid(c) = _swamp_feature_for_height(dgn_height_at(c));
        }
    }
}

void dgn_build_swamp_level()
{
    const int swamp_depth = you.depth - 1;
    dgn_initialise_heightmap(-19);
    _swamp_slushy_patches(swamp_depth * 3);
    dgn_smooth_heights();
    _swamp_apply_features(6);
    env.heightmap.reset(nullptr);
}
