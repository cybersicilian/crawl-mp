#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "coordit.h"
#include "state.h"
#include "env.h"
#include "losglobal.h"
#include "message.h"
#include "mon-info.h"
#include "options.h"
#include "player.h"
#include "test_player_fixture.h"
#include "travel.h"
#include "unwind.h"

namespace
{
    const coord_def corner(30, 30);

    // Lays a level out from text, with every square known to the hero.
    struct route_fixture : MockPlayerYouTestsFixture
    {
        unwind_var<bool> saving{crawl_state.need_save, true};
        route_fixture(const vector<string> &rows)
        {
            static const bool messages = []() { msg::initialise_mpr_streams(); return true; }();
            (void)messages;
            env.mgrid.init(NON_MONSTER);
            for (rectangle_iterator ri(0); ri; ++ri)
            {
                env.grid(*ri) = DNGN_ROCK_WALL;
                env.map_knowledge(*ri).clear();
                env.map_knowledge(*ri).set_feature(DNGN_ROCK_WALL);
                env.map_knowledge(*ri).flags |= MAP_SEEN_FLAG;
            }
            for (size_t y = 0; y < rows.size(); ++y)
                for (size_t x = 0; x < rows[y].size(); ++x)
                {
                    const coord_def c = corner + coord_def(x, y);
                    const char glyph = rows[y][x];
                    if (glyph == '#')
                        continue;
                    const dungeon_feature_type feat
                        = glyph == '+' ? DNGN_CLOSED_DOOR : DNGN_FLOOR;
                    env.grid(c) = feat;
                    env.map_knowledge(c).set_feature(feat);
                    if (glyph == '.' || glyph == '+')
                        floor.push_back(c);
                    if (glyph == '@')
                        you.set_position(c);
                }
            invalidate_los();
        }

        // Forgets every wall, as with a far room glimpsed through a doorway.
        void forget_walls()
        {
            for (rectangle_iterator ri(0); ri; ++ri)
                if (env.grid(*ri) == DNGN_ROCK_WALL)
                    env.map_knowledge(*ri).clear();
        }

        vector<coord_def> floor;
    };

    // What the display does for the hero after every move.
    void _learn_view()
    {
        for (radius_iterator ri(you.pos(), LOS_DEFAULT); ri; ++ri)
        {
            env.map_knowledge(*ri).set_feature(env.grid(*ri));
            env.map_knowledge(*ri).flags |= MAP_SEEN_FLAG;
        }
    }

    coord_def _move_of(command_type cmd)
    {
        switch (cmd)
        {
        case CMD_MOVE_LEFT:       return coord_def(-1, 0);
        case CMD_MOVE_RIGHT:      return coord_def(1, 0);
        case CMD_MOVE_UP:         return coord_def(0, -1);
        case CMD_MOVE_DOWN:       return coord_def(0, 1);
        case CMD_MOVE_UP_LEFT:    return coord_def(-1, -1);
        case CMD_MOVE_UP_RIGHT:   return coord_def(1, -1);
        case CMD_MOVE_DOWN_LEFT:  return coord_def(-1, 1);
        case CMD_MOVE_DOWN_RIGHT: return coord_def(1, 1);
        default:                  return coord_def();
        }
    }

    // Drives the real travel loop and records where it goes.
    vector<coord_def> _walk(const coord_def &target)
    {
        unwind_var<bool> no_key_stop(Options.travel_key_stop, false);
        unwind_var<int> no_animation(Options.travel_delay, 0);
        const coord_def origin = you.pos();
        vector<coord_def> walked;
        you.running.pos = target;
        you.running = RMODE_TRAVEL;
        _learn_view();
        while (you.pos() != target && walked.size() < 100)
        {
            const coord_def step = _move_of(travel());
            if (step.origin())
                break;
            you.set_position(you.pos() + step);
            _learn_view();
            walked.push_back(you.pos());
        }
        you.running = RMODE_NOT_RUNNING;
        you.set_position(origin);
        return walked;
    }

    vector<coord_def> _route(const coord_def &target)
    {
        bool one_step = false;
        return click_travel_route(target, one_step);
    }

    const vector<string> pillars =
    {
        "@....#.....",
        ".##..#..#..",
        ".#...+..#..",
        "...#.#.##..",
        ".#.#...#...",
        ".#...#...#.",
    };
}

TEST_CASE("Previewed routes match the real walk to every square",
          "[click-travel-route]")
{
    route_fixture level(pillars);
    REQUIRE(level.floor.size() > 30);
    for (const coord_def &target : level.floor)
    {
        // Adjacent squares are a plain move, not a travel run.
        if (adjacent(you.pos(), target))
            continue;
        INFO("target " << target.x - corner.x << "," << target.y - corner.y);
        CHECK(_route(target) == _walk(target));
    }
}

TEST_CASE("Previewed routes match from every starting square",
          "[click-travel-route]")
{
    route_fixture level(pillars);
    const coord_def target = corner + coord_def(10, 5);
    for (const coord_def &start : level.floor)
    {
        if (start == target || adjacent(start, target))
            continue;
        you.set_position(start);
        INFO("start " << start.x - corner.x << "," << start.y - corner.y);
        CHECK(_route(target) == _walk(target));
    }
}

