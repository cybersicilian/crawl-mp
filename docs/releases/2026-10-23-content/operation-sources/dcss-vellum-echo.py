from pathlib import Path
r=Path('/Users/iancaltabiano/Documents/Projects/dcss/crawl-ref/source')
def edit(n,a,b):
 p=r/n;s=p.read_text();assert s.count(a)==1,(n,a[:100],s.count(a));p.write_text(s.replace(a,b))
for n in ['god-vellum-policy.cc','god-vellum-work.cc','god-vellum-menu.cc','oozle-memory-effects.cc']:
 edit(n,'#include "AppHdr.h"','#include "AppHdr.h"\n#include "eldritch.h"')
edit('eldritch.h','spret invoke_power(god_type god, dist* target);','spret invoke_power(god_type god, dist* target);\nspret borrow_thread();')
edit('god-vellum.h','    std::string fingerprint;','    std::string fingerprint;\n    int defiance_cost = 0;')
edit('god-vellum-policy.cc','return owner.religion == GOD_VELLUM && !owner.penance[GOD_VELLUM];','return (owner.religion == GOD_VELLUM && !owner.penance[GOD_VELLUM])\n        || (eldritch::has(owner, GOD_VELLUM) && !owner.duration[DUR_ELDER_UNRAVEL]);')
edit('god-vellum-policy.cc','int rank(const player& owner)\n{','int rank(const player& owner)\n{\n    if (eldritch::has(owner, GOD_VELLUM))\n        return 6; // Echo eligibility is separately limited by one thread and its weight.')
edit('god-vellum-policy.cc','return min(maximum_capacity, 1 + rank(owner));','return eldritch::has(owner, GOD_VELLUM) ? 1 + eldritch::rank(owner)\n        : min(maximum_capacity, 1 + rank(owner));')
edit('god-vellum-policy.cc','''    if (!is_artefact(item) || !price(magic))''','''    if (eldritch::has(GOD_VELLUM)
        && (!is_random_artefact(item) || magic.kind != enchantment_transfer::effect_kind::property
            || magic.value <= 0 || enchantment_transfer::drawback(magic)
            || price(magic) > 1 + eldritch::rank()))
        return "Borrowed Thread needs a whole positive randart property within your rite weight limit.";
    if (!is_artefact(item) || !price(magic))''')
edit('god-vellum-policy.cc','''    if (!price(magic))
        return "This property is not transferable.";''','''    if (eldritch::has(GOD_VELLUM) && !is_random_artefact(item))
        return "Borrowed Thread requires a compatible random artefact recipient.";
    if (!price(magic))
        return "This property is not transferable.";''')
edit('god-vellum-work.cc','''    if (result.blocked.empty())
        result.blocked = removal_reason(selected);''','''    if (result.blocked.empty() && eldritch::has(GOD_VELLUM))
    {
        int live = 0;
        for (const auto& thread : next.threads)
            live += thread.target >= 0;
        if (work.action == operation::starter || work.action == operation::masterwork
            || (work.action == operation::extract && live))
            result.blocked = "Borrowed Thread permits exactly one retained thread; sever it before replacing it.";
    }
    if (result.blocked.empty())
        result.blocked = removal_reason(selected);''')
edit('god-vellum-work.cc','''&& fresh.revision == prepared.revision && fresh.cost == prepared.cost''','''&& fresh.revision == prepared.revision && fresh.cost == prepared.cost
        && fresh.defiance_cost == prepared.defiance_cost''')
edit('god-vellum-work.cc','''    if (result.blocked.empty() && result.cost && you.piety() <= result.cost)''','''    if (eldritch::has(GOD_VELLUM))
    {
        result.defiance_cost = work.action == operation::extract || work.action == operation::bind ? 20 : 0;
        result.cost = 0;
        if (result.blocked.empty() && eldritch::reserve(you) < result.defiance_cost)
            result.blocked = "Borrowed Thread requires 20 Defiance.";
    }
    if (result.blocked.empty() && result.cost && you.piety() <= result.cost)''')
edit('god-vellum-work.cc','''    if (!prepare(fresh, next))
        return false;
    const int old_mp''','''    if (!prepare(fresh, next))
        return false;
    if (prepared.defiance_cost && !eldritch::spend(prepared.defiance_cost))
        return false;
    const int old_mp''')
p=r/'god-vellum-work.cc';s=p.read_text().replace('no enchantments or piety were spent','no enchantments or resources were spent');p.write_text(s)
edit('god-vellum-menu.cc','spret invoke(int source_slot)\n{','spret invoke(int source_slot)\n{\n    if (eldritch::has(GOD_VELLUM))\n        return eldritch::borrow_thread();')
edit('oozle-memory-effects.cc','''    const auto native = item ? get_weapon_brand(*item) : SPWPN_NORMAL;''','''    if (owner.is_player() && item && owner.as_player()->duration[DUR_ELDER_CHAOS]
        && owner.as_player()->props.exists("eldritch_chaos_weapon")
        && vellum::item_id(*item) == owner.as_player()->props["eldritch_chaos_weapon"].get_int())
        return SPWPN_CHAOS;
    const auto native = item ? get_weapon_brand(*item) : SPWPN_NORMAL;''')
edit('duration-type.h','    DUR_ELDER_HEAL_DRAIN,','    DUR_ELDER_HEAL_DRAIN,\n    DUR_ELDER_CHAOS,')
edit('Makefile.obj','eldritch-rites.o \\','eldritch-rites.o \\\neldritch-equipment.o \\')
