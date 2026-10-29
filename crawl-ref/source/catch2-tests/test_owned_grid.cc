#include "AppHdr.h"
#include "catch_amalgamated.hpp"
#include "owned-grid.h"
#include "coord-def.h"

TEST_CASE("Owned grids exchange storage without copying cells", "[owned-grid]")
{
    owned_grid<int, 5, 4> native, personal;
    native.init(11);
    personal.init(22);
    const coord_def cell(2, 3);
    int* native_cell = &native(cell);
    int* personal_cell = &personal(cell);
    native.swap(personal);
    REQUIRE(&native(cell) == personal_cell);
    REQUIRE(&personal(cell) == native_cell);
    REQUIRE(native(cell) == 22);
    REQUIRE(personal(cell) == 11);
    native(cell) = 33;
    native.swap(personal);
    REQUIRE(native(cell) == 11);
    REQUIRE(personal(cell) == 33);

    auto copy = personal;
    copy(cell) = 44;
    REQUIRE(personal(cell) == 33);
    native = copy;
    copy[2][3] = 55;
    REQUIRE(native(cell) == 44);
    REQUIRE(native.size() == 20);
}
