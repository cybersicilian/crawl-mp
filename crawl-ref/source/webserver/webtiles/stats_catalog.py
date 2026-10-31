"""Navigation and lookup projections of the canonical stats reference indexes."""
import re
import urllib.parse

from webtiles.stats_parse import ITEM_CATEGORIES, SECTIONS
from webtiles.stats_views import filter_query


SECTION_GROUPS = (
    ("Server records", ("overview", "players", "ratings", "impacts", "deaths")),
    ("Character building", ("species", "jobs", "combos", "skills", "mutations")),
    ("Dungeon reference", ("monsters", "items", "spells", "gods", "branches")),
)
DESCRIPTIONS = {
    "overview": "Best runs leaderboard, recent expeditions and server totals",
    "ratings": "Account ratings across the server archive",
    "impacts": "Matched win and score estimates with uncertainty",
    "players": "Adventurers, heroes and their records",
    "deaths": "Killers, dangerous places and fallen heroes",
    "species": "Starting attributes, aptitudes and innate traits",
    "jobs": "Starting skills, spells and equipment",
    "combos": "Species and background pairings",
    "skills": "Species aptitudes and recorded training",
    "mutations": "Mutation effects and innate abilities",
    "monsters": "Defences, attacks, resistances and spells",
    "items": "Equipment, consumables, brands and artefacts",
    "spells": "Schools, levels, spellbooks and casters",
    "gods": "The pantheon, abilities and followers",
    "branches": "Dungeon regions, visits and dangers",
}
REFERENCE_SECTIONS = ("species", "jobs", "skills", "mutations", "monsters", "spells", "gods", "branches")


def _href(section, key=None, qs=""):
    path = "/stats" if section == "overview" else "/stats/" + section
    if key is not None:
        path += "/" + urllib.parse.quote(str(key), safe="")
    return path + qs


def _players(games):
    # Player details accept either an account or a hero name. Keep both discoverable.
    return sorted({str(g[field]) for g in games for field in ("account", "name") if g.get(field)}, key=str.casefold)


def navigation(ref, games, filters):
    counts = {section: len(getattr(ref, section)) for section in REFERENCE_SECTIONS}
    counts.update(items=sum(len(entries) for entries in ref.items.values()),
                  combos=len(ref.combo_by_pair), players=len(_players(games)),
                  deaths=sum(g["outcome"] == "dead" for g in games))
    qs = filter_query(filters)
    return [{"title": title, "entries": [
        {"key": key, "title": SECTIONS[key], "description": DESCRIPTIONS[key],
         "count": counts.get(key), "href": _href(key, qs=qs)} for key in keys]}
        for title, keys in SECTION_GROUPS]


def search(ref, games, filters, query, limit=100):
    """Search known entries; gameplay filters scope players, never engine mechanics."""
    query = " ".join(str(query or "").split())[:160]
    terms = query.casefold().replace("_", " ").split()
    if not terms:
        return {"query": query, "total": 0, "results": [], "limited": False}
    qs = filter_query(filters)
    matches = []

    def add(section, key, name, category, entry=None):
        entry = entry or {}
        description = re.sub(r"<[^>]*>", "", str(entry.get("description") or ""))
        description = " ".join(description.split())
        aliases = " ".join(str(entry.get(field) or "") for field in
                           ("abbrev", "abbr", "schools", "skill", "genus", "long_name"))
        text = " ".join((name, str(key), category, description, aliases)).casefold().replace("_", " ")
        if not all(term in text for term in terms):
            return
        lower = name.casefold()
        needle = " ".join(terms)
        rank = 0 if lower == needle else 1 if lower.startswith(needle) else 2 if needle in lower else 3
        matches.append((rank, lower, {"name": name, "category": category,
                                     "description": description[:180], "href": _href(section, key, qs)}))

    for section in REFERENCE_SECTIONS:
        for entry in getattr(ref, section):
            add(section, entry["key"], entry["name"], SECTIONS[section], entry)
    for category, entries in ref.items.items():
        for entry in entries:
            add("items", category + "." + entry["key"], entry["name"], ITEM_CATEGORIES.get(category, category), entry)
    for (species_key, job_key) in ref.combo_by_pair:
        species = ref.species_by_key.get(species_key, {})
        job = ref.jobs_by_key.get(job_key, {})
        add("combos", species_key + "." + job_key,
            "%s %s" % (species.get("name", species_key), job.get("name", job_key)), "Combos")
    for name in _players(games):
        add("players", name, name, "Players & heroes")
    matches.sort(key=lambda match: (match[0], match[1], match[2]["category"]))
    return {"query": query, "total": len(matches), "results": [m[2] for m in matches[:limit]],
            "limited": len(matches) > limit}
