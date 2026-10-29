#include "test_vellum_fixture.h"
#include "god-abil.h"
#include "god-passive.h"
#include "god-pakellas.h"
#include "curse-type.h"
#include "skills.h"
#include "random-var.h"
#include "store.h"
#include <iostream>

// Matched native character/loadout probes. These measure specific outcomes;
// they deliberately do not infer campaign win rates or price the whole god
// package as a single stat. Combat/loot ensembles remain a separate phase.
TEST_CASE_METHOD(vellum_fixture, "Matched loadouts expose Vellum and existing god tradeoffs", "[vellum-balance]")
{
    const auto god = GENERATE(GOD_NO_GOD, GOD_VELLUM, GOD_CHEIBRIADOS,
                             GOD_OKAWARU, GOD_ASHENZARI, GOD_PAKELLAS);
    const int level = GENERATE(8, 15, 25);
    CAPTURE(god, level);
    you.experience_level = level;
    const int skill = level / 2;
    for (auto type : {SK_FIGHTING, SK_LONG_BLADES, SK_ARMOUR, SK_DODGING,
                      SK_SPELLCASTING, SK_CONJURATIONS, SK_EVOCATIONS})
        set_skill_level(type, skill, true);
    carry(0, OBJ_WEAPONS, WPN_LONG_SWORD).plus = 4;
    carry(1, OBJ_ARMOUR, ARM_SCALE_MAIL).plus = 3;
    carry(2, OBJ_ARMOUR, ARM_CLOAK).plus = 1;
    carry(3, OBJ_ARMOUR, ARM_HELMET).plus = 1;
    carry(4, OBJ_JEWELLERY, RING_PROTECTION_FROM_COLD);
    wear(0, SLOT_WEAPON);
    wear(1, SLOT_BODY_ARMOUR);
    wear(2, SLOT_CLOAK);
    wear(3, SLOT_HELMET);
    wear(4, SLOT_RING);
    you.religion = GOD_NO_GOD;
    const int base_str = you.strength(), base_int = you.intel(), base_dex = you.dex();
    const double base_delay = you.attack_delay().expected();
    you.religion = god;
    you.raw_piety = level == 8 ? 50 : level == 15 ? 120 : 200;
    you.piety_max[GOD_VELLUM] = you.raw_piety;
    if (god == GOD_VELLUM)
    {
        carry(10);
        finish(transfer(10, 2, ARTP_STRENGTH, 4)); // Two capacity.
        carry(11);
        finish(transfer(11, 3, ARTP_FIRE, 1));     // One capacity.
        if (level >= 15)
        {
            carry(12);
            finish(transfer(12, 4, ARTP_POISON, 1)); // Two capacity.
            carry(13);
            finish(transfer(13, 1, ARTP_SEE_INVISIBLE, 1)); // One capacity.
        }
        CHECK(you.strength() == base_str + 4);
        CHECK(you.res_fire() == 1);
        CHECK(enchantment_transfer::used(vellum::load(you)) <= vellum::capacity(you));
    }
    else if (god == GOD_CHEIBRIADOS)
    {
        CHECK(you.strength() == base_str + chei_stat_boost());
        CHECK(you.intel() == base_int + chei_stat_boost());
        CHECK(you.dex() == base_dex + chei_stat_boost());
    }
    else if (god == GOD_OKAWARU)
    {
        you.duration[DUR_HEROISM] = 50;
        you.duration[DUR_FINESSE] = 50;
        CHECK(you.skill(SK_LONG_BLADES) >= skill + 5);
        CHECK(you.attack_delay().expected() < base_delay);
    }
    else if (god == GOD_ASHENZARI)
    {
        // Five actually equipped curses, each with the same two native offers.
        for (int slot = 0; slot < 5; ++slot)
        {
            auto& item = you.inv[slot];
            item.flags |= ISFLAG_CURSED;
            auto& curses = item.props[CURSE_KNOWLEDGE_KEY].new_vector(SV_INT);
            curses.push_back(CrawlStoreValue(static_cast<int>(CURSE_MELEE)));
            curses.push_back(CrawlStoreValue(static_cast<int>(CURSE_ARMOUR)));
        }
        ash_check_bondage();
        CHECK(you.skill(SK_LONG_BLADES, 10) > skill * 10);
    }
    else if (god == GOD_PAKELLAS)
    {
        auto& wand = carry(10, OBJ_WANDS, WAND_FLAME, false);
        wand.charges = 6;
        REQUIRE(pakellas::designate(wand));
        CHECK(pakellas::ready(wand) > 0);
    }
    std::cout << "VELLUM_COMPARISON,{\"god\":\"" << god_name(god)
              << "\",\"xl\":" << level << ",\"str\":" << you.strength()
              << ",\"int\":" << you.intel() << ",\"dex\":" << you.dex()
              << ",\"rF\":" << you.res_fire() << ",\"rC\":" << you.res_cold()
              << ",\"weapon_skill_tenths\":" << you.skill(SK_LONG_BLADES, 10)
              << ",\"attack_delay\":" << you.attack_delay().expected()
              << ",\"piety\":" << you.piety() << "}\n";
}
