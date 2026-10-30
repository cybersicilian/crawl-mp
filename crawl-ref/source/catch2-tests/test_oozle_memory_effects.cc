#include "test_oozle_memory_fixture.h"
#include "art-enum.h"
#include "oozle-memory-effects.h"
#include "monster.h"
#include "mon-util.h"
#include "beam.h"
#include "tags.h"

namespace
{
void dissolve_unique(int id, int inventory_slot = 0, equipment_slot slot = SLOT_WEAPON)
{
    auto& item = you.inv[inventory_slot];
    item.quantity = 1;
    REQUIRE(make_item_unrandart(item, id));
    item.link = inventory_slot;
    item.slot = 'a' + inventory_slot;
    item.pos = ITEM_IN_INVENTORY;
    you.equipment.items.emplace_back(inventory_slot, slot, false, false, false);
    you.equipment.update();
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE_FALSE(you.inv[inventory_slot].defined());
}
}
TEST_CASE_METHOD(memory_fixture, "Unique absorption retains native abilities without a carrier",
                 "[oozle-memory][oozle][native-effects]")
{
    dissolve_unique(UNRAND_OLGREB);
    REQUIRE(you.equipment.items.empty());
    CHECK(you.unrand_equipped(UNRAND_OLGREB));
    CHECK(player_has_ability(ABIL_EVOKE_OLGREB));
    REQUIRE(oozle::effect_sources().size() == 1);
    const auto* source = oozle::effect_sources().front();
    CHECK(source->link == NON_ITEM);
    CHECK(source->pos != ITEM_IN_INVENTORY);
    CHECK_FALSE(item_is_equipped(*source));
    player peer;
    peer.species = SP_OOZLE;
    CHECK_FALSE(peer.unrand_equipped(UNRAND_OLGREB));
    CHECK(oozle::effect_sources(peer).empty());
    // The saved item copy, not an inventory index, supplies the identity.
    peer.props = you.props;
    CHECK(peer.unrand_equipped(UNRAND_OLGREB));
    CHECK(oozle::effect_sources(peer).front() != source);
    you.props.erase("oozle_memories_v1");
    CHECK_FALSE(you.unrand_equipped(UNRAND_OLGREB));
    CHECK(peer.unrand_equipped(UNRAND_OLGREB));
}
TEST_CASE_METHOD(memory_fixture, "Absorbed scripts mutate and retain their own item state",
                 "[oozle-memory][oozle][native-effects]")
{
    dissolve_unique(UNRAND_THERMIC_ENGINE);
    auto* source = oozle::unrand_source(UNRAND_THERMIC_ENGINE);
    REQUIRE(source);
    CHECK(source->plus == 2);
    monster dead_target;
    dead_target.type = MONS_RAT;
    dead_target.hit_points = 0;
    oozle::melee_effects(&you, &dead_target, 0, nullptr);
    CHECK(source->plus == 4);
    CHECK_FALSE(oozle::memories().stored.at(0).effects.empty());
    you.time_taken = BASELINE_DELAY;
    oozle::world_effects();
    CHECK(source->plus == 3);
    // Temporary heat follows the native loader's reset, just like the item.
    you.props["native_load_reference"] = *source;
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    you.props.clear();
    reader input(bytes, TAG_MINOR_VERSION);
    you.props.read(input);
    source = oozle::unrand_source(UNRAND_THERMIC_ENGINE);
    REQUIRE(source);
    CHECK(source->plus == you.props["native_load_reference"].get_item().plus);
    CHECK(source->plus == 2);
}
TEST_CASE_METHOD(memory_fixture, "Absorbed permanent growth survives other memories and reload",
                 "[oozle-memory][oozle][native-effects]")
{
    init_monsters();
    dissolve_unique(UNRAND_WYRMBANE);
    auto* source = oozle::unrand_source(UNRAND_WYRMBANE);
    REQUIRE(source);
    CHECK(source->plus == 8);
    monster dragon;
    dragon.type = MONS_IRON_DRAGON;
    dragon.set_hit_dice(18);
    dragon.hit_points = 0;
    REQUIRE(dragon.is_dragonkind());
    REQUIRE(dragon.dragon_level() == 18);
    oozle::melee_effects(&you, &dragon, 0, nullptr, true);
    CHECK(source->plus == 9);
    you.experience_level = 3;
    carry(1, "ring of protection from fire").rnd = 1;
    wear(1, SLOT_RING);
    oozle::digest_equipment(oozle::digestion_aut);
    source = oozle::unrand_source(UNRAND_WYRMBANE);
    REQUIRE(source);
    CHECK(source->plus == 9);
    vector<unsigned char> bytes;
    writer output(&bytes);
    you.props.write(output);
    you.props.clear();
    reader input(bytes, TAG_MINOR_VERSION);
    you.props.read(input);
    source = oozle::unrand_source(UNRAND_WYRMBANE);
    REQUIRE(source);
    CHECK(source->plus == 9);
}
TEST_CASE_METHOD(memory_fixture, "Full memories preserve unique powers during passive digestion",
                 "[oozle-memory][oozle][native-effects]")
{
    dissolve_unique(UNRAND_OLGREB);
    CHECK(player_has_ability(ABIL_EVOKE_OLGREB));
    carry(0, "ring of protection from fire");
    wear(0, SLOT_RING);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.inv[0].defined());
    CHECK(item_is_equipped(you.inv[0]));
    CHECK(you.unrand_equipped(UNRAND_OLGREB));
    CHECK(player_has_ability(ABIL_EVOKE_OLGREB));
    REQUIRE(oozle::effect_sources().size() == 1);
    CHECK(oozle::effect_sources().front()->unrand_idx == UNRAND_OLGREB);
}
TEST_CASE_METHOD(memory_fixture, "Every native equipment unique retains its special identity",
                 "[oozle-memory][oozle][native-effects]")
{
    for (int id = UNRAND_START + 1; id < UNRAND_LAST; ++id)
    {
        const auto* data = get_unrand_entry(id);
        if (data->flags & UNRAND_FLAG_DELETED) continue;
        item_def item;
        item.quantity = 1;
        REQUIRE(make_item_unrandart(item, id));
        equipment_memory::family family;
        if (!equipment_memory::item_family(item, family)) continue;
        CAPTURE(id, data->name);
        const auto effects = equipment_memory::candidates(equipment_memory::intrinsic_profile(item), oozle::current_policy());
        CHECK(std::any_of(effects.begin(), effects.end(), [&](const equipment_memory::property& effect) {
            return effect.query.kind == equipment_memory::native_kind::unique && effect.query.subtype == id;
        }));
    }
}
TEST_CASE_METHOD(memory_fixture, "Native source techniques remain usable by the body",
                 "[oozle-memory][oozle][native-effects]")
{
    carry(0, "quick blade");
    wear(0, SLOT_WEAPON);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(oozle::inherited_strikes(nullptr) == 2);
    auto& dagger = carry(1, "dagger");
    CHECK(oozle::inherited_strikes(&dagger) == 2);
    you.experience_level = 3;
    carry(2, "tower shield");
    wear(2, SLOT_OFFHAND);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.shield_block_limit() == 4);
}

