/**
 * @file
 * @brief Potion and potion-like effects.
**/

#include "AppHdr.h"
#include "coop-content.h"
#include "oozle-memory-effects.h"

#include "potion.h"

#include <cstdio>
#include <cstring>
#include <unordered_map>

#include "act-iter.h"
#include "art-enum.h"
#include "cloud.h"
#include "coordit.h"
#include "directn.h"
#include "english.h"
#include "env.h"
#include "exercise.h"
#include "fight.h"
#include "god-conduct.h"
#include "god-item.h"
#include "god-passive.h"
#include "god-wrath.h" // reduce_xp_penance
#include "hints.h"
#include "invent.h"
#include "item-name.h"
#include "item-prop.h"
#include "item-status-flag-type.h"
#include "item-use.h"
#include "items.h"
#include "message.h"
#include "mon-behv.h"
#include "mon-ench.h"
#include "mutation.h"
#include "nearby-danger.h"
#include "ouch.h"
#include "party.h"
#include "player-stats.h"
#include "potion-type.h"
#include "prompt.h"
#include "religion.h"
#include "shout.h"
#include "skill-menu.h"
#include "spl-goditem.h"
#include "spl-transloc.h"
#include "stringutil.h"
#include "target.h"
#include "teleport.h"
#include "terrain.h"
#include "transform.h"
#include "traps.h"
#include "view.h"
#include "wyrm-essence.h"
#include "xom.h"

static int _scale_pot_duration(int base, bool is_potion)
{
    if (!is_potion || !you.has_mutation(MUT_EFFICIENT_METABOLISM))
        return base;
    return base * 2;
}

int _xom_factor(bool was_known);

PotionEffect::PotionEffect(const potion_type pot)
    : potion_name(potion_type_name(pot)), kind(pot)
{ }

bool PotionEffect::can_quaff(string */*reason*/, bool /*temp*/) const
{
    return true;
}

bool PotionEffect::quaff(bool was_known) const
{
    if (was_known && !check_known_quaff())
        return false;

    effect();
    return true;
}

bool PotionEffect::check_known_quaff() const
{
    string reason;
    if (!can_quaff(&reason))
    {
        mpr(reason);
        return false;
    }
    return true;
}

