#include "AppHdr.h"

#include "archaeologist.h"

#include "artefact.h"
#include "art-enum.h"
#include "coop-content.h"
#include "item-name.h"
#include "item-prop.h"
#include "items.h"
#include "makeitem.h"
#include "message.h"
#include "ng-setup.h"
#include "party.h"
#include "player.h"
#include "player-equip.h"
#include "random.h"
#include "skills.h"
#include "state.h"
#include "stringutil.h"

namespace archaeologist
{
namespace
{
const char* const OWNER = "archaeologist_owner";
const char* const UNRAND = "archaeologist_unrand";
const char* const SKILL = "archaeologist_skill";
const char* const REMAINING = "archaeologist_remaining";
const char* const PHASE = "archaeologist_phase";
enum quest_phase { awaiting_tome = 1, studying, complete, claimed };
constexpr int TOME_POINTS = 700;

player* owner_of(const item_def& item)
{
    if (!item.props.exists(OWNER))
        return nullptr;
    const mid_t mid = static_cast<mid_t>(item.props[OWNER].get_int());
    if (mid == you.mid)
        return &you;
    return party::player_by_mid(mid);
}

bool belongs_to(const item_def& item, const player& owner, misc_item_type kind)
{
    return item.is_type(OBJ_MISCELLANY, kind) && item.props.exists(OWNER)
           && static_cast<mid_t>(item.props[OWNER].get_int()) == owner.mid;
}

skill_type usable_skill(const item_def& item)
{
    skill_type preferred = SK_FIGHTING;
    if (item.base_type == OBJ_WEAPONS || item.base_type == OBJ_STAVES)
        preferred = item_attack_skill(item);
    else if (item.base_type == OBJ_ARMOUR)
        preferred = is_shield(item) ? SK_SHIELDS : SK_ARMOUR;
    else if (item.base_type == OBJ_JEWELLERY)
        preferred = SK_SPELLCASTING;
    if (!is_invalid_skill(preferred) && !is_useless_skill(preferred, false))
        return preferred;
    for (skill_type skill : {SK_FIGHTING, SK_DODGING, SK_SPELLCASTING, SK_EVOCATIONS})
        if (!is_useless_skill(skill, false))
            return skill;
    return SK_NONE;
}

skill_type fallback_skill(skill_type excluded)
{
    for (skill_type candidate : {SK_FIGHTING, SK_DODGING, SK_SPELLCASTING,
                                 SK_EVOCATIONS, SK_STEALTH})
        if (candidate != excluded && !is_useless_skill(candidate)
            && you.skills[candidate] < MAX_SKILL_LEVEL)
            return candidate;
    return SK_NONE;
}

void sync_reservation(int index, unique_item_status_type status)
{
    // Party setup copies unique_items from slot 0 before creating each member;
    // publish each reservation immediately so later members cannot duplicate it.
    you.unique_items[index - UNRAND_START] = status;
    if (party::is_enabled())
        for (int slot = 0; slot < party::player_count(); ++slot)
            party::get_player(slot).unique_items[index - UNRAND_START] = status;
}

bool decipher(player& owner, const item_def& tome)
{
    if (!belongs_to(tome, owner, MISC_DUSTY_TOME)
        || !owner.props.exists(PHASE) || owner.props[PHASE].get_int() != awaiting_tome
        || owner.experience_level < 3)
        return false;
    const int owner_slot = party::slot_for_mid(owner.mid);
    if (owner_slot < 0)
        return false;
    party::scoped_player_context context(owner_slot);
    skill_type skill = static_cast<skill_type>(owner.props[SKILL].get_int());
    if (is_invalid_skill(skill) || is_useless_skill(skill)
        || owner.skills[skill] >= MAX_SKILL_LEVEL)
    {
        skill = fallback_skill(skill);
        if (skill == SK_NONE)
            return false;
        owner.props[SKILL] = static_cast<int>(skill);
    }
    owner.skill_manual_points[skill] += TOME_POINTS;
    if (owner.train[skill] == TRAINING_DISABLED)
        owner.train[skill] = TRAINING_ENABLED;
    reset_training();
    owner.props[REMAINING] = TOME_POINTS;
    owner.props[PHASE] = studying;
    mprf("You decipher the dusty tome. Study %s to unlock its crate.",
         skill_name(skill));
    return true;
}

bool open_crate(player& owner, item_def& crate)
{
    if (!belongs_to(crate, owner, MISC_ANCIENT_CRATE)
        || !owner.props.exists(PHASE) || owner.props[PHASE].get_int() != complete
        || !owner.props.exists(UNRAND))
        return false;
    const int index = owner.props[UNRAND].get_int();
    if (index <= UNRAND_START || index >= UNRAND_LAST)
        return false;
    const int owner_slot = party::slot_for_mid(owner.mid);
    if (owner_slot < 0)
        return false;
    party::scoped_player_context context(owner_slot);
    // The sealed crate owns an explicit reservation, not a generated item.
    // Work on a copy so a failed conversion retains its owner and identity.
    const unique_item_status_type reserved = get_unique_item_status(index);
    if (reserved != UNIQ_EXISTS)
        return false;
    item_def revealed = crate;
    revealed.props.erase(OWNER);
    const unrandart_entry* entry = get_unrand_entry(index);
    if (!entry || entry->base_type == OBJ_UNASSIGNED)
        return false;
    revealed.base_type = entry->base_type;
    revealed.sub_type = entry->sub_type;
    if (!make_item_unrandart(revealed, index))
    {
        sync_reservation(index, reserved);
        return false;
    }
    item_colour(revealed);
    item_set_appearance(revealed);
    crate = std::move(revealed);
    owner.props[PHASE] = claimed;
    sync_reservation(index, get_unique_item_status(index));
    mprf("The ancient crate opens, revealing %s!", crate.name(DESC_A).c_str());
    return true;
}

void open_held_crate(player& owner)
{
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        player& holder = party::get_player(slot);
        for (item_def& item : holder.inv)
            if (open_crate(owner, item))
            {
                if (holder.mid != owner.mid)
                {
                    party::scoped_player_context context(slot);
                    mprf("The crate you carry opens, revealing %s!",
                         item.name(DESC_A).c_str());
                }
                return;
            }
    }
}
}

