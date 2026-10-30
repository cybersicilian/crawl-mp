#include "test_oozle_memory_fixture.h"
TEST_CASE_METHOD(memory_fixture, "Unequippable inventory armour can supply an intrinsic memory",
                 "[oozle-memory][oozle]")
{
    auto& plate = carry(0, "plate armour");
    REQUIRE_FALSE(can_equip_item(plate, true));
    CHECK(oozle::eligibility(plate).empty());
    const auto source = equipment_memory::intrinsic_profile(plate);
    CHECK(source.group == equipment_memory::family::armour);
    const auto choices = equipment_memory::candidates(source, equipment_memory::limits());
    REQUIRE_FALSE(choices.empty());
    CHECK(choices.front().type == ARTP_AC);
    CHECK(choices.front().value == property(plate, PARM_AC));
}
TEST_CASE_METHOD(memory_fixture, "Corrosion preserves progress through unequipping and consumes at the threshold",
                 "[oozle-memory][oozle]")
{
    carry(0, "ring of protection from fire");
    wear(0, SLOT_RING);
    oozle::digest_equipment(10);
    REQUIRE(you.inv[0].defined());
    CHECK(you.inv[0].props[oozle::corrosion_key].get_int() == 10);
    you.equipment.items.clear();
    oozle::digest_equipment(100);
    CHECK(you.inv[0].props[oozle::corrosion_key].get_int() == 10);
    CHECK(oozle::memories().stored.empty());
    wear(0, SLOT_RING);
    oozle::digest_equipment(oozle::digestion_aut - 10);
    CHECK_FALSE(you.inv[0].defined());
    const auto memory = oozle::memories();
    REQUIRE(memory.stored.size() == 1);
    CHECK(memory.stored.at(0).effects.front().type == ARTP_FIRE);
    CHECK(oozle::source_name(0).find("fire") != string::npos);
}
TEST_CASE_METHOD(memory_fixture, "Ring memories strengthen the ooze regardless of its equipment",
                 "[oozle-memory][oozle]")
{
    digest_fire_ring();
    REQUIRE(oozle::memories().stored.size() == 1);
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1);
    CHECK(you.res_fire() == 0); // Cancels the innate fire weakness without a ring.
    auto& ring = carry(1, "ring of strength");
    ring.plus = 4;
    wear(1, SLOT_RING);
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1);
    CHECK(you.res_fire() == 0); // Cancels the innate fire weakness.
    CHECK_FALSE(is_artefact(ring));
    CHECK(ring.plus == 4);
    carry(2, "ring of dexterity");
    wear(2, SLOT_RING);
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1); // Two rings do not copy the benefit.
    vector<const item_def*> matches;
    CHECK(you.scan_artefacts(ARTP_FIRE, &matches) == 1);
    CHECK(matches.empty()); // No physical item owns the memory.
    you.equipment.items.clear();
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1);
    REQUIRE(oozle::memories().stored.size() == 1);
    wear(1, SLOT_RING);
    you.equipment.items.front().melded = true;
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1);
    you.equipment.items.front().melded = false;
    you.form = transformation::bat;
    CHECK(you.scan_artefacts(ARTP_FIRE) == 1);
    you.species = SP_HUMAN;
    CHECK(you.scan_artefacts(ARTP_FIRE) == 0);
}
TEST_CASE_METHOD(memory_fixture, "Full memories pause passive digestion and weapon wear",
                 "[oozle-memory][oozle][memory-capacity]")
{
    digest_fire_ring();
    const auto original = oozle::memories().stored.at(0);
    auto& axe = carry(1, "broad axe");
    wear(1, SLOT_WEAPON);
    auto& ring = carry(2, "ring of protection from cold");
    wear(2, SLOT_RING);
    const int progress = GENERATE(0, oozle::digestion_aut / 2, oozle::digestion_aut);
    axe.props[oozle::corrosion_key] = progress;
    ring.props[oozle::corrosion_key] = progress;
    const int damage = oozle::weapon_damage_percent(axe);

    oozle::note_weapon_use(&axe);
    oozle::digest_equipment(oozle::digestion_aut);
    oozle::digest_equipment(oozle::digestion_aut);

    REQUIRE(axe.defined());
    REQUIRE(ring.defined());
    CHECK(axe.quantity == 1);
    CHECK(ring.quantity == 1);
    CHECK(item_is_equipped(axe));
    CHECK(item_is_equipped(ring));
    CHECK(axe.props[oozle::corrosion_key].get_int() == progress);
    CHECK(ring.props[oozle::corrosion_key].get_int() == progress);
    CHECK(oozle::weapon_damage_percent(axe) == damage);
    REQUIRE(oozle::memories().stored.size() == 1);
    CHECK(oozle::memories().stored.at(0).id == original.id);
    CHECK(oozle::memories().stored.at(0).source == original.source);
    CHECK(oozle::source_name(0).find("fire") != string::npos);
}
TEST_CASE_METHOD(memory_fixture, "Passive digestion stops as soon as the last memory fills",
                 "[oozle-memory][oozle][memory-capacity]")
{
    auto& fire = carry(0, "ring of protection from fire");
    wear(0, SLOT_RING);
    auto& cold = carry(1, "ring of protection from cold");
    wear(1, SLOT_RING);
    cold.props[oozle::corrosion_key] = oozle::digestion_aut - 10;
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK_FALSE(fire.defined());
    REQUIRE(cold.defined());
    CHECK(item_is_equipped(cold));
    CHECK(cold.props[oozle::corrosion_key].get_int() == oozle::digestion_aut - 10);
    REQUIRE(oozle::memories().stored.size() == 1);
    CHECK(oozle::source_name(0).find("fire") != string::npos);

    // A newly unlocked slot resumes saved exposure instead of resetting it.
    you.experience_level = 3;
    oozle::digest_equipment(10);
    CHECK_FALSE(cold.defined());
    REQUIRE(oozle::memories().stored.size() == 2);
    CHECK(oozle::source_name(0).find("fire") != string::npos);
    CHECK(oozle::source_name(1).find("cold") != string::npos);
}
TEST_CASE_METHOD(memory_fixture, "Full memories preserve previously unexposed equipment",
                 "[oozle-memory][oozle][memory-capacity]")
{
    digest_fire_ring();
    auto& weapon = carry(1, "dagger");
    wear(1, SLOT_WEAPON);
    oozle::note_weapon_use(&weapon);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE(weapon.defined());
    CHECK_FALSE(weapon.props.exists(oozle::corrosion_key));
    CHECK(oozle::weapon_damage_percent(weapon) == 100);
    you.experience_level = 3;
    oozle::note_weapon_use(&weapon);
    CHECK(weapon.props[oozle::corrosion_key].get_int() == 2 * BASELINE_DELAY);
}
TEST_CASE_METHOD(memory_fixture, "Extraction excludes inherited properties and inspection preserves RNG",
                 "[oozle-memory][oozle]")
{
    digest_fire_ring();
    auto& ring = carry(1, "ring of strength");
    ring.plus = 4;
    wear(1, SLOT_RING);
    const auto source = equipment_memory::intrinsic_profile(ring);
    for (const auto& effect : source.properties) CHECK(effect.type != ARTP_FIRE);
    rng::generator gameplay(rng::GAMEPLAY);
    const auto before = rng::peek_uint64();
    JsonWrapper first(equipment_profile_json());
    JsonWrapper second(equipment_profile_json());
    CHECK(first.to_string() == second.to_string());
    CHECK(rng::peek_uint64() == before);
    CHECK(first.to_string().find("transient_properties") != string::npos);
    CHECK(first.to_string().find("rF+") != string::npos);
    JsonWrapper item(oozle::item_memory_json(ring));
    CHECK(item.to_string().find("rF+") == string::npos);
    CHECK(oozle::item_memory_description(ring).empty());
}

