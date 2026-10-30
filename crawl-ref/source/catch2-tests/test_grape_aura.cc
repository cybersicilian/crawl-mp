#include "catch_amalgamated.hpp"

#include "AppHdr.h"
#include "grape-aura.h"

TEST_CASE("grape aura timer follows elapsed floor time", "[single-file]")
{
    int remaining = 0;
    int ticks = 0;
    auto interval = [] { return 100; };
    auto pulse = [&] { ++ticks; };

    grape_aura::advance_clock(0, remaining, interval, pulse);
    REQUIRE(remaining == 0);
    grape_aura::advance_clock(30, remaining, interval, pulse);
    REQUIRE(remaining == 70);
    REQUIRE(ticks == 0);
    grape_aura::advance_clock(270, remaining, interval, pulse);
    REQUIRE(ticks == 3);
    REQUIRE(remaining == 100);
}

TEST_CASE("grape aura retains independently sampled intervals", "[single-file]")
{
    int remaining = 0;
    int ticks = 0;
    int samples = 0;
    auto interval = [&] { return ++samples == 1 ? 100 : 300; };
    auto pulse = [&] { ++ticks; };

    grape_aura::advance_clock(250, remaining, interval, pulse);
    REQUIRE(ticks == 1);
    REQUIRE(remaining == 150);
    grape_aura::advance_clock(150, remaining, interval, pulse);
    REQUIRE(ticks == 2);
    REQUIRE(remaining == 300);
}