void start_quest()
{
    if (you.props.exists(PHASE))
        return;
    int selected = -1;
    skill_type chosen_skill = SK_NONE;
    int seen = 0;
    for (int index = UNRAND_START + 1; index < UNRAND_LAST; ++index)
    {
        const unrandart_entry* entry = get_unrand_entry(index);
        if (!entry || entry->base_type == OBJ_UNASSIGNED
            || entry->flags & (UNRAND_FLAG_NOGEN | UNRAND_FLAG_DELETED | UNRAND_FLAG_SPECIAL)
            || get_unique_item_status(index) != UNIQ_NOT_EXISTS
            || (!coop_content::enabled() && coop_content::exclusive_unrand(index)))
            continue;
        item_def candidate;
        candidate.base_type = entry->base_type;
        candidate.sub_type = entry->sub_type;
        candidate.quantity = 1;
        if (!can_equip_item(candidate, false))
            continue;
        const skill_type skill = usable_skill(candidate);
        if (skill == SK_NONE)
            continue;
        if (one_chance_in(++seen))
        {
            selected = index;
            chosen_skill = skill;
        }
    }
    if (selected < 0)
    {
        mpr("No suitable relic could be reserved for your expedition.");
        return;
    }
    item_def* crate = newgame_make_item(OBJ_MISCELLANY, MISC_ANCIENT_CRATE);
    item_def* tome = newgame_make_item(OBJ_MISCELLANY, MISC_DUSTY_TOME);
    if (!crate || !tome)
    {
        if (crate)
            crate->clear();
        if (tome)
            tome->clear();
        return;
    }
    crate->props[OWNER] = static_cast<int>(you.mid);
    tome->props[OWNER] = static_cast<int>(you.mid);
    you.props[UNRAND] = selected;
    you.props[SKILL] = static_cast<int>(chosen_skill);
    you.props[REMAINING] = 0;
    you.props[PHASE] = awaiting_tome;
    sync_reservation(selected, UNIQ_EXISTS);
}

