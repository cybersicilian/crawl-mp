#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>

#include "beam.h"
#include "god-item.h"
#include "invent.h"
#include "item-prop.h"
#include "los.h"
#include "map-knowledge.h"
#include "party.h"
#include "player.h"
#include "quiver.h"
#include "ranged-attack.h"
#include "religion.h"
#include "terrain.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#ifdef USE_TILE
#include "rltiles/tiledef-gui.h"
#include "tilepick.h"
#endif

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Imus registration and equipment rules", "[imus][imus-core]")
{
    CHECK(god_name(GOD_IMUS_THEA) == "Imus Thea");
    CHECK(feat_altar_god(altar_for_god(GOD_IMUS_THEA)) == GOD_IMUS_THEA);
    item_def armour;
    armour.base_type = OBJ_ARMOUR;
    armour.quantity = 1;
    armour.sub_type = ARM_ROBE;
    CHECK_FALSE(god_forbids_item(armour, GOD_IMUS_THEA));
    armour.sub_type = ARM_PLATE_ARMOUR;
    CHECK(god_forbids_item(armour, GOD_IMUS_THEA));
    armour.sub_type = ARM_BUCKLER;
    CHECK(god_forbids_item(armour, GOD_IMUS_THEA));

    item_def weapon;
    weapon.base_type = OBJ_WEAPONS;
    weapon.quantity = 1;
    weapon.sub_type = WPN_GREAT_SWORD;
    you.religion = GOD_IMUS_THEA;
    CHECK(imus_weapon_accuracy_penalty(&weapon) == 2);
    weapon.sub_type = WPN_DAGGER;
    CHECK(imus_weapon_accuracy_penalty(&weapon) == 0);
    you.religion = GOD_NO_GOD;
    weapon.sub_type = WPN_GREAT_SWORD;
    CHECK(imus_weapon_accuracy_penalty(&weapon) == 0);
}

#ifdef USE_TILE
TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Imus invocation icons cover every training state", "[imus][imus-core]")
{
    you.religion = GOD_IMUS_THEA;
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_ENABLED) == TILEG_INVOCATIONS_IMUS_ON);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_FOCUSED) == TILEG_INVOCATIONS_IMUS_FOCUS);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_DISABLED) == TILEG_INVOCATIONS_IMUS_OFF);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_INACTIVE) == TILEG_INVOCATIONS_IMUS_INACTIVE);
    CHECK(tileidx_skill(SK_INVOCATIONS, TRAINING_MASTERED) == TILEG_INVOCATIONS_IMUS_MAX);
}
#endif

TEST_CASE_METHOD(vellum_fixture, "Imus reflects an incoming projectile at impact", "[imus][imus-core]")
{
    you.religion = GOD_IMUS_THEA;
    you.penance[GOD_IMUS_THEA] = 0;
    bolt beam;
    beam.source = you.pos() + coord_def(2, 0);
    beam.target = you.pos();
    beam.thrower = KILL_NON_ACTOR;
    beam.flavour = BEAM_MMISSILE;
    beam.real_flavour = BEAM_MMISSILE;
    beam.damage = dice_def(1, 1);
    beam.hit = 10;
    env.grid(beam.source) = DNGN_FLOOR;
    env.grid(you.pos() + coord_def(1, 0)) = DNGN_FLOOR;
    fallback_ray(beam.source, beam.target, beam.ray);
    for (int i = 0; i < 4 && beam.ray.pos() != you.pos(); ++i)
        REQUIRE(beam.ray.advance());
    REQUIRE(beam.ray.pos() == you.pos());
    const int hp = you.hp;
    beam.affect_actor(&you);
    CHECK(beam.reflections == 1);
    CHECK(beam.reflector == you.mid);
    CHECK(you.hp == hp);
}

TEST_CASE_METHOD(vellum_fixture, "Imus projectile passives follow piety and the equipped weapon", "[imus][imus-core]")
{
    you.religion = GOD_IMUS_THEA;
    you.penance[GOD_IMUS_THEA] = 0;
    you.equipment.items.clear();
    item_def& weapon = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    wear(0, SLOT_WEAPON);
    item_def missile;
    missile.base_type = OBJ_MISSILES;
    missile.sub_type = MI_BOOMERANG;
    missile.quantity = 2;
    you.raw_piety = piety_breakpoint(0) - 1;
    CHECK_FALSE(is_imus_illusory_weapon(&you, weapon));
    CHECK_FALSE(is_throwable(&you, weapon));
    you.raw_piety = piety_breakpoint(0);
    CHECK(is_imus_illusory_weapon(&you, weapon));
    CHECK(is_throwable(&you, weapon));
    ranged_attack projected(&you, nullptr, &weapon);
    CHECK(projected.is_illusory_projection());
    CHECK(projected.projectile_name().find("illusory") != string::npos);
    CHECK(imus_ammo_replication_denominator(missile) == 0);
    you.raw_piety = piety_breakpoint(1);
    CHECK(imus_ammo_replication_denominator(missile) == 400 / you.piety());
    CHECK(imus_ammo_replication_denominator(weapon) == 0);
    you.penance[GOD_IMUS_THEA] = 1;
    CHECK_FALSE(is_imus_illusory_weapon(&you, weapon));
    CHECK(imus_ammo_replication_denominator(missile) == 0);
}

