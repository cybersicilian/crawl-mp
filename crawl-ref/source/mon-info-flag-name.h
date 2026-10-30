#pragma once

#include <vector>

#include "mon-info.h"
#include "tag-version.h"

using std::vector;

struct monster_info_flag_name
{
    monster_info_flags flag;
    string short_singular; // HUD display (empty to not show)
    string long_singular; // Targeter display
    string plural; // HUD display in groups (empty to not show)
    monster_condition_kind kind = monster_condition_kind::neutral;
};

// This vector is in display order. Roughly:
// - Attitudes and summon status
// - Bad things for the player (most buffs)
// - Vulnerabilities
// - Debuffs
// - Ally-only buffs
static const vector<monster_info_flag_name> monster_info_flag_names = {
    // Attitudes
    { MB_CHARMED, "charmed", "charmed", "charmed"},
    { MB_HEXED, "hexed", "control wrested from you", "hexed"},
    { MB_ABJURABLE, "summoned", "summoned", "summoned"},
    { MB_MINION, "minion", "minion", "minion"},
    { MB_UNREWARDING, "", "unrewarding", ""},
    { MB_WANDERING, "wandering", "wandering", "wandering"},
    // Bad things for the player
    { MB_MESMERIZING, "mesmerising", "mesmerising", "mesmerising"},
    { MB_BERSERK, "berserk", "berserk", "berserk", monster_condition_kind::beneficial },
    { MB_HASTED, "fast", "fast", "fast", monster_condition_kind::beneficial },
    { MB_ROLLING, "rolling", "rolling", "rolling"},
    { MB_INNER_FLAME, "inner flame", "inner flame", "inner flame"},
    { MB_MIRROR_DAMAGE, "reflects damage", "reflecting injuries", "reflect damage", monster_condition_kind::beneficial },
    { MB_BOUND_SOUL, "soul bound", "soul bound", "souls bound", monster_condition_kind::beneficial },
    { MB_STRONG, "strong", "strong", "strong", monster_condition_kind::beneficial },
    { MB_EMPOWERED_SPELLS, "empowered", "spells empowered", "empowered", monster_condition_kind::beneficial },
    { MB_FULLY_CHARGED, "charged", "fully charged", "charged"},
    { MB_PARTIALLY_CHARGED, "charging", "partially charged", "charging"},
    { MB_AGILE, "agile", "unusually agile", "agile", monster_condition_kind::beneficial },
    { MB_SWIFT, "swift", "covering ground quickly", "swift", monster_condition_kind::beneficial },
#if TAG_MAJOR_VERSION == 34
    { MB_PURSUING, "pursuing", "pursuing quickly", "pursuing"},
#endif
    { MB_STILL_WINDS, "stilling wind", "stilling the winds", "stilling wind"},
    { MB_SILENCING, "silencing", "radiating silence", "silencing"},
    { MB_READY_TO_HOWL, "can howl", "ready to howl", "can howl"},
    { MB_VORTEX, "vortex", "surrounded by a freezing vortex", "vortices"},
    { MB_VORTEX_COOLDOWN, "gusty", "surrounded by restless winds", "gusty"},
    { MB_FRENZIED, "frenzied", "frenzied and wild", "frenzied", monster_condition_kind::beneficial },
    { MB_FEAR_INSPIRING, "scary", "inspiring fear", "scary"},
    { MB_WORD_OF_RECALL, "chanting recall", "chanting recall", "chanting recall"},
    { MB_DEFLECT_MSL, "deflects missiles", "deflecting missiles", "deflect missiles", monster_condition_kind::beneficial },
    { MB_TOXIC_RADIANCE, "toxic aura", "radiating toxic energy", "toxic auras"},
    { MB_CONCENTRATE_VENOM, "curare", "concentrated venom", "curare" },
    { MB_SIGN_OF_RUIN, "sign of ruin", "marked with the sign of ruin", "signs of ruin"},
    { MB_RESISTANCE, "resistant", "unusually resistant", "resistant", monster_condition_kind::beneficial },
    { MB_INVISIBLE, "invisible", "slightly transparent", "invisible", monster_condition_kind::beneficial },
    { MB_REGENERATION, "regenerating", "regenerating", "regenerating", monster_condition_kind::beneficial },
    { MB_STRONG_WILLED, "strong-willed", "strong-willed", "strong-willed", monster_condition_kind::beneficial },
    { MB_INJURY_BOND, "sheltered", "sheltered from injuries", "sheltered", monster_condition_kind::beneficial },
    { MB_GOZAG_INCITED, "incited", "incited by Gozag", "incited", monster_condition_kind::beneficial },
    { MB_CLOUD_RING_THUNDER, "clouds", "surrounded by thunder", "clouds" },
    { MB_CLOUD_RING_FLAMES, "clouds", "surrounded by flames", "clouds" },
    { MB_CLOUD_RING_CHAOS, "clouds", "surrounded by chaotic energy", "clouds" },
    { MB_CLOUD_RING_MUTATION, "clouds", "surrounded by mutagenic energy", "clouds" },
    { MB_CLOUD_RING_FOG, "clouds", "surrounded by fog", "clouds" },
    { MB_CLOUD_RING_ICE, "clouds", "surrounded by freezing clouds", "clouds" },
    { MB_CLOUD_RING_MISERY, "clouds", "surrounded by negative energy", "clouds" },
    { MB_CLOUD_RING_ACID, "clouds", "surrounded by acidic fog", "clouds" },
    { MB_CLOUD_RING_MIASMA, "clouds", "surrounded by foul miasma", "clouds" },
    { MB_FIRE_CHAMPION, "flame-wreathed", "flame-wreathed", "flame-wreathed", monster_condition_kind::beneficial },
    { MB_SILENCE_IMMUNE, "unsilenced", "unaffected by silence", "unsilenced", monster_condition_kind::beneficial },
    { MB_DOUBLED_VIGOUR, "doubled vigour", "doubled in vigour", "doubled vigour", monster_condition_kind::beneficial },
    // Vulnerabilities
    { MB_POSSESSABLE, "soul-gripped", "soul-gripped", "soul-gripped", monster_condition_kind::harmful },
    { MB_CAUGHT, "caught", "entangled in a net", "caught", monster_condition_kind::harmful },
    { MB_WEBBED, "webbed", "entangled in a web", "webbed", monster_condition_kind::harmful },
    { MB_PARALYSED, "paralysed", "paralysed", "paralysed", monster_condition_kind::harmful },
    { MB_PETRIFIED, "petrified", "petrified", "petrified", monster_condition_kind::harmful },
    { MB_CONFUSED, "confused", "confused", "confused", monster_condition_kind::harmful },
    { MB_DORMANT, "dormant", "dormant", "dormant", monster_condition_kind::harmful },
    { MB_SLEEPING, "asleep", "asleep", "asleep", monster_condition_kind::harmful },
    { MB_UNAWARE, "unaware", "unaware", "unaware", monster_condition_kind::harmful },
    { MB_BLIND, "blind", "blind", "blind", monster_condition_kind::harmful },
    { MB_DISTRACTED, "distracted", "not watching you", "distracted", monster_condition_kind::harmful },
    { MB_CANT_SEE_YOU, "unable to see you", "unable to see you", "unable to see you", monster_condition_kind::harmful },
    { MB_INFESTATION, "infested", "infested", "infested", monster_condition_kind::harmful },
    // Debuffs
    { MB_DUMB, "stupefied", "stupefied", "stupefied", monster_condition_kind::harmful },
#if TAG_MAJOR_VERSION == 34
    { MB_PINNED, "pinned", "pinned", "pinned", monster_condition_kind::harmful },
#endif
    { MB_WITHERING, "withering", "withering away", "withering", monster_condition_kind::harmful },
    { MB_CRUMBLING, "crumbling", "crumbling away", "crumbling", monster_condition_kind::harmful },
    { MB_PETRIFYING, "petrifying", "petrifying slowly", "petrifying", monster_condition_kind::harmful },
    { MB_MAD, "mad", "lost in madness", "mad", monster_condition_kind::harmful },
    { MB_FLEEING, "fleeing", "fleeing", "fleeing", monster_condition_kind::harmful },
    { MB_DAZED, "dazed", "dazed", "dazed", monster_condition_kind::harmful },
    { MB_MUTE, "mute", "mute", "mute", monster_condition_kind::harmful },
    { MB_FROZEN, "frozen", "encased in ice", "frozen", monster_condition_kind::harmful },
    { MB_BURNING, "burning", "covered in liquid flames", "burning", monster_condition_kind::harmful },
    { MB_POISONED, "poisoned", "poisoned", "poisoned", monster_condition_kind::harmful },
    { MB_MORE_POISONED, "very poisoned", "very poisoned", "very poisoned", monster_condition_kind::harmful },
    { MB_MAX_POISONED, "extremely poisoned", "extremely poisoned", "extremely poisoned", monster_condition_kind::harmful },
    { MB_CONTAM_LIGHT, "contam", "contaminated", "contam", monster_condition_kind::harmful },
    { MB_CONTAM_HEAVY, "heavy contam", "heavily contaminated", "heavy contam", monster_condition_kind::harmful },
    { MB_SLOWED, "slow", "slow", "slow", monster_condition_kind::harmful },
    { MB_BREATH_WEAPON, "catching breath", "catching @possessive@ breath", "catching breath", monster_condition_kind::harmful },
    { MB_LOWERED_WL, "weak-willed", "weak-willed", "weak-willed", monster_condition_kind::harmful },
    { MB_FIRE_VULN, "combustible", "more vulnerable to fire", "combustible", monster_condition_kind::harmful },
    { MB_POISON_VULN, "easily poisoned", "more vulnerable to poison", "easily poisoned", monster_condition_kind::harmful },
    { MB_WRETCHED, "misshapen", "misshapen and mutated", "misshapen", monster_condition_kind::harmful },
    { MB_CORROSION, "corroded", "corroded", "corroded", monster_condition_kind::harmful },
    { MB_FLAYED, "flayed", "covered in terrible wounds", "flayed", monster_condition_kind::harmful },
    { MB_GRASPING_ROOTS, "rooted", "constricted by roots", "rooted", monster_condition_kind::harmful },
    { MB_VILE_CLUTCH, "clutched", "constricted by zombie hands", "clutched", monster_condition_kind::harmful },
    { MB_BARBS, "skewered", "skewered by barbs", "skewered", monster_condition_kind::harmful },
    { MB_SICK, "sick", "sick", "sick", monster_condition_kind::harmful },
    { MB_WEAK, "weak", "weak", "weak", monster_condition_kind::harmful },
    { MB_LIGHTLY_DRAINED, "drained", "lightly drained", "drained", monster_condition_kind::harmful },
    { MB_HEAVILY_DRAINED, "very drained", "heavily drained", "very drained", monster_condition_kind::harmful },
    { MB_SAP_MAGIC, "magic-sapped", "magic-sapped", "magic-sapped", monster_condition_kind::harmful },
    { MB_GLOWING, "corona", "softly glowing", "coronas", monster_condition_kind::harmful },
    { MB_FLOODED, "flooded", "unable to breathe", "flooded", monster_condition_kind::harmful },
    { MB_DIMENSION_ANCHOR, "anchored", "unable to translocate", "anchored", monster_condition_kind::harmful },
    { MB_SLOW_MOVEMENT, "struggling", "covering ground slowly", "struggling", monster_condition_kind::harmful },
    { MB_PAIN_BOND, "pain bonded", "sharing @possessive@ pain", "pain bonded", monster_condition_kind::harmful },
    { MB_IDEALISED, "idealised", "idealised", "idealised", monster_condition_kind::beneficial },
    { MB_ALLY_TARGET, "ally target", "ally target", "ally target"},
    { MB_ANTIMAGIC, "magic disrupted", "magic disrupted", "magic disrupted", monster_condition_kind::harmful },
    { MB_ANGUISH, "anguished", "anguished", "anguished", monster_condition_kind::harmful },
    { MB_REFLECTING, "reflecting", "reflecting blocked projectiles", "reflecting", monster_condition_kind::beneficial },
    { MB_TELEPORTING, "teleporting", "about to teleport", "teleporting"},
    { MB_BOUND, "bound", "bound in place", "bound", monster_condition_kind::harmful },
    { MB_BULLSEYE_TARGET, "bullseye target", "targeted by your dimensional bullseye", "bullseye target", monster_condition_kind::harmful },
    { MB_VITRIFIED, "vitrified", "fragile as glass", "vitrified", monster_condition_kind::harmful },
    { MB_CURSE_OF_AGONY, "agonized", "cursed with the promise of agony", "cursed with agony", monster_condition_kind::harmful },
    { MB_RETREATING, "retreating", "retreating", "retreating", monster_condition_kind::harmful },
    { MB_TOUCH_OF_BEOGH, "divinely empowered", "empowered by the touch of Beogh", "divinely empowered", monster_condition_kind::beneficial },
    { MB_AWAITING_RECRUITMENT, "anointable", "ready to become your apostle", "anointable"},
    { MB_VENGEANCE_TARGET, "target of vengeance", "target of orcish vengeance", "targets of vengeance"},
    { MB_MAGNETISED, "magnetised", "covered in magnetic dust", "magnetised", monster_condition_kind::harmful },
    { MB_RIMEBLIGHT, "rimeblight", "afflicted by rimeblight", "rimeblight", monster_condition_kind::harmful },
    { MB_SHADOWLESS, "shadowless", "missing a shadow", "shadowless", monster_condition_kind::harmful },
    { MB_FROZEN_IN_TERROR, "paralysed with fear", "paralysed with fear", "paralysed with fear", monster_condition_kind::harmful },
    { MB_SOUL_SPLINTERED, "soul-splintered", "soul-splintered", "soul-splintered", monster_condition_kind::harmful },
    { MB_KINETIC_GRAPNEL, "grapneled", "grapneled", "grapneled", monster_condition_kind::harmful },
    { MB_TEMPERED, "tempered", "tempered", "tempered", monster_condition_kind::beneficial },
    { MB_BLINKITIS, "untethered", "untethered in space", "untethered", monster_condition_kind::harmful },
    { MB_CHAOS_LACE, "chaos-laced", "interlaced with chaos", "chaos-laced", monster_condition_kind::harmful },
    { MB_VEXED, "vexed", "lashing out in frustration", "vexed", monster_condition_kind::harmful },
    { MB_PYRRHIC_RECOLLECTION, "ablaze", "ablaze with memories", "ablaze", monster_condition_kind::harmful },
    { MB_CLOCKWORK_BEE_CAST, "bee", "winding a clockwork bee", "bee"},
    { MB_FIGMENT, "figment", "feeble figment", "figment", monster_condition_kind::harmful },
    { MB_PARADOX, "paradox", "touched by paradox", "paradox"},
    { MB_WARDING, "warded", "damage-immune at range", "warded", monster_condition_kind::beneficial },
    { MB_DIMINISHED_SPELLS, "dim", "diminished spells", "dim", monster_condition_kind::harmful },
    { MB_TESSERACT_SPAWN, "", "called by a tesseract", ""},
    { MB_SUNDERING_READY, "", "ready to sunder", ""},
    { MB_EXPOSED, "exposed", "exposed", "exposed", monster_condition_kind::harmful },
    { MB_REMEMBERED_INVIS, "remembered", "remembered", "remembered"},
    { MB_PHASE_SHIFT, "phased", "out of phase", "phased", monster_condition_kind::beneficial },
    { MB_DIVINE_SHIELD, "divine shielded", "divinely shielded", "divine shielded", monster_condition_kind::beneficial },
    { MB_WYRM_NIGREDO, "nigredo", "infused with nigredo", "infused with nigredo", monster_condition_kind::harmful },
    { MB_WYRM_ALBEDO, "albedo", "infused with albedo", "infused with albedo", monster_condition_kind::harmful },
    { MB_WYRM_CITRINITAS, "citrinitas", "infused with citrinitas", "infused with citrinitas", monster_condition_kind::beneficial },
    { MB_WYRM_VIRIDITAS, "viriditas", "infused with viriditas", "infused with viriditas", monster_condition_kind::harmful },
};