TEST_CASE_METHOD(memory_fixture, "Armour memory protects the body without clothing and improves as skill rises",
                 "[oozle-memory][oozle]")
{
    auto& hat = carry(0, "hat");
    hat.plus = 2;
    wear(0, SLOT_HELMET);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE_FALSE(you.inv[0].defined());
    REQUIRE(oozle::memories().stored.size() == 1);
    CHECK(oozle::passive_bonus(ARTP_AC) == 1);
    set_skill_level(SK_SHAPESHIFTING,27,true);
    CHECK(oozle::passive_bonus(ARTP_AC) == 2);
    carry(1,"hat"); wear(1,SLOT_HELMET);
    carry(2,"scarf"); wear(2,SLOT_CLOAK);
    CHECK(oozle::passive_bonus(ARTP_AC) == 2); // One body, not two copies from clothing.
    CHECK(oozle::memories().stored.at(0).effects.front().value == 2);
}
TEST_CASE_METHOD(memory_fixture, "An absorbed axe retains its full bundle and teaches natural unarmed cleaving",
                 "[oozle-memory][oozle]")
{
    auto& axe = carry(0,"broad axe");
    axe.plus = 3;
    axe.brand = SPWPN_FLAMING;
    wear(0,SLOT_WEAPON);
    oozle::digest_equipment(oozle::digestion_aut);
    const auto memory = oozle::memories();
    REQUIRE(memory.stored.size() == 1);
    CHECK(memory.stored.at(0).effects.size() >= 4);
    CHECK(oozle::inherited_cleaving(nullptr));
    CHECK(attack_cleaves(you,nullptr));
    CHECK(you.damage_type(nullptr) == DVORP_CHOPPING);
    CHECK(oozle::unarmed_property(ARTP_BASE_DAM) > 0);
    CHECK(oozle::unarmed_property(ARTP_BRAND) == SPWPN_FLAMING);
    CHECK(you.damage_brand(nullptr) == SPWPN_FLAMING); // Acid is applied separately alongside the inherited brand.
    const int slaying = you.scan_artefacts(ARTP_SLAYING);
    REQUIRE(slaying > 0);
    auto& sword = carry(1, "long sword");
    wear(1, SLOT_WEAPON);
    CHECK(you.scan_artefacts(ARTP_SLAYING) == slaying);
    CHECK(you.damage_brand(&sword) == SPWPN_FLAMING);
    CHECK(oozle::inherited_cleaving(&sword));
    sword.brand = SPWPN_FREEZING;
    CHECK(you.damage_brand(&sword) == SPWPN_FREEZING);
    CHECK_FALSE(is_artefact(sword));
    you.form = transformation::bat;
    CHECK_FALSE(oozle::inherited_cleaving(nullptr));
}
TEST_CASE_METHOD(memory_fixture, "Shield and amulet memories grant body shielding without either item",
                 "[oozle-memory][oozle]")
{
    you.experience_level = 3;
    set_skill_level(SK_SHAPESHIFTING, 27, true);
    const int original_sh = player_shield_class();
    auto& shield = carry(0, "buckler");
    shield.plus = 6;
    const int expected = property(shield, PARM_AC) + shield.plus;
    wear(0, SLOT_OFFHAND);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE(you.shield() == nullptr);
    CHECK(you.scan_artefacts(ARTP_SHIELDING) == expected);
    CHECK(player_shield_class() > original_sh);
    carry(1, "amulet of reflection");
    wear(1, SLOT_AMULET);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE(oozle::memories().stored.size() == 2);
    CHECK(you.equipment.items.empty());
    CHECK(you.scan_artefacts(ARTP_SHIELDING) == max(expected, 5));
}
TEST_CASE_METHOD(memory_fixture, "Duplicate body effects use the strongest memory across source families",
                 "[oozle-memory][oozle]")
{
    you.experience_level = 3;
    set_skill_level(SK_SHAPESHIFTING, 27, true);
    carry(0, "hat").plus = 4;
    wear(0, SLOT_HELMET);
    oozle::digest_equipment(oozle::digestion_aut);
    carry(1, "ring of protection").plus = 3;
    wear(1, SLOT_RING);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE(oozle::memories().stored.size() == 2);
    CHECK(you.scan_artefacts(ARTP_AC) == 4);
    CHECK(oozle::body_property(ARTP_AC) == 4);
    CHECK(oozle::memories().stored.at(1).effects.front().value == 3);
    you.experience_level = 1;
    CHECK(you.scan_artefacts(ARTP_AC) == 4);
}
TEST_CASE_METHOD(memory_fixture, "Weapon use accumulates wear without deleting a live attack's weapon",
                 "[oozle-memory][oozle]")
{
    auto& axe = carry(0,"broad axe");
    wear(0,SLOT_WEAPON);
    const int original_damage = property(axe,PWPN_DAMAGE);
    axe.props[oozle::corrosion_key] = oozle::digestion_aut / 2;
    CHECK(oozle::weapon_damage_percent(axe) == 50);
    CHECK(oozle::weapon_corrosion_penalty(axe) == 4);
    CHECK(property(axe,PWPN_DAMAGE) == original_damage);
    axe.props[oozle::corrosion_key] = oozle::digestion_aut - 1;
    oozle::note_weapon_use(&axe);
    CHECK(axe.defined()); // Pointer remains valid through all followup attacks.
    CHECK(axe.props[oozle::corrosion_key].get_int() == oozle::digestion_aut);
    oozle::digest_equipment(1);
    CHECK_FALSE(axe.defined());
    CHECK(you.weapon() == nullptr);
    CHECK(oozle::memories().stored.size() == 1);
}
TEST_CASE_METHOD(memory_fixture, "Absorbed polearm reach follows the ooze through weapon changes",
                 "[oozle-memory][oozle]")
{
    carry(0, "spear");
    wear(0, SLOT_WEAPON);
    oozle::digest_equipment(oozle::digestion_aut);
    REQUIRE_FALSE(you.inv[0].defined());
    CHECK(oozle::inherited_reach() == 2);
    CHECK(you.reach_range() == 2);
    CHECK(you.reach_range(false) == 2);
    melee_attack unarmed(&you, nullptr);
    CHECK(unarmed.attk_reach == 2);
    auto& dagger = carry(1, "dagger");
    wear(1, SLOT_WEAPON);
    CHECK(weapon_reach(dagger) == 1); // The physical item has not changed.
    CHECK(you.reach_range() == 2);
    melee_attack armed(&you, nullptr);
    CHECK(armed.attk_reach == 2);
    you.equipment.items.clear();
    you.form = transformation::bat;
    CHECK(you.reach_range() == 1);
    you.form = transformation::none;
    CHECK(you.reach_range() == 2);
    you.species = SP_HUMAN;
    CHECK(you.reach_range() == 1);
}
TEST_CASE_METHOD(memory_fixture, "Oozle absorption makes Shapeshifting visible without talismans or spells",
                 "[oozle-memory][oozle]")
{
    CHECK(you.skill(SK_SHAPESHIFTING) == 0);
    CHECK(default_shown_skills().count(SK_SHAPESHIFTING) == 1);
    CHECK(can_enable_skill(SK_SHAPESHIFTING));
    CHECK(species_apt(SK_SHAPESHIFTING) == 2);
    CHECK(abil_skill(ABIL_ASSIMILATE) == SK_SHAPESHIFTING);
    CHECK(abil_skill_weight(ABIL_ASSIMILATE) == 1);
    you.mutation[MUT_NO_FORMS] = 1;
    CHECK_FALSE(is_useless_skill(SK_SHAPESHIFTING));
    CHECK(can_enable_skill(SK_SHAPESHIFTING));
    you.species = SP_HUMAN;
    CHECK(default_shown_skills().count(SK_SHAPESHIFTING) == 0);
}
TEST_CASE_METHOD(memory_fixture, "Every current jewellery type has an extractable body effect",
                 "[oozle-memory][oozle]")
{
    for (int subtype = RING_FIRST_RING; subtype < NUM_JEWELLERY; ++subtype)
    {
        if (subtype >= NUM_RINGS && subtype < AMU_FIRST_AMULET) continue;
        if (item_type_removed(OBJ_JEWELLERY, subtype)) continue;
        CAPTURE(subtype);
        item_def jewel;
        jewel.base_type = OBJ_JEWELLERY;
        jewel.sub_type = subtype;
        jewel.quantity = 1;
        jewel.plus = 6;
        CHECK_FALSE(equipment_memory::candidates(equipment_memory::intrinsic_profile(jewel),
                                                oozle::current_policy()).empty());
    }
}
TEST_CASE_METHOD(memory_fixture, "Absorbed Acrobat and Faith work without an amulet and stay with their owner",
                 "[oozle-memory][oozle]")
{
    you.experience_level = 3;
    carry(0, "amulet of the acrobat");
    wear(0, SLOT_AMULET);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.equipment.items.empty());
    CHECK(player_acrobatic());
    CHECK(you.scan_artefacts(ARTP_ACROBAT) == 1);
    carry(1, "amulet of faith");
    wear(1, SLOT_AMULET);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.equipment.items.empty());
    CHECK(you.wearing_jewellery(AMU_FAITH) == 1);
    CHECK(you.faith() == 1);
    player peer;
    peer.species = SP_OOZLE;
    CHECK(peer.wearing_jewellery(AMU_FAITH) == 0);
    CHECK(peer.scan_artefacts(ARTP_ACROBAT) == 0);
    CHECK(oozle::memories().stored.size() == 2);
}
TEST_CASE_METHOD(memory_fixture, "Absorbed Reflection preserves reflection and applies its shielding once",
                 "[oozle-memory][oozle]")
{
    set_skill_level(SK_SHAPESHIFTING, 27, true);
    carry(0, "amulet of reflection");
    wear(0, SLOT_AMULET);
    const int worn_sh = player_shield_class(1, false);
    oozle::digest_equipment(oozle::digestion_aut);
    CHECK(you.reflection());
    CHECK(you.equipment.items.empty());
    CHECK(player_shield_class(1, false) == worn_sh);
}
