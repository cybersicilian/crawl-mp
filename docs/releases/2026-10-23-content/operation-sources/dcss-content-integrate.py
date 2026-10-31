from pathlib import Path
root=Path('/Users/iancaltabiano/Documents/Projects/dcss/crawl-ref/source')
def change(name, old, new):
    p=root/name
    s=p.read_text()
    assert s.count(old)==1,(name,old[:100],s.count(old))
    p.write_text(s.replace(old,new))
def include(name, header):
    change(name,'#include "AppHdr.h"','#include "AppHdr.h"\n#include "'+header+'"')
for name in ['ability.cc','player.cc','player-reacts.cc','mon-death.cc','monster.cc','stairs.cc','spl-goditem.cc','god-passive.cc','melee-attack.cc']:
    include(name,'eldritch.h')
for name in ['ability.cc','player-reacts.cc','mon-act.cc','monster.cc','stairs.cc','bloodcraft-curses.cc']:
    include(name,'chain-devil.h')
change('ability.cc','    return Ability_List;','''    static const bool echo_definitions = [&]() {
        for (const auto& row : eldritch::powers())
            if (!row.passive)
                Ability_List.push_back({eldritch::ability(row.god), row.name,
                    0, 0, 0, row.range, {}, abflag::silence_ok});
        return true;
    }();
    (void)echo_definitions;
    return Ability_List;''')
change('ability.cc','        { ABIL_ASSIMILATE, "Assimilate",','''        { ABIL_CHAIN_LASH, "Chain Lash", 0, 0, 0, 3, {},
            abflag::silence_ok | abflag::dir_or_target | abflag::not_self },
        { ABIL_REEL_IN, "Reel In", 0, 0, 0, -1, {}, abflag::silence_ok },
        { ABIL_PINNING_CHAIN, "Pinning Chain", 0, 0, 0, -1, {}, abflag::silence_ok },
        { ABIL_RELEASE_CHAIN, "Release Chain", 0, 0, 0, -1, {},
            abflag::silence_ok | abflag::instant | abflag::conf_ok | abflag::berserk_ok },
        { ABIL_PROFANE_ALTAR, "Profane Altar", 0, 0, 0, -1, {}, abflag::none },
        { ABIL_ELDER_RITE, "Invoke Elder Rites", 0, 0, 0, -1, {}, abflag::none },
        { ABIL_ASSIMILATE, "Assimilate",''')
change('ability.cc','bool player_has_ability(ability_type abil, bool include_unusable)\n{','''bool player_has_ability(ability_type abil, bool include_unusable)
{
    if (eldritch::is_ability(abil))
    {
        if (you.species != SP_ELDRITCH)
            return false;
        return abil == ABIL_PROFANE_ALTAR || abil == ABIL_ELDER_RITE
            || eldritch::has(eldritch::god_for_ability(abil));
    }
    if (abil >= ABIL_CHAIN_LASH && abil <= ABIL_RELEASE_CHAIN)
        return you.species == SP_CHAIN_DEVIL
            && (include_unusable || chains::has_body(you))
            && (abil != ABIL_REEL_IN || you.experience_level >= 7)
            && (abil != ABIL_PINNING_CHAIN || you.experience_level >= 13);''')
change('ability.cc','static bool _check_ability_possible(const ability_def& abil, bool quiet = false)\n{','''static bool _check_ability_possible(const ability_def& abil, bool quiet = false)
{
    if (eldritch::is_ability(abil.ability)
        || (abil.ability >= ABIL_CHAIN_LASH && abil.ability <= ABIL_RELEASE_CHAIN))
    {
        const auto reason = eldritch::is_ability(abil.ability)
            ? eldritch::reason(abil.ability) : chains::reason(abil.ability);
        if (!quiet && !reason.empty())
            mpr(reason);
        if (!reason.empty())
            return false;
    }''')
change('ability.cc','const string make_cost_description(ability_type ability)\n{','''const string make_cost_description(ability_type ability)
{
    if (eldritch::policy(eldritch::god_for_ability(ability)))
        return make_stringf("%d Defiance", eldritch::cost(eldritch::god_for_ability(ability)));''')
