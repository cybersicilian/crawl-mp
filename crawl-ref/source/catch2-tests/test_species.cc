#include "catch_amalgamated.hpp"

#include "AppHdr.h"
#include "species.h"

TEST_CASE( "Random draconian species are not removed", "[single-file]" ) {
    for (int i = 0; i < 100; ++i)
    {
        auto species = species::random_draconian_colour();
        REQUIRE( !species::is_removed(species) );
    }
}

TEST_CASE( "Random draconian species are derived draconians", "[single-file]" ) {
    for (int i = 0; i < 100; ++i)
    {
        auto species = species::random_draconian_colour();
        REQUIRE( species::is_draconian(species) );
        REQUIRE( species != SP_BASE_DRACONIAN );
    }
}

TEST_CASE("Species YAML exposes presentation and job recommendations", "[species-yaml]")
{
    REQUIRE(species::walking_verb(SP_OCTOPODE) == "Wriggl");
    REQUIRE(species::prayer_action(SP_OCTOPODE) == "curl up in front of");
    REQUIRE(species::walking_verb(SP_HUMAN) == "Walk");
    REQUIRE(species::prayer_action(SP_HUMAN) == "kneel at");
    REQUIRE(species::fake_mutations(SP_OCTOPODE, false)
            == vector<string>{"You cannot wear most types of armour."});
    REQUIRE(species::fake_mutations(SP_OCTOPODE, true)
            == vector<string>{"almost no armour"});
    REQUIRE(species::recommends_job(SP_OCTOPODE, JOB_SHAPESHIFTER));
    REQUIRE_FALSE(species::recommends_job(SP_OCTOPODE, JOB_BERSERKER));
    REQUIRE(species::recommends_job(SP_HUMAN, JOB_BERSERKER));
}
