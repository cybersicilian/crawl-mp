#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "beam-type.h"
#include "beam.h"
#include "cloud.h"
#include "fight.h"
#include "mon-util.h"
#include "monster.h"
#include "party.h"
#include "player.h"
#include "religion.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Agraphede poison resistance belongs to the attacking player",
                 "[agraphede][agraphede-resist]")
{
    monster natural;
    natural.type = MONS_BLACK_MAMBA;
    const int original = natural.res_poison();
    REQUIRE(original > 0);
    you.religion = GOD_AGRAPHEDE;
    you.penance[GOD_AGRAPHEDE] = 0;
    you.raw_piety = piety_breakpoint(2) - 1;
    CHECK(agraphede_poison_resistance(&natural, &you) == original);
    you.raw_piety = piety_breakpoint(2);
    CHECK(agraphede_poison_resistance(&natural, &you) == 0);
    CHECK(resist_adjust_damage(&natural, BEAM_POISON, 30, &you) == 30);
    CHECK(resist_adjust_damage(&natural, BEAM_POISON, 30) < 30);
    CHECK_FALSE(actor_cloud_immune(natural, CLOUD_POISON, &you));
    CHECK(actor_cloud_immune(natural, CLOUD_POISON));
    CHECK(agraphede_poison_resistance(&natural, nullptr) == original);

    monster other_attacker;
    other_attacker.type = MONS_ORC;
    CHECK(agraphede_poison_resistance(&natural, &other_attacker) == original);
    you.penance[GOD_AGRAPHEDE] = 1;
    CHECK(agraphede_poison_resistance(&natural, &you) == original);
    you.penance[GOD_AGRAPHEDE] = 0;

    monster demon;
    demon.type = MONS_CERULEAN_IMP;
    const int demon_resistance = demon.res_poison();
    REQUIRE(demon_resistance > 0);
    CHECK(agraphede_poison_resistance(&demon, &you) == demon_resistance);
    monster holy;
    holy.type = MONS_CHERUB;
    REQUIRE(holy.res_poison() > 0);
    CHECK(agraphede_poison_resistance(&holy, &you) == holy.res_poison());
    you.raw_piety = piety_breakpoint(4);
    CHECK(agraphede_poison_resistance(&demon, &you) == 0);
    CHECK(agraphede_poison_resistance(&holy, &you) == 0);
    monster undead;
    undead.type = MONS_SKELETAL_WARRIOR;
    CHECK(agraphede_poison_resistance(&undead, &you) == undead.res_poison());

    party::set_player_count(2);
    player& companion = party::get_player(1);
    companion = you;
    companion.save = nullptr;
    companion.mid = party::mid_for_slot(1);
    companion.religion = GOD_NO_GOD;
    party::set_multiplayer(true);
    CHECK(agraphede_poison_resistance(&natural, &companion) == original);
    companion.religion = GOD_AGRAPHEDE;
    companion.raw_piety = piety_breakpoint(2);
    CHECK(agraphede_poison_resistance(&natural, &companion) == 0);
    // A delayed or reflected beam retains its actual owner's MID instead of
    // borrowing whichever player happens to be the current actor.
    bolt projectile;
    projectile.thrower = KILL_YOU_MISSILE;
    projectile.source_id = companion.mid;
    REQUIRE(agraphede_poison_beam_source(projectile) != nullptr);
    CHECK(agraphede_poison_resistance(&natural,
          agraphede_poison_beam_source(projectile)) == 0);
    you.religion = GOD_NO_GOD;
    projectile.reflections = 1;
    projectile.reflector = you.mid;
    CHECK(agraphede_poison_resistance(&natural,
          agraphede_poison_beam_source(projectile)) == original);
    projectile.reflector = MID_NOBODY;
    CHECK(agraphede_poison_beam_source(projectile) == nullptr);
    projectile.reflections = 0;
    projectile.source_id = MID_NOBODY;
    CHECK(agraphede_poison_beam_source(projectile) == nullptr);
    you.religion = GOD_AGRAPHEDE;
    cloud_struct unknown_cloud;
    unknown_cloud.type = CLOUD_POISON;
    unknown_cloud.whose = KC_YOU;
    CHECK(actor_cloud_immune(natural, unknown_cloud));
    CHECK(party::active_slot() == 0);
    party::set_multiplayer(false);
    companion.save = nullptr;
    party::set_player_count(1);
}
