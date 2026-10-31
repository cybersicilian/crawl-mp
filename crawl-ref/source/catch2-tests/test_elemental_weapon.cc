#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "elemental-weapon.h"
#include "branch.h"
#include "dungeon.h"
#include "mon-util.h"
#include "oozle-memory-effects.h"
#include "party.h"
#include "spl-util.h"
#include "tags.h"
#include "test_vellum_fixture.h"

namespace
{
struct elemental_weapon_fixture : vellum_fixture
{
    int old_depth = brdepth[BRANCH_DUNGEON];
    elemental_weapon_fixture()
    {
        brdepth[BRANCH_DUNGEON] = 15;
        init_monsters();
        dgn_reset_level(false);
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        init_spell_descs();
    }
    ~elemental_weapon_fixture()
    {
        brdepth[BRANCH_DUNGEON] = old_depth;
        dgn_reset_level(false);
    }
};
}

TEST_CASE_METHOD(elemental_weapon_fixture, "Elemental Weapon follows the wielded weapon and elemental spells", "[elemental-weapon]")
{
    you.equipment.items.clear();
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    REQUIRE(you.weapon() == &weapon);
    you.skills[SK_FIRE_MAGIC] = 12;
    REQUIRE(elemental_weapon::cast(30, false) == spret::success);
    CHECK(elemental_weapon::brand(you, &weapon) == SPWPN_NORMAL);
    elemental_weapon::on_spell_cast(SPELL_FIREBALL);
    CHECK(elemental_weapon::brand(you, &weapon) == SPWPN_FLAMING);
    CHECK(oozle::effective_brand(you, &weapon) == SPWPN_FLAMING);
    CHECK(elemental_weapon::damage_bonus(you, &weapon) == 4);
    CHECK(elemental_weapon::description(you, weapon).find("+4") != string::npos);
    CHECK(get_weapon_brand(weapon) == SPWPN_NORMAL);
    elemental_weapon::on_spell_cast(SPELL_SHOCK);
    CHECK(elemental_weapon::brand(you, &weapon) == SPWPN_ELECTROCUTION);
    elemental_weapon::on_unequip(weapon);
    CHECK(you.duration[DUR_ELEMENTAL_WEAPON] == 0);
    CHECK(elemental_weapon::brand(you, &weapon) == SPWPN_NORMAL);
}

TEST_CASE_METHOD(elemental_weapon_fixture, "Elemental Weapon survives player state serialization", "[elemental-weapon]")
{
    you.equipment.items.clear();
    carry(0, OBJ_WEAPONS, WPN_DAGGER, false).rnd = 1;
    wear(0, SLOT_WEAPON);
    you.skills[SK_ICE_MAGIC] = 9;
    REQUIRE(elemental_weapon::cast(30, false) == spret::success);
    elemental_weapon::on_spell_cast(SPELL_FREEZE);
    vector<unsigned char> bytes;
    writer output(&bytes);
    tag_write(TAG_YOU, output);
    elemental_weapon::end();
    reader input(bytes, TAG_MINOR_VERSION);
    tag_read(input, TAG_YOU);
    CHECK(you.duration[DUR_ELEMENTAL_WEAPON] > 0);
    CHECK(elemental_weapon::brand(you, &you.inv[0]) == SPWPN_FREEZING);
    CHECK(elemental_weapon::damage_bonus(you, &you.inv[0]) == 3);
}

TEST_CASE_METHOD(elemental_weapon_fixture, "Elemental Weapon rejects branded weapons and keeps effects per player", "[elemental-weapon]")
{
    you.equipment.items.clear();
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    set_item_ego_type(weapon, OBJ_WEAPONS, SPWPN_FLAMING);
    CHECK(elemental_weapon::cast(30, false) == spret::abort);
    set_item_ego_type(weapon, OBJ_WEAPONS, SPWPN_NORMAL);
    REQUIRE(elemental_weapon::cast(30, false) == spret::success);
    elemental_weapon::on_spell_cast(SPELL_FREEZE);
    CHECK(elemental_weapon::brand(you, &weapon) == SPWPN_FREEZING);
    CHECK(elemental_weapon::brand(party::get_player(1), &weapon) == SPWPN_NORMAL);
    elemental_weapon::end();
    CHECK(elemental_weapon::damage_bonus(you, &weapon) == 0);
}
