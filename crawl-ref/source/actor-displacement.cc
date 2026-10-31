#include "AppHdr.h"
#include "actor-displacement.h"

#include "actor.h"
#include "coord.h"
#include "los.h"
#include "mon-util.h"
#include "ray.h"
#include "terrain.h"

std::vector<coord_def> physical_pull_path(const actor& target,
                                        coord_def anchor, int maximum)
{
    std::vector<coord_def> path;
    ray_def ray;
    if (maximum <= 0 || target.is_stationary()
        || !find_ray(target.pos(), anchor, ray, opc_solid))
        return path;
    coord_def previous = target.pos();
    while (static_cast<int>(path.size()) < maximum
           && grid_distance(previous, anchor) > 1)
    {
        ray.advance();
        const coord_def next = ray.pos();
        if (!in_bounds(next) || next == previous || cell_is_solid(next)
            || actor_at(next) || !target.can_pass_through(next)
            || !target.is_habitable(next))
            break;
        path.push_back(next);
        previous = next;
    }
    return path;
}
