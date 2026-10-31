#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include <algorithm>

#include "ability.h"
#include "art-enum.h"
#include "artefact.h"
#include "branch.h"
#include "coord.h"
#include "dungeon.h"
#include "env.h"
#include "fineff.h"
#include "item-prop.h"
#include "items.h"
#include "kimjoy-artifacts.h"
#include "losglobal.h"
#include "melee-attack.h"
#include "mon-ench.h"
#include "mon-util.h"
#include "monster.h"
#include "player.h"
#include "player-equip.h"
#include "prompt.h"
#include "random.h"
#include "test_vellum_fixture.h"
#include "transform.h"

namespace
{
struct kimjoy_artifact_fixture : vellum_fixture
{
    kimjoy_artifact_fixture()
    {
        init_monsters();
        dgn_reset_level(false);
        env.grid(you.pos()) = DNGN_FLOOR;
    }
    ~kimjoy_artifact_fixture()
    {
        if (env.mons[0].alive())
            env.mgrid(env.mons[0].pos()) = NON_MONSTER;
        env.mons[0].reset();
        dgn_reset_level(false);
        invalidate_los();
    }

    // Carve an open room around the player so blinks and beckons have
    // somewhere to go, and make sure line of sight is computed for it.
    void open_floor()
    {
        for (int x = 33; x <= 47; ++x)
            for (int y = 28; y <= 42; ++y)
                env.grid[x][y] = DNGN_FLOOR;
        you.on_current_level = true;
        you.where_are_you = BRANCH_DUNGEON;
        you.depth = 1;
        you.current_vision = you.normal_vision = 7;
        invalidate_los();
    }

    monster& target(coord_def offset = coord_def(2, 0))
    {
        monster& mon = env.mons[0];
        if (mon.alive())
            env.mgrid(mon.pos()) = NON_MONSTER;
        mon.reset();
        mon.type = MONS_RAT;
        mon.mid = 52224;
        mon.hit_points = mon.max_hit_points = 100;
        mon.set_hit_dice(1);
        mon.base_attitude = ATT_HOSTILE;
        mon.behaviour = BEH_SEEK;
        mon.foe = MHITYOU;
        mon.set_position(you.pos() + offset);
        env.mgrid(mon.pos()) = 0;
        env.mid_cache[mon.mid] = 0;
        env.max_mon_index = max(env.max_mon_index, 0);
        return mon;
    }

    void wear(int unrand, int slot)
    {
        item_def& item = you.inv[slot];
        item.clear();
        item.quantity = 1;
        REQUIRE(make_item_unrandart(item, unrand));
        item.link = slot;
        item.pos = ITEM_IN_INVENTORY;
        item.slot = index_to_letter(slot);
        you.equipment.add(item, get_item_slot(item));
        you.equipment.update();
    }
};

// The gauntlets' on-hit hook is a protected attack phase helper. A melee
// attack subclass exposes it so the accounting can be checked directly.
struct distortion_probe : melee_attack
{
    distortion_probe(actor* attacker, actor* defender)
        : melee_attack(attacker, defender)
    {
    }