TEST_CASE_METHOD(memory_fixture, "Absorbed projectile scripts apply their native effect",
                 "[oozle-memory][oozle][native-effects]")
{
    dissolve_unique(UNRAND_DAMNATION);
    bolt beam;
    oozle::launch_effects(beam);
    CHECK(beam.name == "damnation bolt");
    REQUIRE(beam.special_explosion);
    CHECK(beam.special_explosion->flavour == BEAM_DAMNATION);
    CHECK(beam.special_explosion->damage.num == 2);
    CHECK(beam.special_explosion->damage.size == 14);
}
TEST_CASE_METHOD(memory_fixture, "Absorbed native brand passives and natural attacks share the body",
                 "[oozle-memory][oozle][native-effects]")
{
    auto& weapon = carry(0, "dagger");
    weapon.brand = SPWPN_ANTIMAGIC;
    wear(0, SLOT_WEAPON);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.damage_brand(nullptr) == SPWPN_ANTIMAGIC);
    CHECK(you.wearing_ego(OBJ_WEAPONS, SPWPN_ANTIMAGIC) == 1);
    auto& replacement = carry(1, "dagger");
    CHECK(oozle::effective_brand(you, &replacement) == SPWPN_ANTIMAGIC);
    replacement.brand = SPWPN_VENOM;
    CHECK(oozle::effective_brand(you, &replacement) == SPWPN_VENOM);
}
TEST_CASE_METHOD(memory_fixture, "A physical duplicate takes one native callback route",
                 "[oozle-memory][oozle][native-effects]")
{
    dissolve_unique(UNRAND_THERMIC_ENGINE);
    auto* remembered = oozle::unrand_source(UNRAND_THERMIC_ENGINE);
    REQUIRE(remembered);
    you.inv[1] = *remembered;
    you.inv[1].link = 1;
    you.inv[1].pos = ITEM_IN_INVENTORY;
    you.inv[1].plus = 8;
    wear(1, SLOT_WEAPON);
    CHECK(oozle::effect_sources().empty());
    you.time_taken = BASELINE_DELAY;
    unrand_reacts();
    CHECK(remembered->plus == 2);
    CHECK(you.inv[1].plus == 7);
}

TEST_CASE_METHOD(memory_fixture, "Body shielding labels use displayed shield units",
                 "[oozle-memory][oozle][native-effects]")
{
    CHECK(equipment_memory::property_name({ARTP_SHIELDING, 5}) == "SH +5");
}

TEST_CASE_METHOD(memory_fixture, "Neutral equipment remains neutral when absorbed",
                 "[oozle-memory][oozle][native-effects]")
{
    auto& ring = carry(0, "ring of strength");
    ring.plus = 0;
    wear(0, SLOT_RING);
    const int strength = you.strength();
    CHECK(oozle::eligibility(carry(1, "hat")).empty());
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE(oozle::memories().stored.size() == 1);
    CHECK(you.strength() == strength);
    CHECK(oozle::native_bonus(you, OBJ_JEWELLERY, RING_STRENGTH) == 0);
    CHECK(you.scan_artefacts(ARTP_STRENGTH) == 0);
}