TEST_CASE("Previewed next steps match native travel as terrain is discovered",
          "[click-travel-route]")
{
    route_fixture level(pillars);
    unwind_var<bool> no_key_stop(Options.travel_key_stop, false);
    unwind_var<int> no_animation(Options.travel_delay, 0);
    for (const coord_def &start : level.floor)
        for (const coord_def &target : level.floor)
        {
            if (start == target || adjacent(start, target))
                continue;
            you.set_position(start);
            level.forget_walls();
            _learn_view();
            you.running.pos = target;
            you.running = RMODE_TRAVEL;
            INFO("start " << start.x - corner.x << "," << start.y - corner.y
                 << " target " << target.x - corner.x << ","
                 << target.y - corner.y);
            // Adjacent clicks are direct moves; an already-running travel
            // may still take its conservative detour. That case is separate.
            for (int moves = 0; moves < 100
                 && !adjacent(you.pos(), target) && you.pos() != target; ++moves)
            {
                const vector<coord_def> route = _route(target);
                const coord_def step = _move_of(travel());
                if (step.origin())
                {
                    CHECK(route.empty());
                    break;
                }
                REQUIRE_FALSE(route.empty());
                CHECK(route.front() == you.pos() + step);
                you.set_position(you.pos() + step);
                _learn_view();
            }
            you.running = RMODE_NOT_RUNNING;
        }
}

TEST_CASE("Routes step diagonally past corners", "[click-travel-route]")
{
    route_fixture level({ "@#..",
                          "...#",
                          "##.." });
    const vector<coord_def> expected
        = { corner + coord_def(1, 1), corner + coord_def(2, 2) };
    CHECK(_route(corner + coord_def(2, 2)) == expected);
}

TEST_CASE("Routes depend only on the hero's remembered terrain",
          "[click-travel-route][route-knowledge]")
{
    route_fixture level(pillars);
    for (const coord_def &start : level.floor)
        for (const coord_def &target : level.floor)
        {
            if (start == target || adjacent(start, target))
                continue;
            you.set_position(start);
            level.forget_walls();
            _learn_view();
            const vector<coord_def> remembered = _route(target);
            vector<coord_def> unknown_walls;
            for (rectangle_iterator ri(0); ri; ++ri)
                if (!env.map_knowledge(*ri).known()
                    && env.grid(*ri) == DNGN_ROCK_WALL)
                {
                    unknown_walls.push_back(*ri);
                    env.grid(*ri) = DNGN_FLOOR;
                }
            invalidate_los();
            INFO("start " << start.x - corner.x << "," << start.y - corner.y
                 << " target " << target.x - corner.x << ","
                 << target.y - corner.y);
            CHECK(_route(target) == remembered);
            for (const coord_def &wall : unknown_walls)
                env.grid(wall) = DNGN_ROCK_WALL;
            invalidate_los();
        }
}

TEST_CASE("Routes skip what travel skips", "[click-travel-route]")
{
    route_fixture level({ "@.....",
                          ".##...",
                          "......" });
    const coord_def plant = corner + coord_def(3, 0);
    const coord_def beyond = corner + coord_def(5, 0);
    bool one_step = false;

    SECTION("Remembered plants are walked around")
    {
        env.map_knowledge(plant).set_monster(monster_info(MONS_TOADSTOOL));
        const vector<coord_def> route = click_travel_route(beyond, one_step);
        REQUIRE_FALSE(route.empty());
        CHECK(find(route.begin(), route.end(), plant) == route.end());
        CHECK(route.back() == beyond);
        CHECK_FALSE(one_step);
    }

    SECTION("A click on a plant only steps toward it")
    {
        env.map_knowledge(plant).set_monster(monster_info(MONS_TOADSTOOL));
        CHECK_FALSE(click_travel_route(plant, one_step).empty());
        CHECK(one_step);
    }

    SECTION("Walls have no route")
    {
        CHECK(click_travel_route(corner + coord_def(2, 1), one_step).empty());
        CHECK_FALSE(one_step);
    }

    SECTION("An adjacent wall is not a move")
    {
        CHECK(click_travel_route(corner + coord_def(1, 1), one_step).empty());
    }

    SECTION("Unknown squares have no route")
    {
        env.map_knowledge(beyond).clear();
        CHECK(click_travel_route(beyond, one_step).empty());
    }

    SECTION("A confused hero can't travel")
    {
        you.duration[DUR_CONF] = 10;
        CHECK(click_travel_route(beyond, one_step).empty());
    }

    SECTION("An adjacent square is one plain move")
    {
        const vector<coord_def> route
            = click_travel_route(corner + coord_def(1, 0), one_step);
        REQUIRE(route.size() == 1);
        CHECK(route[0] == corner + coord_def(1, 0));
    }

    SECTION("The hero's own square has no route")
    {
        CHECK(click_travel_route(you.pos(), one_step).empty());
    }
}

TEST_CASE("Routes stop before doors travel won't open", "[click-travel-route]")
{
    route_fixture level({ "@.+..",
                          "#####" });
    const coord_def door = corner + coord_def(2, 0);
    env.grid(door) = DNGN_RUNED_DOOR;
    env.map_knowledge(door).set_feature(DNGN_RUNED_DOOR);
    const vector<coord_def> expected = { corner + coord_def(1, 0) };
    CHECK(_route(corner + coord_def(4, 0)) == expected);
}

TEST_CASE("Asking for a route changes nothing", "[click-travel-route]")
{
    route_fixture level(pillars);
    const coord_def target = corner + coord_def(10, 5);
    travel_point_distance[5][5] = 1234;
    const int travel_x = you.travel_x;
    REQUIRE_FALSE(_route(target).empty());
    CHECK(travel_point_distance[5][5] == 1234);
    CHECK(you.travel_x == travel_x);
    CHECK(static_cast<int>(you.running) == 0);
    CHECK(you.running.pos != target);
    travel_point_distance[5][5] = 0;
}
