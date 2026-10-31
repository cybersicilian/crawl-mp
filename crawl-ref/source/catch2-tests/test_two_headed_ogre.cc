#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "dungeon.h"
#include "env.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "mon-util.h"
#include "mutation.h"
#include "player.h"
#include "player-equip.h"
#include "skills.h"
#include "species.h"
#include "status.h"
#include "test_player_fixture.h"
#include "test_vellum_fixture.h"
#include "transform.h"

namespace
{
void setup_two_headed_ogre()
{
    you.species = SP_TWO_HEADED_OGRE;
    you.experience_level = 1;
    for (int mut = 0; mut < NUM_MUTATIONS; ++mut)
        you.mutation[mut] = you.innate_mutation[mut] = 0;
    give_basic_mutations(you.species);
    you.equipment.update();
}

item_def& inventory_item(int index, const char* name)
{
    item_def& item = you.inv[index];
    REQUIRE(get_item_by_exact_name(item, name));
    item.link = index;
    item.pos = ITEM_IN_INVENTORY;
    return item;
}

struct ogre_combat_fixture : vellum_fixture
{
    int old_max = env.max_mon_index;
    ogre_combat_fixture()
    {
        static const bool ready = []() { init_duration_index(); return true; }();
        (void)ready;
        init_monsters();
        dgn_reset_level(false);
        for (int x = 25; x <= 55; ++x)
            for (int y = 20; y <= 50; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        setup_two_headed_ogre();
        you.religion = GOD_NO_GOD;
        you.raw_piety = 0;
        you.on_current_level = true;
        you.current_vision = you.normal_vision = 7;
        you.form = you.default_form = transformation::none;
        invalidate_los();
    }
    ~ogre_combat_fixture()
    {
        dgn_reset_level(false);
        env.max_mon_index = old_max;
        invalidate_los();
    }
};
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Two-headed ogres have two weapon hands and two amulet slots",
                 "[two-headed-ogre]")
{
    setup_two_headed_ogre();
    CHECK(species::is_starting_species(you.species));
    CHECK(string(species::get_abbrev(you.species)) == "Th");
    CHECK(you.body_size(PSIZE_TORSO) == SIZE_LARGE);
    CHECK(you.has_innate_mutation(MUT_WIELD_OFFHAND));
    CHECK(get_player_equip_slot_count(SLOT_WEAPON) == 1);
    CHECK(get_player_equip_slot_count(SLOT_WEAPON_OR_OFFHAND) == 1);
    CHECK(get_player_equip_slot_count(SLOT_OFFHAND) == 0);
    CHECK(get_player_equip_slot_count(SLOT_AMULET) == 2);
    CHECK(is_useless_skill(SK_SHIELDS));

    item_def& shield = inventory_item(0, "buckler");
    string reason;
    CHECK_FALSE(can_equip_item(shield, true, &reason));
    CHECK(reason.find("shield") != string::npos);

    item_def& first = inventory_item(1, "mace");
    item_def& second = inventory_item(2, "hand axe");
    REQUIRE(can_equip_item(first, true));
    REQUIRE(can_equip_item(second, true));
    you.equipment.add(first, SLOT_WEAPON);
    you.equipment.add(second, SLOT_WEAPON_OR_OFFHAND);
    you.equipment.update();
    CHECK(you.weapon() == &first);
    CHECK(you.offhand_weapon() == &second);
}

TEST_CASE_METHOD(MockPlayerYouTestsFixture,
                 "Two-headed ogre amulets use the normal equipment system",
                 "[two-headed-ogre]")
{
    setup_two_headed_ogre();
    item_def& first = inventory_item(0, "amulet of faith");
    item_def& second = inventory_item(1, "amulet of reflection");
    REQUIRE(can_equip_item(first, true));
    REQUIRE(can_equip_item(second, true));
    you.equipment.add(first, SLOT_AMULET);
    you.equipment.add(second, SLOT_AMULET);
    you.equipment.update();
    const auto amulets = you.equipment.get_slot_items(SLOT_AMULET);
    CHECK(amulets.size() == 2);
    CHECK(amulets[0] != amulets[1]);
    CHECK(you.wearing_jewellery(AMU_FAITH));
    CHECK(you.wearing_jewellery(AMU_REFLECTION));

    you.species = SP_HUMAN;
    CHECK(get_player_equip_slot_count(SLOT_AMULET) == 1);
}

TEST_CASE_METHOD(ogre_combat_fixture,
                 "Two-headed ogres attack with both equipped weapons",
                 "[two-headed-ogre]")
{
    item_def& first = inventory_item(0, "mace");
    item_def& second = inventory_item(1, "hand axe");
    you.equipment.add(first, SLOT_WEAPON);
    you.equipment.add(second, SLOT_WEAPON_OR_OFFHAND);
    you.equipment.update();

    monster& target = env.mons[0];
    target.reset();
    target.type = MONS_RAT;
    target.mid = 30001;
    target.hit_points = target.max_hit_points = 1000;
    target.set_hit_dice(1);
    target.base_attitude = ATT_HOSTILE;
    target.behaviour = BEH_SEEK;
    target.foe = MHITYOU;
    target.set_position(you.pos() + coord_def(1, 0));
    env.mgrid(target.pos()) = 0;
    env.mid_cache[target.mid] = 0;
    env.max_mon_index = max(env.max_mon_index, 0);

    melee_attack attack(&you, &target);
    attack.launch_attack_set(true);
    CHECK(attack.attack_number == 1);
    CHECK(attack.effective_attack_number == 1);
}
