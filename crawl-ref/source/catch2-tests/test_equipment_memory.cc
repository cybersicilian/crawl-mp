#include "catch_amalgamated.hpp"
#include "equipment-memory.h"
using namespace equipment_memory;
namespace
{
base_profile ring(artefact_prop_type type, int value = 1) { return { family::ring, {{type, value}} }; }
void finish(work& task) { while (task.remaining_turns > 0) advance(task, true, true); }
}
TEST_CASE("Memory slots follow the six requested milestones", "[equipment-memory][oozle]")
{
    limits policy;
    for (const auto test : { std::pair<int,int>{0,0}, {1,1}, {2,1}, {3,2}, {6,2}, {7,3},
                            {12,3}, {13,4}, {18,4}, {19,5}, {24,5}, {25,6}, {27,6} })
        CHECK(slot_count(test.first, policy) == test.second);
}
TEST_CASE("One memory retains the complete extracted bundle even at XL one", "[equipment-memory][oozle]")
{
    state memory;
    auto policy = shapeshifting_limits(0);
    const base_profile axe = {family::weapon, {{ARTP_BASE_DAM,12}, {ARTP_SLAYING,4},
        {ARTP_BRAND,SPWPN_FLAMING}, {ARTP_NUM_PROPERTIES,1,weapon_trait::cleaving}}};
    REQUIRE(absorb(memory, axe, 1, 0, 1, policy));
    REQUIRE(memory.stored.size() == 1);
    CHECK(memory.stored.at(0).effects.size() == 4);
    CHECK(memory.stored.at(0).effects.front().value == SPWPN_FLAMING);
    CHECK(project(memory, family::weapon, 1, policy).size() == 4);
}
TEST_CASE("Shapeshifting scales application, preserving original values and property count", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    REQUIRE(absorb(memory, {family::armour,{{ARTP_AC,12},{ARTP_STRENGTH,8},{ARTP_FIRE,1}}}, 1, 0, 1, policy));
    for (const auto stage : { std::pair<int,int>{0,4}, {90,6}, {180,9}, {270,12} })
    {
        auto applied = project(memory, family::armour, 1, shapeshifting_limits(stage.first));
        REQUIRE(applied.size() == 3);
        CHECK(applied.front().effect.type == ARTP_AC);
        CHECK(applied.front().effect.value == stage.second);
        CHECK(memory.stored.at(0).effects.front().value == 12);
        CHECK(memory.stored.at(0).effects.size() == 3);
    }
    CHECK(shapeshifting_limits(-100).retention_percent == 35);
    CHECK(shapeshifting_limits(999).retention_percent == 100);
}
TEST_CASE("Qualitative traits and native resistance ranks remain intact", "[equipment-memory][oozle]")
{
    const auto weak = shapeshifting_limits(0);
    CHECK(applied({ARTP_BRAND,SPWPN_FREEZING}, weak).value == SPWPN_FREEZING);
    CHECK(applied({ARTP_NUM_PROPERTIES,1,weapon_trait::cleaving}, weak).value == 1);
    CHECK(applied({ARTP_NUM_PROPERTIES,2,weapon_trait::reaching}, weak).value == 2);
    CHECK(applied({ARTP_FIRE,1}, weak).value == 1);
    CHECK(applied({ARTP_SEE_INVISIBLE,1}, weak).value == 1);
    CHECK(applied({ARTP_STRENGTH,1}, weak).value == 1);
    CHECK(candidates({family::ring, {{ARTP_NUM_PROPERTIES,1,weapon_trait::cleaving}}}, weak).empty());
}
TEST_CASE("FIFO replacement removes one entire oldest bundle", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    REQUIRE(absorb(memory, {family::ring,{{ARTP_FIRE,1},{ARTP_STRENGTH,6}}},1,0,3,policy));
    REQUIRE(absorb(memory, ring(ARTP_COLD),2,0,3,policy));
    REQUIRE(absorb(memory, ring(ARTP_EVASION,4),3,0,3,policy));
    CHECK(memory.stored.size() == 2);
    CHECK(memory.stored.at(0).source == 3);
    CHECK(memory.stored.at(1).source == 2);
    CHECK(project(memory,family::ring,3,policy).size() == 2);
    CHECK(destination(memory,3,policy) == 1);
    CHECK(destination(memory,7,policy) == 2);
}
TEST_CASE("Active assimilation consumes one item once after five owner actions", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    work task;
    int consumed = 0;
    REQUIRE(begin(memory,task,{family::ring,{{ARTP_FIRE,1},{ARTP_STRENGTH,6}}},77,1,policy));
    auto consume = [&](std::uint64_t source){++consumed;return source == 77;};
    CHECK_FALSE(complete(memory,task,0,1,policy,consume));
    CHECK(advance(task,true,false) == progress::waiting);
    CHECK(task.remaining_turns == 5);
    for(int i=0;i<4;++i) CHECK(advance(task,true,true) == progress::working);
    CHECK(consumed == 0);
    CHECK(memory.stored.empty());
    CHECK(advance(task,true,true) == progress::ready);
    REQUIRE(complete(memory,task,50,1,policy,consume));
    CHECK(consumed == 1);
    CHECK(memory.stored.at(0).effects.size() == 2);
    CHECK_FALSE(complete(memory,task,50,1,policy,consume));
    CHECK(consumed == 1);
}
TEST_CASE("Interrupted invalid or failed work cannot partially replace a bundle", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    work task;
    REQUIRE(absorb(memory,ring(ARTP_AC),1,0,1,policy));
    REQUIRE(begin(memory,task,ring(ARTP_FIRE),2,1,policy));
    CHECK(advance(task,true,true,true) == progress::cancelled);
    CHECK(memory.stored.at(0).source == 1);
    REQUIRE(begin(memory,task,ring(ARTP_FIRE),2,1,policy));
    CHECK(advance(task,false,true) == progress::cancelled);
    REQUIRE(begin(memory,task,ring(ARTP_FIRE),2,1,policy));
    finish(task);
    CHECK_FALSE(complete(memory,task,50,1,policy,[](std::uint64_t){return false;}));
    CHECK(memory.stored.at(0).source == 1);
}
TEST_CASE("Projection belongs to owner and family and does not mutate memories", "[equipment-memory][oozle]")
{
    state owner, peer;
    limits policy;
    REQUIRE(absorb(owner,ring(ARTP_STRENGTH,6),1,0,1,policy));
    CHECK(project(peer,family::ring,1,policy).empty());
    CHECK(project(owner,family::weapon,1,policy).empty());
    CHECK(project(owner,family::ring,1,shapeshifting_limits(0)).front().effect.value == 2);
    CHECK(project(owner,family::ring,1,shapeshifting_limits(270)).front().effect.value == 6);
    CHECK(owner.stored.at(0).effects.front().value == 6);
    CHECK_FALSE(absorb(owner,ring(ARTP_FIRE),1,1000000,1,policy));
}
TEST_CASE("Duplicate properties use the strongest value and newest single brand", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    REQUIRE(absorb(memory,{family::weapon,{{ARTP_SLAYING,3},{ARTP_BRAND,SPWPN_FLAMING}}},1,0,3,policy));
    REQUIRE(absorb(memory,{family::weapon,{{ARTP_SLAYING,2},{ARTP_BRAND,SPWPN_FREEZING}}},2,0,3,policy));
    const auto result = project(memory,family::weapon,3,policy);
    REQUIRE(result.size() == 2);
    CHECK(result.front().effect.value == SPWPN_FREEZING);
    CHECK(result.back().effect.value == 3);
}
TEST_CASE("Owner projection merges families once while retaining source provenance", "[equipment-memory][oozle]")
{
    state memory, peer;
    limits policy;
    REQUIRE(absorb(memory, {family::ring, {{ARTP_FIRE,1},{ARTP_STRENGTH,6}}}, 1, 0, 7, policy));
    REQUIRE(absorb(memory, {family::armour, {{ARTP_AC,12},{ARTP_STRENGTH,4}}}, 2, 0, 7, policy));
    REQUIRE(absorb(memory, {family::shield, {{ARTP_SHIELDING,5},{ARTP_FIRE,1}}}, 3, 0, 7, policy));
    const auto result = project(memory, 7, shapeshifting_limits(0));
    REQUIRE(result.size() == 4);
    for (const auto& entry : result)
    {
        if (entry.effect.type == ARTP_AC) CHECK(entry.effect.value == 4);
        if (entry.effect.type == ARTP_FIRE) CHECK(entry.origin.group == family::shield);
        if (entry.effect.type == ARTP_STRENGTH) CHECK(entry.effect.value == 2);
        if (entry.effect.type == ARTP_SHIELDING) CHECK(entry.effect.value == 1);
    }
    CHECK(project(peer, 7, policy).empty());
    CHECK(project(memory, 1, policy).size() == 2); // Locked slots cannot contribute.
    for (const auto& effect : memory.stored.at(0).effects)
        CHECK(effect.value == (effect.type == ARTP_STRENGTH ? 6 : 1));
    CHECK(project(memory, family::ring, 7, policy).size() == 2); // Family API stays reusable.
}
TEST_CASE("Reach retains native distance and does not scale or stack across memories", "[equipment-memory][oozle]")
{
    state memory;
    const auto policy = shapeshifting_limits(0);
    REQUIRE(absorb(memory, {family::weapon, {{ARTP_NUM_PROPERTIES,2,weapon_trait::reaching}}}, 1, 0, 3, policy));
    REQUIRE(absorb(memory, {family::weapon, {{ARTP_NUM_PROPERTIES,3,weapon_trait::reaching}}}, 2, 0, 3, policy));
    const auto result = project(memory, 3, policy);
    REQUIRE(result.size() == 1);
    CHECK(result.front().effect.trait == weapon_trait::reaching);
    CHECK(result.front().effect.value == 3);
    CHECK(candidates({family::ring, {{ARTP_NUM_PROPERTIES,2,weapon_trait::reaching}}}, policy).empty());
}
TEST_CASE("Native passive queries are qualitative owner effects with distinct identities", "[equipment-memory][oozle]")
{
    state memory, peer;
    const auto policy = shapeshifting_limits(0);
    const property faith = {ARTP_NUM_PROPERTIES, 1, weapon_trait::none, {OBJ_JEWELLERY, AMU_FAITH}};
    const property spirit = {ARTP_NUM_PROPERTIES, 1, weapon_trait::none, {OBJ_JEWELLERY, AMU_GUARDIAN_SPIRIT}};
    REQUIRE(absorb(memory, {family::amulet, {faith, spirit}}, 1, 0, 3, policy));
    REQUIRE(absorb(memory, {family::armour, {faith}}, 2, 0, 3, policy));
    const auto result = project(memory, 3, policy);
    REQUIRE(result.size() == 2);
    for (const auto& effect : result)
    {
        CHECK(effect.effect.value == 1);
        CHECK(effect.effect.query.item_class == OBJ_JEWELLERY);
        if (effect.effect.query.subtype == AMU_FAITH) CHECK(effect.origin.source == 2);
    }
    CHECK(project(peer, 3, policy).empty());
}
TEST_CASE("Active work replaces the oldest memory after passive digestion fills the pool", "[equipment-memory][oozle]")
{
    state memory;
    limits policy;
    REQUIRE(absorb(memory,ring(ARTP_FIRE),1,0,3,policy));
    work task;
    REQUIRE(begin(memory,task,ring(ARTP_COLD),3,3,policy));
    REQUIRE(absorb(memory,ring(ARTP_AC),4,10,3,policy));
    finish(task);
    REQUIRE(complete(memory,task,50,3,policy,[](std::uint64_t){return true;}));
    CHECK(memory.stored.at(0).source == 3);
    CHECK(memory.stored.at(1).source == 4);
}
TEST_CASE("Weapon corrosion weakens through four stages before deferred dissolution", "[equipment-memory][oozle]")
{
    CHECK(weapon_damage_percent(0,3000) == 100);
    CHECK(weapon_damage_percent(749,3000) == 100);
    CHECK(weapon_damage_percent(750,3000) == 75);
    CHECK(weapon_damage_percent(1500,3000) == 50);
    CHECK(weapon_damage_percent(2250,3000) == 25);
    CHECK(weapon_corrosion_stage(3000,3000) == 4);
    CHECK(weapon_damage_percent(3000,3000) == 25); // Valid until end-of-action removal.
    CHECK(weapon_corrosion_stage(-10,3000) == 0);
}
TEST_CASE("Native unique identities and egos remain distinct and unscaled", "[equipment-memory][oozle]")
{
    state memory;
    const property unique = {ARTP_NUM_PROPERTIES, 1, weapon_trait::none,
                             {OBJ_ARMOUR, 9, native_kind::unique}};
    const property ego = {ARTP_NUM_PROPERTIES, 1, weapon_trait::none,
                          {OBJ_ARMOUR, 9, native_kind::ego}};
    const auto policy = shapeshifting_limits(0);
    REQUIRE(absorb(memory, {family::armour, {unique, ego}}, 1, 0, 3, policy));
    REQUIRE(absorb(memory, {family::weapon, {unique}}, 2, 0, 3, policy));
    const auto result = project(memory, 3, policy);
    REQUIRE(result.size() == 2);
    for (const auto& entry : result)
    {
        CHECK(entry.effect.value == 1);
        if (entry.effect.query.kind == native_kind::unique) CHECK(entry.origin.source == 2);
        else CHECK(entry.origin.source == 1);
    }
}