    bool trigger() { return distortion_gauntlets_affect_defender(); }
};
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Viper's Fang applies owned virulence on a damaging hit", "[kimjoy-artifacts]")
{
    monster& rat = target();
    CHECK_FALSE(vipers_fang_virulence(&you, &rat, 0));
    CHECK_FALSE(rat.has_ench(ENCH_POISON_VULN));
    REQUIRE(vipers_fang_virulence(&you, &rat, 5));
    REQUIRE(rat.has_ench(ENCH_POISON_VULN));
    CHECK(rat.get_ench(ENCH_POISON_VULN).source == you.mid);
    CHECK_FALSE(vipers_fang_virulence(&you, &rat, 5));
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Golem activation requires the wearer's complete set", "[kimjoy-artifacts]")
{
    CHECK_FALSE(golem_armour_complete(you));
    CHECK_FALSE(player_has_ability(ABIL_GOLEM_FORM));
    CHECK_FALSE(activate_golem_armour());
    wear(UNRAND_GOLEM_ARMOUR, 0);
    wear(UNRAND_GOLEM_BOOTS, 1);
    wear(UNRAND_GOLEM_GLOVES, 2);
    CHECK_FALSE(golem_armour_complete(you));
    wear(UNRAND_GOLEM_HELMET, 3);
    REQUIRE(golem_armour_complete(you));
    CHECK(player_has_ability(ABIL_GOLEM_FORM));
    REQUIRE(activate_golem_armour());
    CHECK(you.form == transformation::golem);
    CHECK(golem_armour_complete(you));
    CHECK_FALSE(player_has_ability(ABIL_GOLEM_FORM));
    deactivate_golem_armour();
    CHECK(you.form != transformation::golem);
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Gauntlets of Distortion warp space once per damaging hit", "[kimjoy-artifacts]")
{
    you.religion = GOD_NO_GOD;
    open_floor();
    rng::seed(1234);

    monster& rat = target(coord_def(1, 0));
    {
        // Nothing happens without the gauntlets.
        distortion_probe bare(&you, &rat);
        bare.damage_done = 10;
        bare.damage_brand = SPWPN_NORMAL;
        CHECK_FALSE(bare.trigger());
        CHECK(bare.special_damage == 0);
        CHECK(rat.hit_points == 100);
    }

    wear(UNRAND_GAUNTLETS_DISTORTION, 0);
    REQUIRE(you.unrand_equipped(UNRAND_GAUNTLETS_DISTORTION));
    {
        // A hit that did no damage carries no distortion.
        distortion_probe harmless(&you, &rat);
        harmless.damage_done = 0;
        harmless.damage_brand = SPWPN_NORMAL;
        CHECK_FALSE(harmless.trigger());
        CHECK(harmless.special_damage == 0);
        CHECK(rat.hit_points == 100);

        // A distortion-branded weapon already warped space; the gauntlets
        // never apply it a second time.
        distortion_probe branded(&you, &rat);
        branded.damage_done = 10;
        branded.damage_brand = SPWPN_DISTORTION;
        CHECK_FALSE(branded.trigger());
        CHECK(branded.special_damage == 0);
        CHECK(rat.hit_points == 100);

        // Simulated attacks (fight simulator) never touch the defender.
        distortion_probe simulated(&you, &rat);
        simulated.damage_done = 10;
        simulated.damage_brand = SPWPN_NORMAL;
        simulated.simu = true;
        CHECK_FALSE(simulated.trigger());
        CHECK(rat.hit_points == 100);
    }

    // Real hits roll the distortion table. Brand damage that was already
    // inflicted (7 here) must survive the call, and only the warp damage is
    // applied to the defender.
    bool warped = false;
    for (int attempt = 0; attempt < 100 && !warped; ++attempt)
    {
        monster& victim = target(coord_def(1, 0));
        distortion_probe probe(&you, &victim);
        probe.damage_done = 10;
        probe.damage_brand = SPWPN_NORMAL;
        probe.special_damage = 7;
        const bool banished = probe.trigger();
        REQUIRE(probe.special_damage >= 7);
        if (banished)
        {
            CHECK_FALSE(victim.alive());
            continue;
        }
        REQUIRE(victim.alive());
        const int warp = probe.special_damage - 7;
        CHECK(victim.hit_points == 100 - warp);
        if (warp > 0)
            warped = true;
    }
    REQUIRE(warped);
    // Any scheduled defender blinks resolve against the live rat.
    fire_final_effects();
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Gauntlets of Distortion blink the wearer in proportion to damage taken", "[kimjoy-artifacts]")
{
    you.religion = GOD_NO_GOD;
    open_floor();
    rng::seed(99);
    REQUIRE(you.alive());
    REQUIRE(you.hp_max > 1);
    const coord_def start = you.pos();

    // Without the gauntlets even a maximal hit leaves the player in place.
    distortion_gauntlets_after_damage(you.hp_max);
    CHECK(you.pos() == start);

    wear(UNRAND_GAUNTLETS_DISTORTION, 0);
    REQUIRE(you.unrand_equipped(UNRAND_GAUNTLETS_DISTORTION));

    // Scratch damage never triggers the blink.
    distortion_gauntlets_after_damage(1);
    CHECK(you.pos() == start);

    // Damage equal to max HP passes x_chance_in_y(damage, hp_max) for sure.
    distortion_gauntlets_after_damage(you.hp_max);
    REQUIRE(you.pos() != start);
    CHECK(grid_distance(you.pos(), start) <= LOS_RADIUS);
    CHECK(env.grid(you.pos()) == DNGN_FLOOR);
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Scales of the Unseen Dragon trade invisibility for contamination when struck", "[kimjoy-artifacts]")
{
    you.religion = GOD_NO_GOD;
    rng::seed(7);
    REQUIRE(you.alive());
    you.magic_contamination = 0;
    you.duration[DUR_INVIS] = 0;

    // Without the scales nothing ever happens, however often we are hit.
    for (int hit = 0; hit < 200; ++hit)
        unseen_dragon_after_damage(5);
    CHECK(you.duration[DUR_INVIS] == 0);
    CHECK(you.magic_contamination == 0);

    wear(UNRAND_UNSEEN_DRAGON, 0);
    REQUIRE(you.unrand_equipped(UNRAND_UNSEEN_DRAGON));
    REQUIRE(invis_allowed(true));

    // Harmless hits never trigger the scales.
    for (int hit = 0; hit < 200; ++hit)
        unseen_dragon_after_damage(0);
    CHECK(you.duration[DUR_INVIS] == 0);
    CHECK(you.magic_contamination == 0);

    // The 1-in-4 roll is forced by repeating damaging hits on a seeded RNG.
    int hits = 0;
    for (; hits < 200 && !you.duration[DUR_INVIS]; ++hits)
        unseen_dragon_after_damage(5);
    REQUIRE(you.duration[DUR_INVIS] > 0);
    CHECK(hits < 200);
    CHECK(you.duration[DUR_INVIS] % BASELINE_DELAY == 0);
    const int turns = you.duration[DUR_INVIS] / BASELINE_DELAY;
    CHECK(turns >= 10);
    CHECK(turns <= 14);
    // Fresh invisibility costs duration * 40 + random2(duration * 40) glow.
    CHECK(you.magic_contamination >= turns * 40);
    CHECK(you.magic_contamination < turns * 80);

    // While already invisible the scales only sustain it, at half the
    // duration and half the contamination.
    you.magic_contamination = 0;
    const int before = you.duration[DUR_INVIS];
    for (int hit = 0; hit < 200 && you.duration[DUR_INVIS] == before; ++hit)
        unseen_dragon_after_damage(5);
    REQUIRE(you.duration[DUR_INVIS] > before);
    const int extension = (you.duration[DUR_INVIS] - before) / BASELINE_DELAY;
    CHECK(extension >= 5);
    CHECK(extension <= 7);
    CHECK(you.magic_contamination >= 10 * 20);
    CHECK(you.magic_contamination < 14 * 40);
}

TEST_CASE_METHOD(kimjoy_artifact_fixture, "Erysichthon's Jaw grants a vampiric bite", "[kimjoy-artifacts]")
{
    you.religion = GOD_NO_GOD;
    REQUIRE(you.has_usable_fangs() == 0);

    // A fangless human has no bite to describe or use.
    const vector<string> before = get_player_aux_names();
    CHECK(find(before.begin(), before.end(), "bite") == before.end());
    CHECK(aux_attack_desc(UNAT_BITE).find("Base damage:     1") != string::npos);

    wear(UNRAND_ERYSICHTHONS_JAW, 0);
    REQUIRE(you.unrand_equipped(UNRAND_ERYSICHTHONS_JAW));

    // The Jaw enables the bite and adds +4 to its base damage.
    const vector<string> after = get_player_aux_names();
    CHECK(find(after.begin(), after.end(), "bite") != after.end());
    CHECK(aux_attack_desc(UNAT_BITE).find("Base damage:     5") != string::npos);

    // Biting a living monster draws vitality back to the wounded wearer.
    open_floor();
    monster& rat = target(coord_def(1, 0));
    rat.hit_points = rat.max_hit_points = 1000;
    REQUIRE(actor_can_drain_life_from(you, rat));
    REQUIRE(you.hp_max > 5);
    you.hp = you.hp_max - 5;
    const int wounded = you.hp;
    rng::seed(31);
    bool bit = false;
    for (int attempt = 0; attempt < 200 && you.hp == wounded; ++attempt)
    {
        melee_attack bite(&you, &rat);
        REQUIRE_FALSE(bite.player_do_aux_attack(UNAT_BITE));
        CHECK(bite.aux_attack == "bite");
        if (bite.damage_done > 0)
            bit = true;
    }
    CHECK(bit);
    CHECK(rat.hit_points < rat.max_hit_points);
    REQUIRE(you.hp > wounded);
    CHECK(you.hp <= you.hp_max);
}