TEST_CASE_METHOD(vellum_fixture, "Imus weapon projection is a usable quiver action only for its owner", "[imus][imus-core]")
{
    you.religion = GOD_IMUS_THEA;
    you.raw_piety = piety_breakpoint(0);
    you.penance[GOD_IMUS_THEA] = 0;
    you.equipment.items.clear();
    item_def& held = carry(0, OBJ_WEAPONS, WPN_DAGGER, false);
    item_def& spare = carry(1, OBJ_WEAPONS, WPN_LONG_SWORD, false);
    wear(0, SLOT_WEAPON);
    REQUIRE(you.weapon() == &held);
    auto action = quiver::slot_to_action(0);
    REQUIRE(action);
    CHECK(action->is_valid());
    CHECK(action->uses_mp());
    CHECK(item_is_selected(held, OSEL_QUIVER_ACTION));
    auto unheld = quiver::slot_to_action(spare.link);
    REQUIRE(unheld);
    CHECK_FALSE(unheld->is_valid());
    CHECK_FALSE(item_is_selected(spare, OSEL_QUIVER_ACTION));
    you.penance[GOD_IMUS_THEA] = 1;
    CHECK_FALSE(action->is_valid());
    CHECK_FALSE(quiver::slot_to_action(0)->is_valid());
    CHECK_FALSE(item_is_selected(held, OSEL_QUIVER_ACTION));
    you.penance[GOD_IMUS_THEA] = 0;
    you.religion = GOD_NO_GOD;
    CHECK_FALSE(action->is_valid());
    CHECK_FALSE(quiver::slot_to_action(0)->is_valid());
}

TEST_CASE_METHOD(vellum_fixture, "Imus rebound belongs to its caster rather than the active hero", "[imus][imus-core]")
{
    party::set_player_count(2);
    party::set_multiplayer(true);
    player& other = party::get_player(1);
    other = you;
    other.save = nullptr;
    other.mid = party::mid_for_slot(1);
    other.religion = GOD_IMUS_THEA;
    other.raw_piety = piety_breakpoint(1);
    other.penance[GOD_IMUS_THEA] = 0;
    you.religion = GOD_NO_GOD;
    bolt projectile;
    projectile.source_id = other.mid;
    projectile.thrower = KILL_YOU_MISSILE;
    projectile.flavour = BEAM_MMISSILE;
    projectile.source = you.pos();
    projectile.target = you.pos() + coord_def(2, 0);
    projectile.range = 6;
    env.grid(you.pos() + coord_def(1, 0)) = DNGN_FLOOR;
    env.grid(you.pos() - coord_def(1, 0)) = DNGN_FLOOR;
    env.grid(you.pos() - coord_def(2, 0)) = DNGN_FLOOR;
    env.grid(projectile.target) = DNGN_ROCK_WALL;
    env.map_knowledge(projectile.target).set_feature(DNGN_ROCK_WALL);
    targeting_tracer tracer;
    projectile.fire(tracer);
    CHECK(std::find(projectile.path_taken.begin(), projectile.path_taken.end(),
                    you.pos() - coord_def(1, 0)) != projectile.path_taken.end());
    CHECK(party::active_slot() == 0);
    other.penance[GOD_IMUS_THEA] = 1;
    bolt suppressed;
    suppressed.source_id = other.mid;
    suppressed.thrower = KILL_YOU_MISSILE;
    suppressed.flavour = BEAM_MMISSILE;
    suppressed.source = you.pos();
    suppressed.target = projectile.target;
    suppressed.range = 6;
    targeting_tracer suppressed_tracer;
    suppressed.fire(suppressed_tracer);
    CHECK(std::find(suppressed.path_taken.begin(), suppressed.path_taken.end(),
                    you.pos() - coord_def(1, 0)) == suppressed.path_taken.end());
    // The rebound tracer temporarily enters slot 1 and shares the live save
    // pointer with it. Slot 0 remains the sole owner of that handle.
    other.save = nullptr;
    party::set_multiplayer(false);
    party::set_player_count(1);
}
