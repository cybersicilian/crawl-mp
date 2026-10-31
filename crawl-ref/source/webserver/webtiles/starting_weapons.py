"""Staging choices generated from the native character creation rules.

Regenerate static/starting-weapons.json with util/generate_character_catalog.py
after rebuilding Crawl. Client payloads never supply the allowed weapon list.
"""
import json
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "static/starting-weapons.json"
WEAPONS = json.loads(DATA_PATH.read_text())


def normalize_slot(slot):
    """Keep compatible selections; replace stale or invalid ones with a legal default."""
    species = slot.get("species", "Minotaur")
    if species == "Djinn":
        species = "Djinni"
    jobs = WEAPONS.get(species, {})
    job = slot.get("job", "Fighter")
    if jobs and job not in jobs:
        replacement = "Paladin" if job == "Priest" and "Paladin" in jobs else "Fighter"
        job = replacement if replacement in jobs else next(iter(jobs))
        slot["job"] = job
    entry = jobs.get(job, {})
    choices = entry.get("choices", [])
    slot["weapon_choices"] = list(choices)
    slot["weapon_recommendations"] = [weapon for weapon in entry.get("recommended", [])
                                      if weapon in choices]
    if slot.get("weapon") not in choices:
        slot["weapon"] = entry.get("default", "")
    slot.setdefault("trait", "none")
    return slot


def trait_error(slot):
    trait = slot.get("trait", "none")
    if trait == "none":
        return ""
    if trait not in ("mummy", "zombie", "ghost"):
        return "Unknown character trait."
    species = "Djinni" if slot.get("species") == "Djinn" else slot.get("species")
    entry = WEAPONS.get(species, {}).get(slot.get("job"), {})
    restrictions = entry.get("trait_restrictions", {})
    return restrictions.get(trait, "Trait compatibility is unavailable.")


def selection_error(slot):
    species = "Djinni" if slot.get("species") == "Djinn" else slot.get("species")
    if slot.get("job") not in WEAPONS.get(species, {}):
        return "That species and background are not available."
    return trait_error(slot)


def member_spec(slot):
    """The optional third component is backward compatible with Species/Job."""
    normalize_slot(slot)
    if slot.get("trait", "none") != "none" and not slot.get("starting_seed"):
        raise ValueError("A trait-bearing hero needs a starting roll.")
    combo = "%s/%s" % (slot.get("species", "Minotaur"), slot.get("job", "Fighter"))
    if slot["weapon"]:
        combo += "/" + slot["weapon"]
    if slot.get("starting_seed"):
        if not slot["weapon"]:
            combo += "/unarmed"
        combo += "/" + str(slot["starting_seed"])
        if slot.get("trait", "none") != "none":
            combo += "/" + slot["trait"]
    return "%s:%s" % (slot["hero_name"], combo)
