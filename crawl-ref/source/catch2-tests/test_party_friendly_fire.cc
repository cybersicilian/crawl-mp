#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "party.h"
#include "player.h"
#include "tags.h"
#include "test_player_fixture.h"

namespace
{
constexpr const char *key = "party_friendly_fire";

struct friendly_fire_fixture : MockPlayerYouTestsFixture
{
    bool old_rule = party::friendly_fire_enabled();
    CrawlHashTable old_props = party::get_player(0).props;

    ~friendly_fire_fixture()
    {
        party::get_player(0).props = old_props;
        party::set_friendly_fire(old_rule);
    }

    vector<unsigned char> saved_props(bool enabled)
    {
        party::set_friendly_fire(enabled);
        party::save_friendly_fire();
        vector<unsigned char> bytes;
        writer out(&bytes);
        party::get_player(0).props.write(out);
        return bytes;
    }

    void load_props(const vector<unsigned char> &bytes)
    {
        reader in(bytes, TAG_MINOR_VERSION);
        auto &props = party::get_player(0).props;
        props.clear();
        props.read(in);
        party::restore_friendly_fire();
    }
};
}

TEST_CASE_METHOD(friendly_fire_fixture, "Friendly fire follows each saved party",
                 "[party][friendly-fire]")
{
    const auto safe = saved_props(false);
    const auto classic = saved_props(true);
    party::set_friendly_fire(true);
    load_props(safe);
    CHECK_FALSE(party::friendly_fire_enabled());
    party::set_friendly_fire(false);
    load_props(classic);
    CHECK(party::friendly_fire_enabled());
    load_props(safe);
    CHECK_FALSE(party::friendly_fire_enabled());
}

TEST_CASE_METHOD(friendly_fire_fixture, "Older party saves keep the launch friendly fire rule",
                 "[party][friendly-fire]")
{
    auto &props = party::get_player(0).props;
    if (props.exists(key))
        props.erase(key);
    for (bool launch_rule : {false, true})
    {
        party::set_friendly_fire(launch_rule);
        party::restore_friendly_fire();
        CHECK(party::friendly_fire_enabled() == launch_rule);
    }
}
