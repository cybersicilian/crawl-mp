#pragma once

namespace party
{
// While alive, reuse one region partition for per-entity checks. Each
// reconciliation scans every monster and cloud, and a world turn asks once
// per monster, cloud and environment seed. A change to any hero's floor,
// position or living state still repartitions immediately.
class scoped_region_snapshot
{
public:
    scoped_region_snapshot();
    ~scoped_region_snapshot();

    scoped_region_snapshot(const scoped_region_snapshot&) = delete;
    scoped_region_snapshot& operator=(const scoped_region_snapshot&) = delete;
};
}
