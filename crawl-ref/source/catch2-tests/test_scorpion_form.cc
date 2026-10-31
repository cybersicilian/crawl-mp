#include "catch_amalgamated.hpp"
#include "AppHdr.h"

#include "melee-attack.h"
#include "player.h"
#include "transform.h"
#include "test_player_fixture.h"

TEST_CASE_METHOD(MockPlayerYouTestsFixture, "Scorpion form supplies its own stinger and alchemy bonus",
                 "[scorpion-form]")
{
    const int base_alchemy = player_spec_alchemy();
    you.form = transformation::scorpion;
    CHECK(you.has_tail());
    CHECK(player_spec_alchemy() == base_alchemy + 1);
    const vector<string> attacks = get_player_aux_names();
    CHECK(std::find(attacks.begin(), attacks.end(), "sting") != attacks.end());
    CHECK(aux_attack_desc(UNAT_TAIL).find("18") != string::npos);
    const Form* form = get_form();
    CHECK(form->get_equivalent_mons() == MONS_EMPEROR_SCORPION);
    CHECK(form->slot_is_blocked(SLOT_WEAPON));
    CHECK(form->slot_is_blocked(SLOT_BODY_ARMOUR));
    const int base_ac = form->get_ac_bonus();
    you.props["scorpion_form_power"] = 50;
    CHECK(form->get_ac_bonus() == base_ac + 1100);
}
