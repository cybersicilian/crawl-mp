#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>
#include <map>

#include "newgame.h"
// The generated group tables depend on the struct definitions in newgame.h.
#include "job-groups.h"
#include "species-groups.h"

// The native species/background menus place every group at a fixed column and
// row (species-groups.h / job-groups.h). These tests recompute the tallest
// column directly from that generated data, so they fail if newgame.cc ever
// goes back to a hard-coded OuterMenu height that the data has outgrown.

namespace
{
// Rows each column needs: title row plus one row per entry in each group.
// The TAG_MAJOR_VERSION guards are already resolved inside the arrays.
std::map<int, int> _species_column_rows()
{
    std::map<int, int> rows;
    for (const species_group& group : species_groups)
    {
        int shown = 0;
        for (const species_type sp : group.species_list)
        {
            if (sp == SP_UNKNOWN)
                break;
            ++shown;
        }
        rows[group.position.x] = std::max(rows[group.position.x],
                                          group.position.y + 1 + shown);
    }
    return rows;
}

std::map<int, int> _job_column_rows()
{
    std::map<int, int> rows;
    for (const job_group& group : job_groups)
    {
        int shown = 0;
        for (const job_type job : group.jobs)
        {
            if (job == JOB_UNKNOWN)
                break;
            ++shown;
        }
        rows[group.position.x] = std::max(rows[group.position.x],
                                          group.position.y + 1 + shown);
    }
    return rows;
}
}

TEST_CASE("Species menu groups fit inside the menu height", "[newgame-layout]")
{
    const int height = newgame_menu_height(false);
    CHECK(height >= NEWGAME_MENU_MIN_ROWS);
    int tallest = 0;
    for (const auto& column : _species_column_rows())
    {
        CAPTURE(column.first, column.second, height);
        CHECK(column.first >= 0);
        CHECK(column.first < 3); // the menu is built with three columns
        CHECK(column.second <= height);
        tallest = std::max(tallest, column.second);
    }
    CHECK(newgame_menu_rows_needed(false) == tallest);
}

TEST_CASE("Background menu groups fit inside the menu height", "[newgame-layout]")
{
    const int height = newgame_menu_height(true);
    CHECK(height >= NEWGAME_MENU_MIN_ROWS);
    int tallest = 0;
    for (const auto& column : _job_column_rows())
    {
        CAPTURE(column.first, column.second, height);
        CHECK(column.first >= 0);
        CHECK(column.first < 3);
        CHECK(column.second <= height);
        tallest = std::max(tallest, column.second);
    }
    CHECK(newgame_menu_rows_needed(true) == tallest);
}

TEST_CASE("Groups sharing a column do not overlap", "[newgame-layout]")
{
    // A group that starts before the previous group in its column has ended
    // would make OuterMenu::add_button assert on an occupied cell.
    for (const species_group& a : species_groups)
        for (const species_group& b : species_groups)
        {
            if (&a == &b || a.position.x != b.position.x
                || a.position.y >= b.position.y)
            {
                continue;
            }
            int shown = 0;
            for (const species_type sp : a.species_list)
            {
                if (sp == SP_UNKNOWN)
                    break;
                ++shown;
            }
            CAPTURE(a.name, b.name);
            CHECK(a.position.y + 1 + shown <= b.position.y);
        }
    for (const job_group& a : job_groups)
        for (const job_group& b : job_groups)
        {
            if (&a == &b || a.position.x != b.position.x
                || a.position.y >= b.position.y)
            {
                continue;
            }
            int shown = 0;
            for (const job_type job : a.jobs)
            {
                if (job == JOB_UNKNOWN)
                    break;
                ++shown;
            }
            CAPTURE(a.name, b.name);
            CHECK(a.position.y + 1 + shown <= b.position.y);
        }
}