class PotionCuring : public PotionEffect
{
private:
    PotionCuring() : PotionEffect(POT_CURING) { }
    DISALLOW_COPY_AND_ASSIGN(PotionCuring);
public:
    static const PotionCuring &instance()
    {
        static PotionCuring inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        // no species that can quaff at all have permanent restrictions for
        // curing
        if (!temp)
            return true;

        // cure status effects, allowed even in death's door
        if (you.duration[DUR_CONF]
                    || you.duration[DUR_POISONING])
        {
            return true;
        }
        // heal
        if (you.duration[DUR_DEATHS_DOOR])
        {
            if (reason)
                *reason = "You cannot heal while in death's door.";
            return false;
        }
        if (!you.can_potion_heal(true) || temp && you.hp == you.hp_max)
        {
            if (reason)
                *reason = "You have no ailments to cure.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=40, bool is_potion = true) const override
    {
        const bool ddoor = you.duration[DUR_DEATHS_DOOR];

        if ((you.can_potion_heal() || !is_potion) && !ddoor)
        {
            const int base = 5 + random2(7);
            int amount = base;
            if (is_potion)
                amount = you.scale_potion_healing(amount);
            inc_hp(amount);
        }

        if (ddoor)
            mpr("You feel queasy.");
        else if (you.can_potion_heal()
                 || !is_potion
                 || you.duration[DUR_POISONING]
                 || you.duration[DUR_CONF])
        {
            if (is_potion)
                print_potion_heal_message();
            canned_msg(MSG_GAIN_HEALTH);
        }
        else
            mpr("That felt strangely inert.");
        // need to redraw from yellow to green even if no hp was gained
        if (you.duration[DUR_POISONING])
        {
            if (you_worship(GOD_AGRAPHEDE))
                simple_god_message(" prevents the cure of poison.");
            else
            {
                you.redraw_hit_points = true;
                you.duration[DUR_POISONING] = 0;
            }
        }
        you.duration[DUR_CONF] = 0;
        return true;
    }
};

class PotionHealWounds : public PotionEffect
{
private:
    PotionHealWounds() : PotionEffect(POT_HEAL_WOUNDS) { }
    DISALLOW_COPY_AND_ASSIGN(PotionHealWounds);
public:
    static const PotionHealWounds &instance()
    {
        static PotionHealWounds inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        // note: equip, i.e. vines, leads to temp uselessness. Should this act
        // as permauselessness?
        if (!you.can_potion_heal(temp))
        {
            if (reason)
            {
                if (!temp || !you.can_potion_heal(false))
                    *reason = "You cannot be healed by potions.";
                else
                    *reason = "You cannot currently be healed by potions.";
            }
            return false;
        }
        if (temp && you.duration[DUR_DEATHS_DOOR])
        {
            if (reason)
                *reason = "You cannot heal while in death's door.";
            return false;
        }
        if (temp && you.hp == you.hp_max)
        {
            if (reason)
                *reason = "Your health is already full.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=40, bool is_potion = true) const override
    {
        if (you.duration[DUR_DEATHS_DOOR])
        {
            mpr("You feel queasy.");
            return false;
        }
        if (!you.can_potion_heal() && is_potion)
        {
            mpr("That seemed strangely inert.");
            return false;
        }

        const int base = 10 + random2avg(28, 3);
        int amount = base;
        if (is_potion)
            amount = you.scale_potion_healing(amount);
        inc_hp(amount);
        if (is_potion)
            print_potion_heal_message();
        mpr("You feel much better.");
        return true;
    }
};

class PotionHaste : public PotionEffect
{
private:
    PotionHaste() : PotionEffect(POT_HASTE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionHaste);
public:
    static const PotionHaste &instance()
    {
        static PotionHaste inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /* temp */ = true) const override
    {
        if (you.stasis())
        {
            if (reason)
                *reason = "Your stasis prevents you from being hasted.";
            return false;
        }
        else if (have_passive(passive_t::no_haste))
        {
            if (reason)
                *reason = "You are protected from being hasted by Cheibriados.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=0, bool is_potion = true) const override
    {
        const int dur = _scale_pot_duration(random_range(26, 40), is_potion);
        return haste_player(dur);
    }

    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;

        effect(); // Chei prevents haste in haste_player().
        return true;
    }
};

class PotionMight : public PotionEffect
{
private:
    PotionMight() : PotionEffect(POT_MIGHT) { }
    DISALLOW_COPY_AND_ASSIGN(PotionMight);
public:
    static const PotionMight &instance()
    {
        static PotionMight inst; return inst;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        const bool were_mighty = you.duration[DUR_MIGHT] > 0;

        mprf(MSGCH_DURATION, "You feel %s all of a sudden.",
             were_mighty ? "mightier" : "very mighty");
        const int dur = _scale_pot_duration(35 + random2(pow), is_potion);
        you.increase_duration(DUR_MIGHT, dur);
        return true;
    }
};

class PotionBrilliance : public PotionEffect
{
private:
    PotionBrilliance() : PotionEffect(POT_BRILLIANCE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionBrilliance);
public:
    static const PotionBrilliance &instance()
    {
        static PotionBrilliance inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (you_worship(GOD_TROG))
        {
            // technically can work under Trog, but it does nothing; so give
            // an informative message instead.
            if (reason)
                *reason = "Trog doesn't allow you to cast spells!";
            return false;
        }
        if (temp && you.unrand_equipped(UNRAND_FOLLY))
        {
            if (reason)
                *reason = "Your robe already provides the effects of brilliance.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        const bool were_brilliant = you.duration[DUR_BRILLIANCE] > 0;

        mprf(MSGCH_DURATION, "You feel %sclever all of a sudden.",
             were_brilliant ? "more " : "");
        const int dur = _scale_pot_duration(35 + random2(pow), is_potion);
        you.increase_duration(DUR_BRILLIANCE, dur);
        return true;
    }
};

class PotionAttraction : public PotionEffect
{
private:
    PotionAttraction() : PotionEffect(POT_ATTRACTION) { }
    DISALLOW_COPY_AND_ASSIGN(PotionAttraction);
public:
    static const PotionAttraction &instance()
    {
        static PotionAttraction inst; return inst;
    }

    // note on uselessness: this potion works by status, so should still be
    // allowed with no monsters in LOS. Because it is marked as dangerous,
    // it always prompts. XX maybe add info to the prompt?

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        const bool was_attractive = you.duration[DUR_ATTRACTIVE] > 0;

        mprf(MSGCH_DURATION, "You feel %sattractive to monsters.",
             was_attractive ? "more " : "");

        const int dur = _scale_pot_duration((20 + random2(pow)/2), is_potion);
        you.increase_duration(DUR_ATTRACTIVE, dur);
        return true;
    }
};


class PotionEnlightenment : public PotionEffect
{
private:
    PotionEnlightenment() : PotionEffect(POT_ENLIGHTENMENT) { }
    DISALLOW_COPY_AND_ASSIGN(PotionEnlightenment);
public:
    static const PotionEnlightenment &instance()
    {
        static PotionEnlightenment inst; return inst;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        fly_player(pow);
        // Try to sync up the flying and the enlightenment.
        // ...sorry about this.
        const int dur =  max(you.duration[DUR_FLIGHT],
                             max(you.duration[DUR_ENLIGHTENED],
                                _scale_pot_duration(25 + random2(pow), is_potion)));

        you.duration[DUR_ENLIGHTENED] = dur;
        return true;
    }
};

class PotionCancellation : public PotionEffect
{
private:
    PotionCancellation() : PotionEffect(POT_CANCELLATION) { }
    DISALLOW_COPY_AND_ASSIGN(PotionCancellation);
public:
    static const PotionCancellation &instance()
    {
        static PotionCancellation inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp=true) const override
    {
        if (temp && !player_is_cancellable())
        {
            if (reason)
                *reason = "There is nothing to cancel.";
            return false;
        }

        return true;
    }

    bool effect(bool=true, int=40, bool=true) const override
    {
        debuff_player(true);
        mpr("You feel magically purged.");
        if (you.magic_contamination > 0)
        {
            contaminate_player(-1 * random_range(250, 1000));
            if (you.magic_contamination > 0)
                mpr("You feel slightly less contaminated with magical energies.");
        }
        return true;
    }
};

class PotionAmbrosia : public PotionEffect
{
private:
    PotionAmbrosia() : PotionEffect(POT_AMBROSIA) { }
    DISALLOW_COPY_AND_ASSIGN(PotionAmbrosia);
public:
    static const PotionAmbrosia &instance()
    {
        static PotionAmbrosia inst; return inst;
    }

    bool effect(bool=true, int=40, bool is_potion = true) const override
    {
        const int ambrosia_turns = _scale_pot_duration(3 + random2(8), is_potion);
        if (confuse_player(ambrosia_turns, false, true))
        {
            print_potion_heal_message();
            mprf("You feel%s invigorated.",
                 you.duration[DUR_AMBROSIA] ? " more" : "");
            you.increase_duration(DUR_AMBROSIA, ambrosia_turns);
            return true;
        }

        // should be unreachable: nothing blocks intentional confusion. (If
        // this ever changes, consider adding a `can_quaff`)
        mpr("You feel briefly invigorated.");
        return false;
    }
};

class PotionInvisibility : public PotionEffect
{
private:
    PotionInvisibility() : PotionEffect(POT_INVISIBILITY) { }
    DISALLOW_COPY_AND_ASSIGN(PotionInvisibility);
public:
    static const PotionInvisibility &instance()
    {
        static PotionInvisibility inst; return inst;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        if (you.backlit())
        {
            vector<const char *> afflictions;
            if (you.haloed() && !you.umbraed())
                afflictions.push_back("halo");
            if (player_harmful_contamination())
                afflictions.push_back("magical contamination");
            if (you.duration[DUR_CORONA])
                afflictions.push_back("corona");
            if (you.duration[DUR_STICKY_FLAME])
                afflictions.push_back("liquid flames");
            if (you.duration[DUR_QUAD_DAMAGE])
                afflictions.push_back("!!!QUAD DAMAGE!!!");
            if (you.form == transformation::flux)
                afflictions.push_back("form");
            mprf(MSGCH_DURATION,
                 "You become %stransparent, but the glow from %s "
                 "%s prevents you from becoming completely invisible.",
                 you.duration[DUR_INVIS] ? "more " : "",
                 you.haloed() && you.halo_radius() == -1 ? "the" : "your",
                 comma_separated_line(afflictions.begin(),
                                      afflictions.end()).c_str());
        }
        else
        {
            mprf(MSGCH_DURATION, !you.duration[DUR_INVIS]
                 ? "You fade into invisibility!"
                 : "You fade further into invisibility.");
        }

        const int dur = _scale_pot_duration(15 + random2(pow), is_potion);
        you.increase_duration(DUR_INVIS, dur, 100);
        return true;
    }

    bool check_known_quaff() const override
    {
        string reason;
        // invis can be drunk while temp useless, if the player accepts at the
        // prompt
        if (!can_quaff(&reason, false))
        {
            mpr(reason);
            return false;
        }
        if (!can_quaff(&reason, true)
             && !yesno((reason + " Use anyway?").c_str(), false, 'n'))
        {
            canned_msg(MSG_OK);
            return false;
        }
        if (Options.show_invis_targeter && !invisibility_target_check("Confirm quaff"))
        {
            canned_msg(MSG_OK);
            return false;
        }

        return true;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        // quaffing invis
        return invis_allowed(true, reason, temp);
    }
};

class PotionExperience : public PotionEffect
{
private:
    PotionExperience() : PotionEffect(POT_EXPERIENCE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionExperience);
public:
    static const PotionExperience &instance()
    {
        static PotionExperience inst; return inst;
    }

    bool effect(bool=true, int pow = 40, bool=true) const override
    {
        if (player_under_penance(GOD_HEPLIAKLQANA))
        {
            simple_god_message(" appreciates the memories.", false,
                               GOD_HEPLIAKLQANA);
            reduce_xp_penance(GOD_HEPLIAKLQANA,
                              750 * you.experience_level * pow / 40);
            return true;
        }

        if (you.experience_level < you.get_max_xl())
        {
            const int levels = min(you.get_max_xl(), pow / 40);
            mpr("You feel more experienced!");
            // Defer calling level_change() until later in drink() to prevent
            // SIGHUP abuse.
            adjust_level(levels, true);
        }
        else
            mpr("A flood of memories washes over you.");

        // these are included in default force_more_message
        const int exp = 7500 * you.experience_level * pow / 40;
        if (you.has_mutation(MUT_DISTRIBUTED_TRAINING))
        {
            you.exp_available += exp;
            train_skills();
        }
        else
            skill_menu(SKMF_EXPERIENCE, exp);

        // the player might meet training targets and need to choose
        // skills
        check_selected_skills();

        return true;
    }
};

class PotionMagic : public PotionEffect
{
private:
    PotionMagic() : PotionEffect(POT_MAGIC) { }
    DISALLOW_COPY_AND_ASSIGN(PotionMagic);
public:
    static const PotionMagic &instance()
    {
        static PotionMagic inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (!you.uses_magic_reserve() || temp && !you.max_magic_points)
        {
            if (reason)
                *reason = "You have no magic to restore.";
            return false;
        }
        else if (temp && you.magic_points == you.max_magic_points)
        {
            if (reason)
                *reason = you.species == SP_AUTOMATON ? "You have no heat to dissipate."
                                                     : "Your magic is already full.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int = 40, bool is_potion = true) const override
    {
        int amount = is_potion ? you.scale_potion_mp_healing(POT_MAGIC_MP)
                               : POT_MAGIC_MP;
        inc_mp(amount);
        if (!you.uses_magic_reserve())
            mpr("Magic washes over you without effect.");
        else
        {
            if (is_potion && you.unrand_equipped(UNRAND_KRYIAS))
            {
                mprf("%s enhances the restoration.",
                     oozle::unrand_source(UNRAND_KRYIAS)->name(DESC_THE, false, false, false).c_str());
            }
            else if (is_potion && you.has_mutation(MUT_DOUBLE_POTION_HEAL))
                mpr("You savour every drop.");

            mpr(you.species == SP_AUTOMATON ? "Heat dissipates from your body."
                                          : "Magic courses through your body.");
        }
        return true;
    }
};

class PotionBerserk : public PotionEffect
{
private:
    PotionBerserk() : PotionEffect(POT_BERSERK_RAGE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionBerserk);
public:
    static const PotionBerserk &instance()
    {
        static PotionBerserk inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        return you.can_go_berserk(true, true, true, reason, temp);
    }

    bool effect(bool was_known = true, int = 40, bool is_potion = true) const override
    {
        if (you.is_lifeless_undead())
        {
            mpr("You feel slightly irritated.");
            return false;
        }

        // Duration scaling is handled in go_berserk().
        you.go_berserk(was_known, is_potion);
        return true;
    }

    bool quaff(bool was_known) const override
    {
        if (was_known
            && (!check_known_quaff() || !berserk_check_wielded_weapon()))
        {
            return false;
        }

        if (effect(was_known))
            xom_is_stimulated(50);
        return true;
    }
};

/**
 * Is the player able to mutate (temporarily or permanently) & thus unable
 * to drink a mutation-causing potion?  This is a wrapper on `you.can_safely_mutate`.
 *
 * @param reason Pointer to a string where the reason will be stored if unable
 *               to mutate
 * @returns true if the player is able to mutate right now, otherwise false.
 */
static bool _can_mutate(string *reason, bool temp)
{
    if (you.can_safely_mutate(temp))
        return true;

    if (reason)
    {
        *reason = make_stringf("You cannot mutate%s.",
                               you.can_safely_mutate(false) ? " at present" : "");
    }
    return false;
}

class PotionResistance : public PotionEffect
{
private:
    PotionResistance() : PotionEffect(POT_RESISTANCE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionResistance);
public:
    static const PotionResistance &instance()
    {
        static PotionResistance inst; return inst;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        mprf(MSGCH_DURATION, "You feel protected.");
        const int add = _scale_pot_duration(35 + random2(pow), is_potion);;
        you.increase_duration(DUR_RESISTANCE, add);
        return true;
    }
};

class PotionLignify : public PotionEffect
{
private:
    PotionLignify() : PotionEffect(POT_LIGNIFY) { }
    DISALLOW_COPY_AND_ASSIGN(PotionLignify);
public:
    static const PotionLignify &instance()
    {
        static PotionLignify inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        const string treason = cant_transform_reason(transformation::tree,
                                                     false, temp);
        if (treason.empty())
            return true;

        if (reason)
            *reason = treason;
        return false;
    }

    bool effect(bool was_known = true, int=40, bool is_potion = true) const override
    {
        if (you.form == transformation::death) // Gozag potion petition
        {
            mpr("You're too dead to put down roots!");
            return false;
        }
        const int dur = _scale_pot_duration(15 + random2(30) + random2(15), is_potion);
        return transform(dur, transformation::tree, !was_known);
    }

    bool quaff(bool was_known) const override
    {
        if (was_known)
        {
            if (!check_known_quaff())
                return false;

            const cloud_type cloud = cloud_type_at(you.pos());
            if (cloud_damages_over_time(cloud, false)
                // Tree form is immune to these two.
                && cloud != CLOUD_MEPHITIC && cloud != CLOUD_POISON
                && !yesno(make_stringf("Really become a tree while standing in "
                                       "a cloud of %s?",
                                       cloud_type_name(cloud).c_str()).c_str(),
                          false, 'n'))
            {
                canned_msg(MSG_OK);
                return false;
            }
        }

        if (effect(was_known))
        {
            you.transform_uncancellable = true;
            if (!was_known)
                god_forgive_inadvertent_act(FORBID_TRANSFORMATION);
        }
        else
            mpr("You feel woody for a moment.");
        return true;
    }
};

const int MIN_REMOVED = 2;
const int MAX_REMOVED = 3;
const int MIN_ADDED = 1;
const int MAX_ADDED = 3;

class PotionMutation : public PotionEffect
{
private:
    PotionMutation() : PotionEffect(POT_MUTATION) { }
    DISALLOW_COPY_AND_ASSIGN(PotionMutation);
public:
    static const PotionMutation &instance()
    {
        static PotionMutation inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        return _can_mutate(reason, temp);
    }

    bool effect(bool = true, int = 40, bool = true) const override
    {
        if (have_passive(passive_t::cleanse_mut_potions))
            simple_god_message(" cleanses your potion of mutation!");
        else
            mpr("You feel extremely strange.");
        bool mutated = false;
        int remove_mutations = random_range(MIN_REMOVED, MAX_REMOVED);
        int add_mutations = random_range(MIN_ADDED, MAX_ADDED);

        // Remove mutations.
        for (int i = 0; i < remove_mutations; i++)
            mutated |= delete_mutation(RANDOM_MUTATION, "potion of mutation", false);
        if (have_passive(passive_t::cleanse_mut_potions))
            return mutated;
        // Add mutations.
        for (int i = 0; i < add_mutations; i++)
            mutated |= mutate(RANDOM_MUTATION, "potion of mutation", false);
        // Sometimes one good mutation.
        if (coinflip())
        {
            mutated |= mutate(RANDOM_GOOD_MUTATION, "potion of mutation",
                              false);
        }

        learned_something_new(HINT_YOU_MUTATED);
        return mutated;
    }


    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;

        if (was_known && you.rmut_from_item()
            && !yesno("Really drink that potion of mutation while resistant to mutation?", false, 'n'))
        {
            canned_msg(MSG_OK);
            return false;
        }

        if (effect() && !was_known
            && !have_passive(passive_t::cleanse_mut_potions))
        {
            god_forgive_inadvertent_act(FORBID_TRANSFORMATION);
        }
        return true;
    }
};

class PotionMoonshine : public PotionEffect
{
private:
    PotionMoonshine() : PotionEffect(POT_MOONSHINE) { }
    DISALLOW_COPY_AND_ASSIGN(PotionMoonshine);
public:
    static const PotionMoonshine &instance()
    {
        static PotionMoonshine inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (!temp)
            return true;

        // Oni drunk brawling will skip this check if any monsters are in range,
        // so this is entirely for the case where there isn't.
        if (reason)
            *reason = "There's no one nearby to share it with.";
        return false;
    }

    bool effect(bool=true, int=40, bool is_potion = true) const override
    {
        mpr("You feel tipsy.");
        const int dur = _scale_pot_duration(random_range(10, 25), is_potion);
        you.increase_duration(DUR_VERTIGO, dur, 50);
        return true;
    }

    bool quaff(bool was_known) const override
    {
        if (effect())
            xom_is_stimulated( 50 / _xom_factor(was_known));
        return true;
    }
};

class PotionMist : public PotionEffect
{
private:
    PotionMist() : PotionEffect(POT_MIST) { }
    DISALLOW_COPY_AND_ASSIGN(PotionMist);
public:
    static const PotionMist &instance()
    {
        static PotionMist inst; return inst;
    }

    bool effect(bool= true, int=40, bool is_potion = true) const override
    {
        const int dur = _scale_pot_duration(random_range(15, 25), is_potion);
        if (you.is_insubstantial())
            mprf(MSGCH_DURATION, "You become very slightly more insubstantial.");
        else
            mprf(MSGCH_DURATION, "Your body becomes insubstantial.");
        you.increase_duration(DUR_INSUBSTANTIAL, dur, 40);

        you.stop_being_caught();
        you.stop_being_constricted();
        if (you.duration[DUR_STICKY_FLAME])
        {
            mprf(MSGCH_RECOVERY, "The liquid fire falls away from your body.");
            end_sticky_flame_player();
        }
        if (you.duration[DUR_PETRIFYING])
        {
            mprf(MSGCH_RECOVERY, "You body stops petrifying.");
            you.duration[DUR_PETRIFYING] = 0;
            you.redraw_evasion = true;
        }
        if (you.duration[DUR_BARBS])
        {
            mprf(MSGCH_RECOVERY, "The spiked barbs fall from your body.");
            you.duration[DUR_BARBS] = 0;
            you.attribute[ATTR_BARBS_POW] = 0;
            you.props.erase(BARBS_MOVE_KEY);
        }

        return true;
    }

    bool quaff(bool was_known) const override
    {
        effect(was_known);
        return true;
    }
};

class PotionEmpathy : public PotionEffect
{
private:
    PotionEmpathy() : PotionEffect(POT_EMPATHY) { }
    DISALLOW_COPY_AND_ASSIGN(PotionEmpathy);
public:
    static const PotionEmpathy &instance()
    {
        static PotionEmpathy inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /*temp*/ = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            if (reason)
                *reason = "You have no companions to bond with.";
            return false;
        }
        return true;
    }

    bool effect(bool = true, int pow = 40, bool is_potion = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const int turns = _scale_pot_duration(30 + random2(pow / 2), is_potion);
        party::apply_party_aura_buff(DUR_EMPATHY, turns, GXM + GYM, true);

        const int count = party::player_count();
        for (int i = 0; i < count; ++i)
        {
            if (party::slot_is_alive(i) && !party::is_player_downed(i)
                && party::slot_is_on_current_floor(i))
            {
                party::heal_or_buff_party_member(i, 6 + random2(7), NUM_DURATIONS, 0, false);
            }
        }

        mprf(MSGCH_DURATION,
             "A warm empathic tether links your life-force with your companions!");
        return true;
    }
};

class PotionSoulAmbrosia : public PotionEffect
{
private:
    PotionSoulAmbrosia() : PotionEffect(POT_SOUL_AMBROSIA) { }
    DISALLOW_COPY_AND_ASSIGN(PotionSoulAmbrosia);
public:
    static const PotionSoulAmbrosia &instance()
    {
        static PotionSoulAmbrosia inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /*temp*/ = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            if (reason)
                *reason = "You have no companions to share soul ambrosia with.";
            return false;
        }
        return true;
    }

    bool effect(bool = true, int pow = 40, bool is_potion = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const int turns = _scale_pot_duration(8 + random2(8) + pow / 10, is_potion);
        bool revived_any = false;
        const int count = party::player_count();
        for (int i = 0; i < count; ++i)
        {
            if (party::is_player_downed(i))
            {
                revived_any = true;
                break;
            }
        }

        if (revived_any)
            party::revive_downed_players(false, 0);

        party::apply_party_aura_buff(DUR_SOUL_AMBROSIA, turns, LOS_DEFAULT_RANGE, true);

        mprf(MSGCH_DURATION,
             "Luminous soul ambrosia floods you and your companions with vital and arcane vigour!");
        return true;
    }
};

class PotionConcord : public PotionEffect
{
private:
    PotionConcord() : PotionEffect(POT_CONCORD) { }
    DISALLOW_COPY_AND_ASSIGN(PotionConcord);
public:
    static const PotionConcord &instance()
    {
        static PotionConcord inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /*temp*/ = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            if (reason)
                *reason = "You have no companions to resonate with.";
            return false;
        }
        return true;
    }

    bool effect(bool = true, int pow = 40, bool is_potion = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const int turns = _scale_pot_duration(25 + random2(pow / 2), is_potion);
        party::apply_party_aura_buff(DUR_CONCORD, turns, LOS_DEFAULT_RANGE, true);
        you.redraw_evasion = true;
        you.redraw_armour_class = true;

        const int allies = party::count_allies_in_radius(LOS_DEFAULT_RANGE);
        mprf(MSGCH_DURATION,
             "A harmonic chorus of battle-prowess resonates between you and %s!",
             allies > 0 ? "your visible companions" : "your spirit");
        return true;
    }
};

class PotionTransfusion : public PotionEffect
{
private:
    PotionTransfusion() : PotionEffect(POT_TRANSFUSION) { }
    DISALLOW_COPY_AND_ASSIGN(PotionTransfusion);
public:
    static const PotionTransfusion &instance()
    {
        static PotionTransfusion inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /*temp*/ = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            if (reason)
                *reason = "You have no companions to transfuse with.";
            return false;
        }
        return true;
    }

    bool effect(bool = true, int /*pow*/ = 40, bool /*is_potion*/ = true) const override
    {
        if (!coop_content::enabled() || !party::is_enabled())
        {
            canned_msg(MSG_NOTHING_HAPPENS);
            return false;
        }

        const int count = party::player_count();
        const int active = party::active_slot();
        const player &me = party::get_player(active);

        int sum_hp_pct = 0;
        int sum_mp_pct = 0;
        int mana_users = 0;
        int living_on_floor = 0;

        for (int i = 0; i < count; ++i)
        {
            if (party::is_player_downed(i))
                continue;
            const player &p = party::get_player(i);
            if (p.hp <= 0 || p.where_are_you != me.where_are_you || p.depth != me.depth)
                continue;

            sum_hp_pct += (p.hp * 100) / max(1, p.hp_max);
            if (p.uses_magic_reserve() && p.max_magic_points > 0)
            {
                sum_mp_pct += (p.magic_points * 100) / p.max_magic_points;
                ++mana_users;
            }
            ++living_on_floor;
        }

        if (living_on_floor <= 0)
            return false;

        const int avg_hp_pct = min(100, (sum_hp_pct / living_on_floor) + 20);
        const int avg_mp_pct = min(100, (sum_mp_pct / max(1, mana_users)) + 20);

        for (int i = 0; i < count; ++i)
        {
            if (party::is_player_downed(i))
                continue;
            player &p = party::get_player(i);
            if (p.hp <= 0 || p.where_are_you != me.where_are_you || p.depth != me.depth)
                continue;

            if (!p.duration[DUR_DEATHS_DOOR])
            {
                const int target_hp = max(p.hp, (p.hp_max * avg_hp_pct) / 100);
                p.hp = min(p.hp_max, target_hp + 5);
            }
            if (p.uses_magic_reserve() && p.max_magic_points > 0)
            {
                const int target_mp = max(p.magic_points,
                                          (p.max_magic_points * avg_mp_pct) / 100);
                p.magic_points = min(p.max_magic_points, target_mp + 3);
            }

            party::heal_or_buff_party_member(i, 0, DUR_DIVINE_SHIELD, 5, true);
        }

        party::sync_all_proxies();
        mprf(MSGCH_RECOVERY,
             "Vitality and magic equalize across the party in a surge of protective light!");
        return true;
    }
};

class PotionPoison : public PotionEffect
{
private:
    PotionPoison() : PotionEffect(POT_POISON) { }
    DISALLOW_COPY_AND_ASSIGN(PotionPoison);
public:
    static const PotionPoison &instance()
    {
        static PotionPoison inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (temp && player_res_poison(false) >= 1)
        {
            if (reason)
                *reason = "You are resistant to poison.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=40, bool=true) const override
    {
        mprf(MSGCH_WARN, "That liquid tasted very nasty...");
        return poison_player(10 + random2avg(15, 2), "", "a potion of poison");
    }

    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;
        if (player_res_poison() >= 1)
            mpr("You feel slightly nauseous.");
        else if (effect(was_known))
            xom_is_stimulated(100 / _xom_factor(was_known));
        return true;
    }
};

class PotionStrongPoison : public PotionEffect
{
private:
    PotionStrongPoison() : PotionEffect(POT_STRONG_POISON) { }
    DISALLOW_COPY_AND_ASSIGN(PotionStrongPoison);
public:
    static const PotionStrongPoison &instance()
    {
        static PotionStrongPoison inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (temp && player_res_poison(false) >= 1)
        {
            if (reason)
                *reason = "You are resistant to poison.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=40, bool=true) const override
    {
        mprf(MSGCH_WARN, "That liquid tasted maximally nasty...");
        return poison_player(20 + random2avg(30, 2), "", "a potion of strong poison", true);
    }

    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;
        if (player_res_poison() >= 1)
            mpr("You feel quite nauseous.");
        else if (effect(was_known))
            xom_is_stimulated(100 / _xom_factor(was_known));
        return true;
    }
};

class PotionSlowing : public PotionEffect
{
private:
    PotionSlowing() : PotionEffect(POT_SLOWING) { }
    DISALLOW_COPY_AND_ASSIGN(PotionSlowing);
public:
    static const PotionSlowing &instance()
    {
        static PotionSlowing inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool /*temp*/ = true) const override
    {
        if (you.stasis())
        {
            if (reason)
                *reason = "Your stasis prevents you from being slowed.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int pow = 40, bool is_potion = true) const override
    {
        return slow_player(_scale_pot_duration(10 + random2(pow), is_potion));
    }

    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;
        if (effect(was_known))
            xom_is_stimulated(50 / _xom_factor(was_known));
        return true;
    }
};

class PotionDecay : public PotionEffect
{
private:
    PotionDecay() : PotionEffect(POT_DECAY) { }
    DISALLOW_COPY_AND_ASSIGN(PotionDecay);
public:
    static const PotionDecay &instance()
    {
        static PotionDecay inst; return inst;
    }

    bool can_quaff(string *reason = nullptr, bool temp = true) const override
    {
        if (you.is_lifeless_undead(temp) || you.res_negative_energy(!temp) >= 3)
        {
            if (reason)
                *reason = "You are resistant to rotting.";
            return false;
        }
        return true;
    }

    bool effect(bool=true, int=40, bool=true) const override
    {
        mprf(MSGCH_WARN, "You feel your flesh start to rot away!");
        return drain_player(60 + random2(40), true, false);
    }

    bool quaff(bool was_known) const override
    {
        if (was_known && !check_known_quaff())
            return false;
        if (effect(was_known))
            xom_is_stimulated(50 / _xom_factor(was_known));
        return true;
    }
};

class PotionWater : public PotionEffect
{
private:
    PotionWater() : PotionEffect(POT_WATER) { }
    DISALLOW_COPY_AND_ASSIGN(PotionWater);
public:
    static const PotionWater &instance()
    {
        static PotionWater inst; return inst;
    }

    bool effect(bool=true, int=40, bool=true) const override
    {
        mpr("This tastes like water.");
        return true;
    }
};

template <potion_type Essence>
class PotionWyrmEssence : public PotionEffect
{
    PotionWyrmEssence() : PotionEffect(Essence) { }
public:
    static const PotionWyrmEssence& instance()
    {
        static PotionWyrmEssence instance;
        return instance;
    }

    bool effect(bool = true, int power = 40, bool is_potion = true) const override
    {
        if (!you_worship(GOD_GREAT_WYRM))
        {
            simple_god_message(" whispers that only followers may embrace this essence.",
                               GOD_GREAT_WYRM);
            return true;
        }
        switch (Essence)
        {
        case POT_NIGREDO:
            // Permanent HP rot is no longer a current player mechanic. Use
            // the existing temporary draining effect for alchemical decay.
            return PotionDecay::instance().effect(true, power, is_potion);
        case POT_ALBEDO:
            return PotionCancellation::instance().effect(true, power, is_potion);
        case POT_CITRINITAS:
            mpr("You feel empowered.");
            wyrm_essence::empower_player(you, you.piety() / 50 + random2(10),
                                          you.mid);
            return true;
        case POT_VIRIDITAS:
            you.duration[DUR_POISONING] = 0;
            you.duration[DUR_CONF] = 0;
            you.duration[DUR_SLOW] = 0;
            you.duration[DUR_PETRIFYING] = 0;
            you.duration[DUR_WEAK] = 0;
            you.redraw_hit_points = true;
            you.redraw_evasion = true;
            mpr("You feel restored.");
            return true;
        case POT_RUBEDO:
            mprf(MSGCH_DURATION, "You feel protected.");
            you.increase_duration(DUR_RESISTANCE,
                                  _scale_pot_duration(min(random2(max(1, power)) + 15,
                                                          20), is_potion));
            return true;
        default:
            return false;
        }
    }
};

static const unordered_map<potion_type, const PotionEffect*, std::hash<int>> potion_effects = {
    { POT_CURING, &PotionCuring::instance(), },
    { POT_HEAL_WOUNDS, &PotionHealWounds::instance(), },
    { POT_HASTE, &PotionHaste::instance(), },
    { POT_MIGHT, &PotionMight::instance(), },
    { POT_BRILLIANCE, &PotionBrilliance::instance(), },
    { POT_ATTRACTION, &PotionAttraction::instance(), },
    { POT_ENLIGHTENMENT, &PotionEnlightenment::instance(), },
    { POT_POISON, &PotionPoison::instance(), },
    { POT_SLOWING, &PotionSlowing::instance(), },
    { POT_CANCELLATION, &PotionCancellation::instance(), },
    { POT_AMBROSIA, &PotionAmbrosia::instance(), },
    { POT_INVISIBILITY, &PotionInvisibility::instance(), },
    { POT_MOONSHINE, &PotionMoonshine::instance(), },
    { POT_DECAY, &PotionDecay::instance(), },
    { POT_WATER, &PotionWater::instance(), },
    { POT_EXPERIENCE, &PotionExperience::instance(), },
    { POT_MAGIC, &PotionMagic::instance(), },
    { POT_STRONG_POISON, &PotionStrongPoison::instance(), },
    { POT_BERSERK_RAGE, &PotionBerserk::instance(), },
    { POT_MUTATION, &PotionMutation::instance(), },
    { POT_RESISTANCE, &PotionResistance::instance(), },
    { POT_LIGNIFY, &PotionLignify::instance(), },
    { POT_MIST, &PotionMist::instance(), },
    { POT_EMPATHY, &PotionEmpathy::instance(), },
    { POT_SOUL_AMBROSIA, &PotionSoulAmbrosia::instance(), },
    { POT_CONCORD, &PotionConcord::instance(), },
    { POT_TRANSFUSION, &PotionTransfusion::instance(), },
    { POT_NIGREDO, &PotionWyrmEssence<POT_NIGREDO>::instance(), },
    { POT_ALBEDO, &PotionWyrmEssence<POT_ALBEDO>::instance(), },
    { POT_CITRINITAS, &PotionWyrmEssence<POT_CITRINITAS>::instance(), },
    { POT_VIRIDITAS, &PotionWyrmEssence<POT_VIRIDITAS>::instance(), },
    { POT_RUBEDO, &PotionWyrmEssence<POT_RUBEDO>::instance(), },
};

const PotionEffect* get_potion_effect(potion_type pot)
{
    switch (pot)
    {
    default:
        return potion_effects.at(pot);
    CASE_REMOVED_POTIONS(pot);
    }
}

static const map<potion_type, string> _spore_msg =
{
    { POT_CURING, "curing" },
    { POT_HEAL_WOUNDS, "healing" },
    { POT_HASTE, "quickening", },
    { POT_MIGHT, "strenghtening", },
    { POT_BRILLIANCE, "amplifying" },
    { POT_ENLIGHTENMENT, "enlightening" },
    { POT_INVISIBILITY, "invisible" },
    { POT_MAGIC, "magical" },
    { POT_BERSERK_RAGE, "infuriating" },
    { POT_RESISTANCE, "bolstering" },
    { POT_MIST, "insubstantial" },
    { POT_EMPATHY, "empathic" },
    { POT_SOUL_AMBROSIA, "invigorating" },
    { POT_CONCORD, "harmonious" },
    { POT_TRANSFUSION, "revitalising" },
};

static void _handle_potion_fungus(potion_type potion)
{
    if (!_spore_msg.count(potion))
        return;
    // Baseline chance not to trigger.
    if (!one_chance_in(3))
        return;

    // Now check if there are any monsters in sight which could benefit from
    // this potion.
    vector<monster*> targs;
    for (monster_near_iterator mi(you.pos()); mi; ++mi)
        if (mons_benefits_from_potion(**mi, potion))
            targs.push_back(*mi);

    // Don't print a message if nothing will happen.
    if (targs.empty())
        return;

    draw_ring_animation(you.pos(), you.current_vision, WHITE, CYAN, true, 10);

    // Affect a percentage of nearby targets, but always at least one.
    shuffle_array(targs);
    int num_affected = min((int)targs.size(), random_range(targs.size() * 4 / 10 + 1,
                                                           targs.size() * 9 / 10 + 1));


    mprf("Your fungus emits %s spores!", _spore_msg.at(potion).c_str());


    for (int i = 0; i < num_affected; ++i)
        mons_potion_effect(*targs[i], potion, you);
}

/**
 * Quaff a potion, identifying it if appropriate & triggering its effects on
 * the player. Does not handle decrementing item quantities.
 *
 * @param potion    The potion (stack) being quaffed.
 * @param force     Whether to consume the potion even if it is known to be useless.
 * @return          true if the potion was used; false if the player aborted.
 */
bool quaff_potion(item_def &potion, bool force)
{
    const bool was_known = item_type_known(potion);

    if (player_under_penance(GOD_GREAT_WYRM)
        && wyrm_essence::penance_extracts_potion(random2(3)))
    {
        simple_god_message(" extracts your potion before you drink!", GOD_GREAT_WYRM);
        return true;
    }

    if (!was_known)
    {
        identify_item(potion);
        mprf("It was %s.", article_a(potion.name(DESC_QUALNAME)).c_str());
    }

    const potion_type ptyp = static_cast<potion_type>(potion.sub_type);
    if (get_potion_effect(ptyp)->quaff(was_known && !force))
    {
        if (you.wearing(OBJ_JEWELLERY, AMU_CHEMISTRY, false, true)
            && you.magic_points < you.max_magic_points)
        {
            mpr("You extract magical energy from the potion.");
            inc_mp(random_range(5, 9));
        }

        if (you.form == transformation::mistmane)
            mistmane_quaff_potion(ptyp);

        if (you.has_mutation(MUT_POTION_FUNGUS))
            _handle_potion_fungus(ptyp);

        return true;
    }

    return false;
}

/**
 * Trigger an effect on the player corresponding to the given potion type.
 *
 * @param effect        The type of potion in question.
 * @param pow           The power of the effect. (Only relevant for some pots.)
 * @param was_known     Whether the player should be held responsible.
 */
void potionlike_effect(potion_type effect, int pow, bool was_known)
{
    get_potion_effect(effect)->effect(was_known, pow, false);
}

int _xom_factor(bool was_known)
{
    // Knowingly drinking bad potions is much less amusing.
    int xom_factor = 1;
    if (was_known)
    {
        xom_factor *= 2;
        if (!player_in_a_dangerous_place())
            xom_factor *= 3;
    }
    return xom_factor;
}

// Returns true if a given monster could currently gain some benefit from a
// given potion effect. (Among those implemented for monsters).
bool mons_benefits_from_potion(const monster& mon, potion_type potion)
{
    switch (potion)
    {
        case POT_HASTE:
            return !mon.has_ench(ENCH_HASTE) && !mon.stasis();

        case POT_MIGHT:
            return !mon.has_ench(ENCH_MIGHT) && mons_has_attacks(mon);

        case POT_BRILLIANCE:
            return !mon.has_ench(ENCH_EMPOWERED_SPELLS) && mon.antimagic_susceptible();

        case POT_HEAL_WOUNDS:
            return mon.hit_points < mon.max_hit_points;

        case POT_CURING:
            return mon.hit_points < mon.max_hit_points
                    || mon.has_ench(ENCH_POISON)
                    || mon.has_ench(ENCH_CONFUSION);

        case POT_ENLIGHTENMENT:
            return !mon.has_ench(ENCH_FLIGHT) || !mon.has_ench(ENCH_STRONG_WILLED);

        case POT_INVISIBILITY:
            return !mon.has_ench(ENCH_INVIS) && !mon.backlit();

        case POT_MAGIC:
            return mon.has_ench(ENCH_ANTIMAGIC);

        case POT_BERSERK_RAGE:
            return !mon.has_ench(ENCH_BERSERK) && mon.can_go_berserk();

        case POT_RESISTANCE:
            return !mon.has_ench(ENCH_RESISTANCE);

        case POT_MIST:
            return !mon.is_insubstantial();

        default:
            return false;
    }
}

void mons_potion_effect(monster& mon, potion_type potion, const actor& source)
{
    switch (potion)
    {
        case POT_HASTE:
            enchant_actor_with_flavour(&mon, &source, BEAM_HASTE);
            break;

        case POT_MIGHT:
            enchant_actor_with_flavour(&mon, &source, BEAM_MIGHT);
            break;

        case POT_BRILLIANCE:
            simple_monster_message(mon, " magic is enhanced!", true);
            mon.add_ench(mon_enchant(ENCH_EMPOWERED_SPELLS, &source));
            break;

        case POT_HEAL_WOUNDS:
            simple_monster_message(mon, " is healed!");
            mon.heal(random_range(30, 50));
            break;

        case POT_CURING:
            simple_monster_message(mon, " is healed!");
            mon.heal(random_range(10, 20));
            mon.del_ench(ENCH_POISON);
            mon.del_ench(ENCH_CONFUSION);
            break;

        case POT_ENLIGHTENMENT:
        {
            simple_monster_message(mon, " is enlightened!");
            const int dur = random_range(300, 450);
            mon.add_ench(mon_enchant(ENCH_FLIGHT, &source, dur));
            mon.add_ench(mon_enchant(ENCH_STRONG_WILLED, &source, dur));
        }
            break;

        case POT_INVISIBILITY:
            enchant_actor_with_flavour(&mon, &source, BEAM_INVISIBILITY);
            break;

        case POT_MAGIC:
            mon.del_ench(ENCH_ANTIMAGIC);
            break;

        case POT_BERSERK_RAGE:
            mon.go_berserk(false);
            break;

        case POT_RESISTANCE:
            enchant_actor_with_flavour(&mon, &source, BEAM_RESISTANCE);
            break;

        case POT_MIST:
            simple_monster_message(mon, " becomes insubstantial!");
            mon.add_ench(mon_enchant(ENCH_INSUBSTANTIAL, &source, random_range(300, 450)));
            break;

        default:
            break;
    }
}

bool can_throw_potion(string *reason)
{
    if (you.berserk())
    {
        if (reason)
            *reason = "You are too berserk!";
        return false;
    }
    if (you.has_mutation(MUT_NO_GRASPING) || !form_can_wield())
    {
        if (reason)
            *reason = "You cannot throw potions in your present form.";
        return false;
    }
    if (you.attribute[ATTR_HELD])
    {
        if (reason)
            *reason = make_stringf("You cannot throw anything while %s.", held_status());
        return false;
    }
    return true;
}

static bool _is_offensive_thrown_potion(potion_type ptyp)
{
    switch (ptyp)
    {
    case POT_POISON:
    case POT_STRONG_POISON:
    case POT_SLOWING:
    case POT_DECAY:
    case POT_MOONSHINE:
    case POT_CANCELLATION:
    case POT_MUTATION:
    case POT_LIGNIFY:
    case POT_ATTRACTION:
        return true;
    default:
        return false;
    }
}

static bool _apply_player_potion_splash(potion_type ptyp, int pct, bool is_self)
{
    bool affected = false;
    switch (ptyp)
    {
    case POT_CURING:
        if (you.duration[DUR_CONF] || you.duration[DUR_POISONING] || you.duration[DUR_SLOW])
        {
            you.duration[DUR_CONF] = 0;
            you.duration[DUR_POISONING] = 0;
            you.duration[DUR_SLOW] = 0;
            affected = true;
        }
        if (!you.duration[DUR_DEATHS_DOOR] && you.can_potion_heal() && you.hp < you.hp_max)
        {
            const int base_heal = 5 + (you.hp_max * 7) / 40;
            const int amount = you.scale_potion_healing(max(3, base_heal * pct / 100));
            inc_hp(amount);
            affected = true;
        }
        break;

    case POT_HEAL_WOUNDS:
        if (!you.duration[DUR_DEATHS_DOOR] && you.can_potion_heal() && you.hp < you.hp_max)
        {
            const int base_heal = 10 + random2avg(28, 3);
            const int amount = you.scale_potion_healing(max(6, base_heal * pct / 100));
            inc_hp(amount);
            affected = true;
        }
        break;

    case POT_MAGIC:
        if (you.magic_points < you.max_magic_points)
        {
            const int base_mp = 10 + (you.max_magic_points * 2) / 5;
            inc_mp(max(4, base_mp * pct / 100));
            affected = true;
        }
        break;

    case POT_HASTE:
        if (!you.stasis())
        {
            if (haste_player(max(6, (40 + random2(25)) * pct / 100)))
            {
                contaminate_player(random_range(350, 550) * pct / 100, true);
                affected = true;
            }
        }
        break;

    case POT_MIGHT:
        you.increase_duration(DUR_MIGHT, max(6, (35 + random2(25)) * pct / 100), 80);
        affected = true;
        break;

    case POT_BRILLIANCE:
        you.increase_duration(DUR_BRILLIANCE, max(6, (35 + random2(25)) * pct / 100), 80);
        affected = true;
        break;

    case POT_ATTRACTION:
        you.increase_duration(DUR_ATTRACTIVE, max(5, (20 + random2(15)) * pct / 100));
        affected = true;
        break;

    case POT_ENLIGHTENMENT:
    {
        const int dur = max(6, (25 + random2(20)) * pct / 100);
        fly_player(dur);
        you.increase_duration(DUR_ENLIGHTENED, dur, 100);
        affected = true;
        break;
    }

    case POT_POISON:
        if (player_res_poison() <= 0)
        {
            you.poison(&you, max(2, random_range(4, 8) * pct / 100));
            affected = true;
        }
        break;

    case POT_STRONG_POISON:
        if (player_res_poison() <= 0)
        {
            you.poison(&you, max(5, random_range(10, 18) * pct / 100));
            affected = true;
        }
        break;

    case POT_SLOWING:
        if (!you.stasis())
        {
            slow_player(max(4, (10 + random2(12)) * pct / 100));
            affected = true;
        }
        break;

    case POT_CANCELLATION:
        debuff_player();
        contaminate_player(-1 * (you.magic_contamination * pct / 100));
        affected = true;
        break;

    case POT_AMBROSIA:
    {
        const int dur = max(2, (3 + random2(8)) * pct / 100);
        if (confuse_player(dur, false, true))
        {
            you.increase_duration(DUR_AMBROSIA, dur);
            affected = true;
        }
        break;
    }

    case POT_INVISIBILITY:
        if (invis_allowed(true))
        {
            you.increase_duration(DUR_INVIS, max(5, (15 + random2(20)) * pct / 100), 100);
            contaminate_player(random_range(350, 550) * pct / 100, true);
            affected = true;
        }
        break;

    case POT_MOONSHINE:
        if (!you.has_mutation(MUT_CLARITY))
        {
            you.increase_duration(DUR_VERTIGO, max(5, random_range(12, 24) * pct / 100), 50);
            confuse_player(max(2, random_range(3, 7) * pct / 100), true);
            affected = true;
        }
        break;

    case POT_DECAY:
        if (you.holiness() & (MH_NATURAL | MH_DEMONIC))
        {
            you.drain(&you, false, max(10, 30 * pct / 100));
            affected = true;
        }
        break;

    case POT_WATER:
        if (you.duration[DUR_STICKY_FLAME])
        {
            you.duration[DUR_STICKY_FLAME] = 0;
            if (is_self)
                mpr("The water extinguishes the liquid flames!");
            affected = true;
        }
        break;

    case POT_EXPERIENCE:
    {
        const int xp_pool = 350 * you.experience_level * pct / 100;
        if (is_self)
            skill_menu(SKMF_EXPERIENCE, xp_pool);
        else
            you.exp_available += xp_pool;
        affected = true;
        break;
    }

    case POT_BERSERK_RAGE:
        if (you.can_go_berserk(false, true, false))
        {
            you.go_berserk(false, true);
            you.duration[DUR_BERSERK] = max(50, you.duration[DUR_BERSERK] * pct / 100);
            affected = true;
        }
        break;

    case POT_MUTATION:
        mutate(RANDOM_MUTATION, "thrown potion of mutation", true, false, false, false, MUTCLASS_NORMAL);
        contaminate_player(random_range(500, 900) * pct / 100, true);
        affected = true;
        break;

    case POT_RESISTANCE:
        you.increase_duration(DUR_RESISTANCE, max(6, (35 + random2(25)) * pct / 100));
        affected = true;
        break;

    case POT_LIGNIFY:
        if (transform(max(8, 30 * pct / 100), transformation::tree))
        {
            you.transform_uncancellable = true;
            affected = true;
        }
        break;

    case POT_EMPATHY:
        you.increase_duration(DUR_EMPATHY, max(8, (35 + random2(20)) * pct / 100), 100);
        affected = true;
        break;

    case POT_SOUL_AMBROSIA:
        inc_hp(max(4, random_range(8, 16) * pct / 100));
        inc_mp(max(2, random_range(3, 6) * pct / 100));
        you.increase_duration(DUR_SOUL_AMBROSIA, max(4, (12 + random2(8)) * pct / 100), 50);
        affected = true;
        break;

    case POT_CONCORD:
        you.increase_duration(DUR_CONCORD, max(8, (30 + random2(20)) * pct / 100), 100);
        affected = true;
        break;

    default:
        break;
    }

    return affected;
}

static bool _apply_monster_potion_splash(monster &mon, potion_type ptyp, int pct)
{
    if (!mon.alive())
        return false;

    switch (ptyp)
    {
    case POT_CURING:
    {
        const int heal = max(5, random_range(12, 24) * pct / 100);
        const bool had_ench = mon.has_ench(ENCH_POISON)
                              || mon.has_ench(ENCH_CONFUSION)
                              || mon.has_ench(ENCH_SLOW)
                              || mon.has_ench(ENCH_DAZED);
        const bool healed = mon.heal(heal);
        mon.del_ench(ENCH_POISON);
        mon.del_ench(ENCH_CONFUSION);
        mon.del_ench(ENCH_SLOW);
        mon.del_ench(ENCH_DAZED);
        if (healed || had_ench)
            simple_monster_message(mon, " is splashed with curing liquid!");
        return healed || had_ench;
    }

    case POT_HEAL_WOUNDS:
    {
        const int heal = max(10, random_range(30, 50) * pct / 100);
        if (mon.heal(heal))
        {
            simple_monster_message(mon, " is splashed with healing elixir and its wounds close!");
            return true;
        }
        return false;
    }

    case POT_HASTE:
        if (!mon.stasis())
        {
            mon.add_ench(mon_enchant(ENCH_HASTE, &you, random_range(200, 350) * pct / 100));
            simple_monster_message(mon, " begins moving faster!");
            return true;
        }
        return false;

    case POT_MIGHT:
        mon.add_ench(mon_enchant(ENCH_MIGHT, &you, random_range(200, 350) * pct / 100));
        simple_monster_message(mon, " looks stronger!");
        return true;

    case POT_BRILLIANCE:
        mon.add_ench(mon_enchant(ENCH_EMPOWERED_SPELLS, &you, random_range(200, 350) * pct / 100));
        simple_monster_message(mon, " magic is enhanced!", true);
        return true;

    case POT_ATTRACTION:
        if (!mon.is_stationary())
        {
            blink_other_close(&mon, you.pos());
            if (!mon.wont_attack())
                behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }
        return false;

    case POT_ENLIGHTENMENT:
    {
        const int dur = random_range(200, 350) * pct / 100;
        mon.add_ench(mon_enchant(ENCH_FLIGHT, &you, dur));
        mon.add_ench(mon_enchant(ENCH_STRONG_WILLED, &you, dur));
        simple_monster_message(mon, " is enlightened!");
        return true;
    }

    case POT_POISON:
        poison_monster(&mon, &you, pct >= 70 ? 2 : 1);
        behaviour_event(&mon, ME_WHACK, &you);
        return true;

    case POT_STRONG_POISON:
        poison_monster(&mon, &you, pct >= 70 ? 4 : 3);
        behaviour_event(&mon, ME_WHACK, &you);
        return true;

    case POT_SLOWING:
        if (!mon.stasis())
        {
            mon.add_ench(mon_enchant(ENCH_SLOW, &you, random_range(120, 220) * pct / 100));
            simple_monster_message(mon, " seems to slow down.");
            behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }
        return false;

    case POT_CANCELLATION:
        debuff_monster(mon);
        simple_monster_message(mon, " is splashed with cancelling liquid!");
        if (!mon.wont_attack())
            behaviour_event(&mon, ME_WHACK, &you);
        return true;

    case POT_AMBROSIA:
        mon.add_ench(mon_enchant(ENCH_CONFUSION, &you, random_range(60, 120) * pct / 100));
        mon.heal(max(4, mon.max_hit_points * pct / 500));
        simple_monster_message(mon, " looks bewildered and invigorated!");
        return true;

    case POT_INVISIBILITY:
        if (!mon.backlit())
        {
            mon.add_ench(mon_enchant(ENCH_INVIS, &you, random_range(180, 320) * pct / 100));
            simple_monster_message(mon, " flickers and fades from view!");
            return true;
        }
        return false;

    case POT_MOONSHINE:
        if (mon.holiness() & (MH_NATURAL | MH_DEMONIC))
        {
            mon.add_ench(mon_enchant(ENCH_CONFUSION, &you, random_range(60, 120) * pct / 100));
            mon.add_ench(mon_enchant(ENCH_DAZED, &you, random_range(80, 150) * pct / 100));
            simple_monster_message(mon, " stumbles dizzily!");
            behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }
        return false;

    case POT_DECAY:
        if (mon.res_negative_energy() < 3)
        {
            mon.drain(&you, false, max(10, 35 * pct / 100));
            const int dam = max(2, roll_dice(2, 6) * pct / 100);
            mon.hurt(&you, dam, BEAM_NEG);
            if (mon.alive())
            {
                simple_monster_message(mon, " withers in the foul liquid!");
                behaviour_event(&mon, ME_WHACK, &you);
            }
            return true;
        }
        return false;

    case POT_WATER:
        if (mon.has_ench(ENCH_STICKY_FLAME))
        {
            mon.del_ench(ENCH_STICKY_FLAME);
            simple_monster_message(mon, " liquid flames are extinguished!", true);
            return true;
        }
        return false;

    case POT_MIST:
        if (!mon.is_insubstantial())
        {
            mon.add_ench(mon_enchant(ENCH_INSUBSTANTIAL, &you, random_range(150, 280) * pct / 100));
            simple_monster_message(mon, " becomes momentarily insubstantial!");
            return true;
        }
        return false;

    case POT_EXPERIENCE:
        mon.heal(max(8, mon.max_hit_points / 3));
        mon.add_ench(mon_enchant(ENCH_MIGHT, &you, random_range(200, 350) * pct / 100));
        mon.add_ench(mon_enchant(ENCH_HASTE, &you, random_range(200, 350) * pct / 100));
        simple_monster_message(mon, " surges with newfound power!");
        return true;

    case POT_MAGIC:
        mon.del_ench(ENCH_ANTIMAGIC);
        mon.add_ench(mon_enchant(ENCH_EMPOWERED_SPELLS, &you, random_range(150, 250) * pct / 100));
        simple_monster_message(mon, " crackles with arcane energy!");
        return true;

    case POT_BERSERK_RAGE:
        if (mon.can_go_berserk())
        {
            mon.go_berserk(false);
            return true;
        }
        return false;

    case POT_MUTATION:
        if (mon.can_safely_mutate())
        {
            mon.malmutate(&you, "thrown potion of mutation");
            behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }
        return false;

    case POT_RESISTANCE:
        mon.add_ench(mon_enchant(ENCH_RESISTANCE, &you, random_range(200, 350) * pct / 100));
        simple_monster_message(mon, " is coated in a protective sheen!");
        return true;

    case POT_LIGNIFY:
        mon.add_ench(mon_enchant(ENCH_SLOW, &you, random_range(80, 150) * pct / 100));
        simple_monster_message(mon, " is entangled in woody roots!");
        behaviour_event(&mon, ME_WHACK, &you);
        return true;

    case POT_EMPATHY:
        if (mon.wont_attack())
            return mon.heal(max(5, random_range(10, 18) * pct / 100));
        else
        {
            mon.add_ench(mon_enchant(ENCH_LOWERED_WL, &you, random_range(150, 250) * pct / 100));
            mon.add_ench(mon_enchant(ENCH_DAZED, &you, random_range(60, 100) * pct / 100));
            simple_monster_message(mon, " reels from psychic empathy!");
            behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }

    case POT_SOUL_AMBROSIA:
        if (mon.wont_attack() && !(mon.holiness() & (MH_UNDEAD | MH_DEMONIC)))
        {
            if (mon.heal(max(8, random_range(14, 24) * pct / 100)))
            {
                simple_monster_message(mon, " is invigorated by golden ambrosia!");
                return true;
            }
            return false;
        }
        else if (mon.res_holy_energy() < 3)
        {
            const int dam = max(3, roll_dice(2, 9) * pct / 100);
            simple_monster_message(mon, " is seared by golden soul ambrosia!");
            mon.hurt(&you, dam, BEAM_HOLY);
            if (mon.alive())
                behaviour_event(&mon, ME_WHACK, &you);
            return true;
        }
        return false;

    case POT_CONCORD:
        if (mon.wont_attack())
        {
            mon.add_ench(mon_enchant(ENCH_MIGHT, &you, random_range(150, 250) * pct / 100));
            simple_monster_message(mon, " resonates with harmonic might!");
        }
        else
        {
            mon.add_ench(mon_enchant(ENCH_WEAK, &you, random_range(150, 250) * pct / 100));
            simple_monster_message(mon, " is weakened by discordant resonance!");
            behaviour_event(&mon, ME_WHACK, &you);
        }
        return true;

    default:
        return false;
    }
}

bool throw_potion(item_def &potion, dist *pre_target)
{
    ASSERT(potion.base_type == OBJ_POTIONS);

    string reason;
    if (!can_throw_potion(&reason))
    {
        mpr(reason);
        return false;
    }

    if (god_forbids_item(potion))
    {
        mprf(MSGCH_GOD, "%s forbids the use of this item.",
             uppercase_first(god_name(you.religion)).c_str());
        return false;
    }

    if (!check_warning_inscriptions(potion, OPER_FIRE))
        return false;

    const bool has_chemist = you.wearing(OBJ_JEWELLERY, AMU_CHEMISTRY, false, true);
    const int range = min((int)LOS_RADIUS, 5 + you.skill_rdiv(SK_THROWING) / 4);
    const int splash_radius = 1;
    const int base_pct = has_chemist ? 70 : 50;

    dist targ;
    if (pre_target)
        targ = *pre_target;

    if (you.confused())
    {
        do
        {
            targ.target.x = you.pos().x + random2(7) - 3;
            targ.target.y = you.pos().y + random2(7) - 3;
        } while (!in_bounds(targ.target) || cell_is_solid(targ.target));
        targ.isValid = true;
        targ.isCancel = false;
    }
    else if (targ.needs_targeting() || !in_bounds(targ.target))
    {
        targeter_smite hitfunc(&you, range, splash_radius, splash_radius, false);
        direction_chooser_args args;
        args.hitfunc = &hitfunc;
        args.restricts = DIR_TARGET;
        args.range = range;
        args.self = confirm_prompt_type::none;
        if (item_type_known(potion)
            && _is_offensive_thrown_potion(static_cast<potion_type>(potion.sub_type)))
        {
            args.mode = TARG_HOSTILE;
        }
        else
            args.mode = TARG_ANY;
        args.top_prompt = make_stringf("Throw: %s (splashes 3x3 for %d%% effect)",
                                       potion.name(DESC_INVENTORY, false).c_str(),
                                       base_pct);
        direction(targ, args);
        if (pre_target)
            *pre_target = targ;
        if (!targ.isValid || targ.isCancel)
            return false;
    }

    if (!in_bounds(targ.target)
        || grid_distance(you.pos(), targ.target) > range
        || !you.see_cell_no_trans(targ.target))
    {
        mpr("That is beyond your throwing range.");
        return false;
    }

    if (cell_is_solid(targ.target))
    {
        canned_msg(MSG_UNTHINKING_ACT);
        return false;
    }

    const bool was_known = item_type_known(potion);
    const potion_type ptyp = static_cast<potion_type>(potion.sub_type);

    mprf("You throw %s! It shatters on impact, splashing its contents!",
         potion.name(DESC_A, false, false, false).c_str());

    if (!was_known && you.see_cell(targ.target))
    {
        identify_item(potion);
        mprf("It was %s.", article_a(potion.name(DESC_QUALNAME)).c_str());
    }

    draw_ring_animation(targ.target, splash_radius, potion.get_colour(), WHITE, true, 15);
    noisy(4, targ.target, "You hear the shatter of breaking glass.", MID_PLAYER);

    vector<coord_def> splash_cells;
    for (explosion_iterator ei(targ.target, splash_radius); ei; ++ei)
        if (in_bounds(*ei) && !cell_is_solid(*ei))
            splash_cells.push_back(*ei);

    auto in_splash = [&splash_cells](const coord_def &p) -> bool
    {
        for (const coord_def &c : splash_cells)
            if (c == p)
                return true;
        return false;
    };

    if (ptyp == POT_MIST)
    {
        for (const coord_def &c : splash_cells)
            place_cloud(CLOUD_MIST, c, random_range(4, 8), &you);
    }

    if (ptyp == POT_SOUL_AMBROSIA && party::is_enabled())
        party::try_revive_downed_ghost_in_radius(targ.target, splash_radius, 25);

    if (ptyp == POT_TRANSFUSION)
    {
        // Equalize HP% partially (base_pct%) across all living players and monsters in the splash
        vector<int> player_slots;
        vector<monster*> splashed_mons;
        int total_hp_pct = 0;
        int actor_count = 0;

        if (party::is_enabled())
        {
            const player &active = party::get_player(party::active_slot());
            for (int s = 0; s < party::player_count(); ++s)
            {
                player &p = party::get_player(s);
                if (party::is_player_downed(s) || p.hp <= 0 || p.hp_max <= 0)
                    continue;
                if (p.where_are_you != active.where_are_you || p.depth != active.depth)
                    continue;
                if (in_splash(p.pos()))
                {
                    player_slots.push_back(s);
                    total_hp_pct += (p.hp * 100) / p.hp_max;
                    ++actor_count;
                }
            }
        }
        else if (in_splash(you.pos()) && you.hp > 0 && you.hp_max > 0)
        {
            player_slots.push_back(-1);
            total_hp_pct += (you.hp * 100) / you.hp_max;
            ++actor_count;
        }

        for (const coord_def &c : splash_cells)
        {
            monster *mon = monster_at(c);
            if (!mon || !mon->alive() || mon->max_hit_points <= 0)
                continue;
            if (party::is_enabled() && party::is_proxy_monster(*mon))
                continue;
            splashed_mons.push_back(mon);
            total_hp_pct += (mon->hit_points * 100) / mon->max_hit_points;
            ++actor_count;
        }

        if (actor_count > 0)
        {
            const int avg_hp_pct = total_hp_pct / actor_count;
            for (int s : player_slots)
            {
                if (s == -1 || (party::is_enabled() && s == party::active_slot()))
                {
                    const int cur_pct = (you.hp * 100) / max(1, you.hp_max);
                    const int new_pct = min(100, max(10, cur_pct + (avg_hp_pct - cur_pct) * base_pct / 100 + 8));
                    you.hp = min(you.hp_max, max(1, (you.hp_max * new_pct) / 100));
                    inc_mp(max(2, you.max_magic_points / 10));
                    you.redraw_hit_points = true;
                    mpr("The crimson transfusion mist balances your vitality!");
                }
                else if (party::is_enabled())
                {
                    party::scoped_player_context ctx(s);
                    const int cur_pct = (you.hp * 100) / max(1, you.hp_max);
                    const int new_pct = min(100, max(10, cur_pct + (avg_hp_pct - cur_pct) * base_pct / 100 + 8));
                    you.hp = min(you.hp_max, max(1, (you.hp_max * new_pct) / 100));
                    inc_mp(max(2, you.max_magic_points / 10));
                    party::sync_player_to_proxy(s);
                    mprf(MSGCH_RECOVERY, "%s is splashed by the transfusion mist!",
                         you.your_name.c_str());
                }
            }

            for (monster *mon : splashed_mons)
            {
                const int cur_pct = (mon->hit_points * 100) / max(1, mon->max_hit_points);
                const int new_pct = min(100, max(5, cur_pct + (avg_hp_pct - cur_pct) * base_pct / 100));
                const int target_hp = min(mon->max_hit_points, max(1, (mon->max_hit_points * new_pct) / 100));
                if (target_hp > mon->hit_points)
                {
                    mon->heal(target_hp - mon->hit_points);
                    simple_monster_message(*mon, " absorbs vitality from the transfusion splash!");
                }
                else if (target_hp < mon->hit_points)
                {
                    simple_monster_message(*mon, " has its vitality siphoned by the transfusion splash!");
                    mon->hurt(&you, mon->hit_points - target_hp, BEAM_NEG);
                    if (mon->alive())
                        behaviour_event(mon, ME_WHACK, &you);
                }
            }
        }
    }
    else
    {
        // Apply splash to players (thrower and/or co-op teammates in splash)
        if (party::is_enabled())
        {
            const player &active = party::get_player(party::active_slot());
            for (int s = 0; s < party::player_count(); ++s)
            {
                player &p = party::get_player(s);
                if (party::is_player_downed(s) || p.hp <= 0)
                    continue;
                if (p.where_are_you != active.where_are_you || p.depth != active.depth)
                    continue;
                if (!in_splash(p.pos()))
                    continue;

                if (s == party::active_slot())
                {
                    if (_apply_player_potion_splash(ptyp, base_pct, true))
                        mpr("You are splashed by the shattering potion!");
                }
                else
                {
                    bool affected = false;
                    {
                        party::scoped_player_context ctx(s);
                        affected = _apply_player_potion_splash(ptyp, base_pct, false);
                    }
                    if (affected)
                    {
                        party::sync_player_to_proxy(s);
                        mprf(MSGCH_RECOVERY, "%s is splashed by your thrown potion!",
                             p.your_name.c_str());
                    }
                }
            }
        }
        else if (in_splash(you.pos()))
        {
            if (_apply_player_potion_splash(ptyp, base_pct, true))
                mpr("You are splashed by the shattering potion!");
        }

        // Apply splash to monsters (both allied and hostile) in splash
        for (const coord_def &c : splash_cells)
        {
            monster *mon = monster_at(c);
            if (!mon || !mon->alive())
                continue;
            if (party::is_enabled() && party::is_proxy_monster(*mon))
                continue;
            _apply_monster_potion_splash(*mon, ptyp, base_pct);
        }
    }

    if (has_chemist && you.magic_points < you.max_magic_points)
    {
        mpr("You extract a trace of magical energy from the alchemical reaction.");
        inc_mp(random_range(2, 5));
    }

    practise_throwing(MI_STONE);
    you.time_taken = you.attack_delay().roll();
    you.turn_is_over = true;
    dec_inv_item_quantity(potion.link, 1);

    if (party::is_enabled())
        party::sync_shared_state_from_active();

    return true;
}
