#pragma once

#include <vector>
#include "coord-def.h"

class actor;

// A physical route toward an anchor: consecutive habitable cells, stopping
// before any obstruction or actor. This does not perform or pay for movement.
std::vector<coord_def> physical_pull_path(const actor& target,
                                        coord_def anchor, int maximum);
