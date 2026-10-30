#include "AppHdr.h"
#include "eldritch.h"

namespace eldritch
{
const std::vector<power>& powers()
{
    static const std::vector<power> rows = {
        {GOD_ZIN, ABIL_ZIN_RECITE, "Stolen Rebuke", 8, LOS_MAX_RANGE, false,
         "Daze one susceptible foe for up to 2/3/4/5 turns.", "Brief confusion."},
        {GOD_SHINING_ONE, ABIL_TSO_DIVINE_SHIELD, "Stolen Divine Shield", 8, -1, false,
         "Gain 3/4/5/6 SH for eight turns.", "Revealing radiance."},
        {GOD_KIKUBAAQUDGHA, ABIL_NON_ABILITY, "Grave Ward", 0, -1, true,
         "Prevent 20/30/40/50% of applicable torment damage.", "A death-magic attack."},
        {GOD_YREDELEMNUL, ABIL_YRED_LIGHT_THE_TORCH, "Stolen Raise Dead", 12, -1, false,
         "Consume one corpse for one zombie lasting 6/8/10/12 turns.", "An undead pursuer."},
        {GOD_XOM, ABIL_WORD_OF_CHAOS, "Chaos Touch", 8, -1, false,
         "Temporarily brand your weapon with chaos for 4/6/8/10 turns.", "A minor temporary chaos effect."},
        {GOD_VEHUMET, ABIL_NON_ABILITY, "Destructive Insight", 0, -1, true,
         "Restore 1/2/3/4 MP per credited worthwhile kill.", "A hostile conjuration."},
        {GOD_OKAWARU, ABIL_OKAWARU_HEROISM, "Lesser Heroism", 8, -1, false,
         "Gain 1/2/3/4 mundane skill levels for six turns.", "A hostile warrior."},
        {GOD_MAKHLEB, ABIL_NON_ABILITY, "Blood Price", 0, -1, true,
         "Restore 3/4/5/6 HP per credited worthwhile kill.", "A hostile demon."},
        {GOD_SIF_MUNA, ABIL_SIF_MUNA_CHANNEL_ENERGY, "Stolen Channel", 12, -1, false,
         "Restore 3/6/9/12 MP over three interruptible turns.", "A brief spellcasting penalty."},
        {GOD_TROG, ABIL_TROG_BERSERK, "Borrowed Rage", 12, -1, false,
         "Berserk for 4/5/6/7 turns with ordinary aftereffects.", "A hostile berserker."},
        {GOD_NEMELEX_XOBEH, ABIL_NEMELEX_DRAW_DESTRUCTION, "Draw Destruction", 8, -1, false,
         "Draw one native Destruction card at 25/35/45/55% reference power.", "A brief pig transformation."},
        {GOD_ELYVILON, ABIL_ELYVILON_HEAL_SELF, "Lesser Healing", 16, -1, false,
         "Recover 20/30/40/50% of native self-healing.", "Briefly reduced healing."},
        {GOD_LUGONU, ABIL_LUGONU_BANISH, "Stolen Banish", 20, LOS_MAX_RANGE, false,
         "Attempt native banishment at 25/35/45/55% application power.", "A distortion attack, without exile."},
        {GOD_BEOGH, ABIL_BEOGH_SMITING, "Stolen Smite", 8, LOS_MAX_RANGE, false,
         "Smite one foe for 25/35/45/55% native damage.", "A small hostile orc band."},
        {GOD_JIYVA, ABIL_JIYVA_SLIMIFY, "Stolen Slimify", 20, LOS_MAX_RANGE, false,
         "Slimify one eligible foe at 25/35/45/55% application power.", "Temporary corrosion."},
        {GOD_FEDHAS, ABIL_FEDHAS_WALL_OF_BRIARS, "Grow Briar", 8, 1, false,
         "Grow one friendly briar lasting 6/8/10/12 turns.", "Hostile plants."},
        {GOD_CHEIBRIADOS, ABIL_CHEIBRIADOS_TIME_BEND, "Stolen Bend Time", 12, 1, false,
         "Attempt to slow adjacent foes for up to 2/3/4/5 turns.", "A brief slow effect."},
        {GOD_ASHENZARI, ABIL_NON_ABILITY, "Borrowed Insight", 0, -1, true,
         "Permanently choose one skill; gain 1/2/3/4 levels.", "Brief weakness."},
        {GOD_DITHMENOS, ABIL_DITHMENOS_SHADOW_STEP, "Stolen Shadow Step", 20, 5, false,
         "Blink beside a visible foe, at most 2/3/4/5 cells.", "A hostile shadow."},
        {GOD_GOZAG, ABIL_GOZAG_POTION_PETITION, "Counterfeit Petition", 30, -1, false,
         "Choose one of three stable temporary potion offers; costs 30/27/24/21 Defiance.", "An enemy is briefly strengthened."},
        {GOD_QAZLAL, ABIL_QAZLAL_UPHEAVAL, "Lesser Upheaval", 12, LOS_MAX_RANGE, false,
         "A native elemental upheaval at 25/35/45/55% damage.", "A warned elemental cloud."},
        {GOD_RU, ABIL_RU_DRAW_OUT_POWER, "Stolen Draw Out Power", 20, -1, false,
         "Recover 20/30/40/50% native HP/MP, cleanse ordinary debuffs and gain exhaustion.", "Brief weakness."},
#if TAG_MAJOR_VERSION == 34
        {GOD_PAKELLAS, ABIL_PAKELLAS_DEVICE_SURGE, "Wand Surge", 8, LOS_MAX_RANGE, false,
         "Evoke one paid wand shot with 2/4/6/8 effective Evocations.", "Briefly reduced Evocations."},
#endif
        {GOD_USKAYAW, ABIL_USKAYAW_STOMP, "Stolen Stomp", 8, 1, false,
         "Attack adjacent enemies for 25/35/45/55% native damage.", "A brief slow effect."},
        {GOD_HEPLIAKLQANA, ABIL_HEPLIAKLQANA_IDEALISE, "Call Ancestor", 16, -1, false,
         "Call one melee ancestor for 6/8/10/12 turns.", "A hostile ancestral warrior."},
        {GOD_WU_JIAN, ABIL_NON_ABILITY, "Stolen Lunge", 0, -1, true,
         "Native movement-triggered lunge at 25/35/45/55% damage.", "A hostile martial warrior."},
        {GOD_IGNIS, ABIL_IGNIS_FIERY_ARMOUR, "Stolen Fiery Armour", 12, -1, false,
         "Gain 2/3/4/5 AC for eight turns and half-strength fire retaliation.", "A hostile fire elemental."},
        {GOD_VORR, ABIL_NON_ABILITY, "Stolen Blood Communion", 0, -1, true,
         "Heal 2/3/4/5% of direct damage to worthwhile natural blood-bearing foes.", "Brief bleeding, respecting bloodlessness."},
        {GOD_VELLUM, ABIL_VELLUM_WEAVE, "Borrowed Thread", 20, -1, false,
         "Transfer one whole positive randart property of weight at most 1/2/3/4; one thread total.",
         "Briefly suppress the borrowed thread."},
        {GOD_IMUS_THEA, ABIL_IMUS_PRISMATIC_PRISM, "Stolen Dazzle", 8, LOS_MAX_RANGE, false,
         "Blind one susceptible visible foe for 2/3/4/5 turns.", "A hostile shining eye."},
        {GOD_GREAT_WYRM, ABIL_WYRM_CITRINITAS, "Borrowed Resistance", 12, -1, false,
         "Gain elemental resistance for 4/6/8/10 turns.", "A hostile fire elemental."},
        {GOD_AGRAPHEDE, ABIL_AGRAPHEDE_SUMMON_SPIDER, "Call Redback", 16, -1, false,
         "Call one friendly redback for 6/8/10/12 turns; only one may live at a time.", "A hostile redback."}
    };
    return rows;
}

const power* policy(god_type god)
{
    for (const auto& row : powers())
        if (row.god == god)
            return &row;
    return nullptr;
}

ability_type ability(god_type god)
{
    return static_cast<ability_type>(ABIL_ELDRITCH_FIRST_POWER + static_cast<int>(god));
}

god_type god_for_ability(ability_type value)
{
    const int god = static_cast<int>(value) - ABIL_ELDRITCH_FIRST_POWER;
    return god > GOD_NO_GOD && god < NUM_GODS ? static_cast<god_type>(god) : GOD_NO_GOD;
}

bool is_ability(ability_type value)
{
    return value == ABIL_PROFANE_ALTAR || value == ABIL_ELDER_RITE
        || policy(god_for_ability(value));
}
}
