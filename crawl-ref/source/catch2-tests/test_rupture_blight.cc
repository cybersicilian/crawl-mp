#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "monster.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "player.h"
#include "random.h"
#include "spl-rupture-blight.h"
#include "test_vellum_fixture.h"

TEST_CASE("Mana Rupture damage grows with willpower and spell power", "[rupture-blight]")
{
    const dice_def no_will = mana_rupture_damage(0, 100);
    CHECK(no_will.num == 6);
    CHECK(no_will.size == 0);
    const dice_def capped = mana_rupture_damage(200, 105);
    const dice_def over_cap = mana_rupture_damage(400, 105);
    const dice_def immune = mana_rupture_damage(WILL_INVULN, 105);
    CHECK(capped.size == 20);
    CHECK(over_cap.size == capped.size);
    CHECK(immune.size == capped.size);
    CHECK(mana_rupture_damage(200, 30).size < capped.size);
}

TEST_CASE_METHOD(vellum_fixture, "Mana Rupture strips will without affecting its caster",
                 "[rupture-blight]")
{
    init_monsters();
    monster target;
    target.type = MONS_RAT;
    target.hit_points = target.max_hit_points = 20;
    target.set_hit_dice(1);
    REQUIRE(target.willpower() != WILL_INVULN);
    mana_rupture_weaken(target, &you);
    CHECK(target.has_ench(ENCH_LOWERED_WL));
    CHECK_FALSE(mana_rupture_dismiss(target, &you));
}

TEST_CASE_METHOD(vellum_fixture, "Blight drains, poisons and impairs a vulnerable foe",
                 "[rupture-blight]")
{
    init_monsters();
    monster target;
    target.type = MONS_RAT;
    target.hit_points = target.max_hit_points = 100;
    target.set_hit_dice(20);
    blight_monster(target, &you, 90);
    CHECK(target.has_ench(ENCH_DRAINED));
    CHECK(target.has_ench(ENCH_POISON));
    CHECK((target.has_ench(ENCH_SLOW) || target.has_ench(ENCH_CONFUSION)));
}