void on_level_change()
{
    if (!you.props.exists(PHASE) || you.props[PHASE].get_int() != awaiting_tome
        || you.experience_level < 3)
        return;
    player& owner = you;
    for (int slot = 0; slot < party::player_count(); ++slot)
    {
        player& holder = party::get_player(slot);
        for (int i = 0; i < ENDOFPACK; ++i)
        {
            item_def& tome = holder.inv[i];
            if (!decipher(owner, tome))
                continue;
            party::scoped_player_context context(slot);
            if (holder.mid != owner.mid)
                mpr("The tome's owner deciphers it, and its pages crumble.");
            dec_inv_item_quantity(i, 1);
            return;
        }
    }
    mpr("You can now decipher your dusty tome when you recover it.");
}

bool on_pickup(item_def& item)
{
    player* owner = owner_of(item);
    if (!owner)
        return false;
    if (decipher(*owner, item))
    {
        if (owner->mid != you.mid)
            mpr("The tome's owner deciphers it, and its pages crumble.");
        return true;
    }
    open_crate(*owner, item);
    return false;
}

void on_manual_training(skill_type skill, int bonus)
{
    if (crawl_state.simulating_xp_gain || bonus <= 0
        || !you.props.exists(PHASE) || you.props[PHASE].get_int() != studying
        || !you.props.exists(SKILL) || you.props[SKILL].get_int() != static_cast<int>(skill))
        return;
    int& remaining = you.props[REMAINING].get_int();
    remaining = max(0, remaining - bonus);
    if (!remaining)
    {
        you.props[PHASE] = complete;
        mpr("You understand the ancient crate's lock.");
        open_held_crate(you);
    }
}

void on_skill_maxed(skill_type skill)
{
    if (crawl_state.simulating_xp_gain || !you.props.exists(PHASE)
        || you.props[PHASE].get_int() != studying
        || you.props[SKILL].get_int() != static_cast<int>(skill))
        return;
    const int remaining = you.props[REMAINING].get_int();
    const skill_type next = fallback_skill(skill);
    if (next == SK_NONE || next == skill || remaining <= 0
        || you.skill_manual_points[skill] < static_cast<unsigned>(remaining))
        return;
    you.skill_manual_points[skill] -= remaining;
    you.skill_manual_points[next] += remaining;
    you.props[SKILL] = static_cast<int>(next);
    if (you.train[next] == TRAINING_DISABLED)
        you.train[next] = TRAINING_ENABLED;
    mprf("Your tome's remaining lessons turn to %s.", skill_name(next));
}

void reconcile_training()
{
    if (crawl_state.simulating_xp_gain || !you.props.exists(PHASE)
        || you.props[PHASE].get_int() != studying || !you.props.exists(SKILL))
        return;
    const skill_type skill = static_cast<skill_type>(you.props[SKILL].get_int());
    if (!is_invalid_skill(skill)
        && (is_useless_skill(skill) || you.skills[skill] >= MAX_SKILL_LEVEL))
        on_skill_maxed(skill);
}

std::string item_description(const item_def& item)
{
    if (!item.is_type(OBJ_MISCELLANY, MISC_ANCIENT_CRATE)
        && !item.is_type(OBJ_MISCELLANY, MISC_DUSTY_TOME))
        return "";
    const player* owner = owner_of(item);
    if (!owner || !owner->props.exists(PHASE))
        return "Its original owner is unavailable.";
    string text = make_stringf("This quest belongs to %s.", owner->your_name.c_str());
    const int phase = owner->props[PHASE].get_int();
    if (phase == awaiting_tome)
        return text + " The tome can be deciphered at experience level 3; recover it if it is elsewhere.";
    if (phase == complete)
        return text + " The crate is ready to open when recovered.";
    if (phase == claimed)
        return text + " The relic has already been recovered.";
    const skill_type skill = static_cast<skill_type>(owner->props[SKILL].get_int());
    return text + make_stringf(" Study %s: %d of 700 bonus training points remain.",
                               skill_name(skill), owner->props[REMAINING].get_int());
}
}