change('ability.cc','''    // Note: the costs will not be applied until after this switch
''','''    if (eldritch::is_ability(abil.ability))
        return eldritch::invoke(abil.ability, target);
    if (abil.ability >= ABIL_CHAIN_LASH && abil.ability <= ABIL_RELEASE_CHAIN)
        return chains::invoke(abil.ability, target);
    // Note: the costs will not be applied until after this switch
''')
change('ability.cc','            ABIL_ASSIMILATE,','''            ABIL_ASSIMILATE,
            ABIL_CHAIN_LASH,
            ABIL_REEL_IN,
            ABIL_PINNING_CHAIN,
            ABIL_RELEASE_CHAIN,
            ABIL_PROFANE_ALTAR,
            ABIL_ELDER_RITE,''')
change('ability.cc','    for (ability_type abil : get_god_abilities(ignore_piety, include_unusable))','''    for (const auto& row : eldritch::powers())
        if (!row.passive && eldritch::has(row.god))
            _add_talent(talents, eldritch::ability(row.god));

    for (ability_type abil : get_god_abilities(ignore_piety, include_unusable))''')
change('ability.cc','    lookup += "\\n";\n\n    if (damage_str != "")','''    if (const auto* row = eldritch::policy(eldritch::god_for_ability(ability)))
        lookup = std::string(row->benefit) + "\\nWrath: " + row->punishment;
    lookup += "\\n";

    if (damage_str != "")''')
change('mon-act.cc','''    const coord_def targ = mons->pos() + delta;
''','''    const coord_def targ = mons->pos() + delta;
    if (!chains::may_step(*const_cast<monster*>(mons), targ))
        return false;
''')
change('mon-act.cc','''    if (mons.is_constricted() && !mons.cannot_move())''','''    if (!chains::may_step(mons, f))
    {
        chains::strain(mons);
        _swim_or_move_energy(mons);
        return true;
    }

    if (mons.is_constricted() && !mons.cannot_move())''')
change('monster.cc','''    actor* a = actor_at(newpos);
''','''    if ((mvflags & MV_DELIBERATE) && !chains::may_step(*this, newpos))
        return false;
    actor* a = actor_at(newpos);
''')
change('monster.cc','''        vorr::on_damage(*this, agent, vorr_hp_before, amount, vorr_force);''','''        vorr::on_damage(*this, agent, vorr_hp_before, amount, vorr_force);
        eldritch::on_damage(*this, agent, amount);''')
change('bloodcraft-curses.cc','''        && !bound(*mon) && !binding_recovery(*mon);''','''        && !bound(*mon) && !binding_recovery(*mon) && !chains::held(*mon);''')
change('player-reacts.cc','''    unrand_reacts();''','''    chains::refresh();
    eldritch::tick();
    unrand_reacts();''')
change('stairs.cc','''    bloodcraft::clear_curses();''','''    chains::release(you);
    eldritch::leave_floor();
    bloodcraft::clear_curses();''')
change('player.cc','''    _handle_xp_penance(exp_gained);''','''    eldritch::recover(exp_gained);
    _handle_xp_penance(exp_gained);''')
change('player.cc','''    int level = actual_skill * scale
      + get_skill_progress(sk, actual_skill, effective_points, scale);''','''    int level = actual_skill * scale
      + get_skill_progress(sk, actual_skill, effective_points, scale);''')
change('player.cc','''    if (include_temp && duration[DUR_HEROISM] && sk <= SK_LAST_MUNDANE)''','''    level += eldritch::skill_bonus(*this, sk, include_temp) * scale;

    if (include_temp && duration[DUR_HEROISM] && sk <= SK_LAST_MUNDANE)''')
change('player.cc','''    shield += qazlal_sh_boost() * 100;''','''    if (include_temp)
        shield += eldritch::shield_bonus(you) * 200;
    shield += qazlal_sh_boost() * 100;''')
change('player.cc','''    if (duration[DUR_FIERY_ARMOUR])
        AC += 700;''','''    AC += eldritch::armour_bonus(*this) * 100;
    if (duration[DUR_FIERY_ARMOUR])
        AC += 700;''')
change('player.cc','''    const int old_hp = you.hp;
    you.hp += hp_gain;''','''    if (you.duration[DUR_ELDER_HEAL_DRAIN])
        hp_gain = div_rand_round(hp_gain, 2);
    const int old_hp = you.hp;
    you.hp += hp_gain;''')
change('spl-goditem.cc','''    // Kiku protects you from torment to a degree.''','''    hploss -= hploss * eldritch::torment_reduction() / 100;

    // Kiku protects you from torment to a degree.''')
change('mon-death.cc','''    vorr::on_kill(mons, killer, gives_player_xp, pet_kill);''','''    vorr::on_kill(mons, killer, gives_player_xp, pet_kill);
    eldritch::on_kill(mons, killer, gives_player_xp, pet_kill);''')
