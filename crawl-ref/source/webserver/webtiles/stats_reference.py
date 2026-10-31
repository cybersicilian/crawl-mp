"""Engine reference data (crawl -stats-json) indexes and fallbacks."""
import collections
import re

from webtiles.stats_parse import *  # noqa: F401,F403
from webtiles.stats_parse import (_branch_name, _plural_forms, _strip_article)

# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------

class Reference(object):
    """Indexes over a reference dump (from the engine, fixture or fallback)."""

    def __init__(self, data, source="none"):
        data = data if isinstance(data, dict) else {}
        self.source = source
        self.version = data.get("version", "")
        self.raw = data

        def norm(entries):
            out = []
            for e in entries or []:
                if isinstance(e, dict) and (e.get("key") or e.get("name")):
                    e = dict(e)
                    e.setdefault("name", e.get("key"))
                    e.setdefault("key", slug(e["name"]))
                    e["key"] = str(e["key"])
                    out.append(e)
            return out

        self.monsters = norm(data.get("monsters"))
        self.spells = norm(data.get("spells"))
        self.species = norm(data.get("species"))
        self.jobs = norm(data.get("jobs"))
        self.gods = norm(data.get("gods"))
        self.mutations = norm(data.get("mutations"))
        self.skills = norm(data.get("skills"))
        self.branches = norm(data.get("branches"))
        items = data.get("items") if isinstance(data.get("items"), dict) else {}
        self.items = collections.OrderedDict()
        for cat in list(ITEM_CATEGORIES) + [c for c in items if c not in ITEM_CATEGORIES]:
            self.items[cat] = norm(items.get(cat))
        self.combos = [c for c in data.get("combos") or [] if isinstance(c, dict)]
        if not self.skills:
            names = []
            for sp in self.species:
                for sk in (sp.get("aptitudes") or {}):
                    if sk not in names:
                        names.append(sk)
            self.skills = [{"key": slug(n), "name": n} for n in names]

        self.monster_by_key = {m["key"]: m for m in self.monsters}
        self._monster_names = {}
        for m in self.monsters:
            for form in _plural_forms(_strip_article(m["name"])):
                self._monster_names.setdefault(form, m["key"])
            self._monster_names.setdefault(m["key"].replace("_", " "), m["key"])
        self.spell_by_key = {s["key"]: s for s in self.spells}
        self._spell_names = {}
        for s in self.spells:
            self._spell_names[s["name"].lower()] = s["key"]
            self._spell_names[s["key"]] = s["key"]
        self.species_by_key, self._species_names = self._lookup(self.species)
        self.jobs_by_key, self._job_names = self._lookup(self.jobs)
        self.god_by_key, self._god_names = self._lookup(self.gods)
        for g in self.gods:
            self._god_names.setdefault(_strip_article(g["name"]).lower(), g["key"])
        self.branch_by_key, self._branch_names = self._lookup(self.branches)
        for b in self.branches:
            for alias in (b.get("long_name"), b.get("abbrev"), b.get("short_name")):
                if alias:
                    self._branch_names.setdefault(str(alias).lower(), b["key"])
                    self._branch_names.setdefault(_strip_article(alias).lower(), b["key"])
        self.mutation_by_key = {m["key"]: m for m in self.mutations}
        self.item_by_key = {}
        self._item_names = {}
        self._item_scan = []
        for cat, entries in self.items.items():
            for it in entries:
                self.item_by_key[(cat, it["key"])] = it
                lname = re.sub(r"^[+-]\d+\s+", "", _strip_article(it["name"]).lower())
                for alias in (lname, it["key"], it["key"].replace("_", " "),
                              re.sub(r"^(potion|scroll|wand|ring|amulet|staff|book|talisman)s? of ", "", lname)):
                    self._item_names.setdefault((cat, alias), it["key"])
                if cat not in ("weapon_brands", "armour_egos", "books", "potions", "scrolls"):
                    self._item_scan.append((lname, cat, it["key"]))
        self._item_scan.sort(key=lambda e: -len(e[0]))
        self.combo_by_pair = {}
        for c in self.combos:
            sk = self.species_key(c.get("species"))
            jk = self.job_key(c.get("job"))
            self.combo_by_pair[(sk, jk)] = c
        self._resolve_cache = {}

    @staticmethod
    def _lookup(entries):
        by_key, names = {}, {}
        for e in entries:
            by_key[e["key"]] = e
            for alias in (e["key"], e["name"], e.get("abbrev"), e.get("abbr")):
                if alias:
                    names[str(alias).lower()] = e["key"]
        return by_key, names

    def species_key(self, value):
        return self._species_names.get(str(value or "").lower()) or slug(value)

    def job_key(self, value):
        return self._job_names.get(str(value or "").lower()) or slug(value)

    def god_key(self, value):
        text = str(value or "").strip()
        if not text or text.lower() in ("no god", "none"):
            return ""
        return self._god_names.get(text.lower()) or self._god_names.get(
            _strip_article(text).lower()) or slug(text)

    def branch_key(self, value):
        name = _branch_name(value)
        if not name:
            return ""
        return (self._branch_names.get(str(value).split(":")[0].lower())
                or self._branch_names.get(name.lower()) or slug(name))

    def spell_key(self, value):
        text = str(value or "").strip()
        key = self._spell_names.get(text.lower()) or self._spell_names.get(slug(text))
        if key:
            return key
        if len(text) >= 12:  # morgue spell tables truncate long names
            for s in self.spells:
                if s["name"].lower().startswith(text.lower()):
                    return s["key"]
        return slug(text)

    def monster_key(self, value):
        """Resolve a key, display name, plural or killer string to a monster key."""
        text = str(value or "").strip()
        if text in self._resolve_cache:
            return self._resolve_cache[text]
        if text in self.monster_by_key:
            key = text
        else:
            name = _strip_article(re.sub(r"\s*\([^)]*\)\s*$", "", text)).lower()
            key = self._monster_names.get(name)
            if not key and re.search(r"'s? (ghost|illusion)$", name):
                key = self._monster_names.get("player " + name.rsplit(" ", 1)[1]) or \
                    ("player_" + name.rsplit(" ", 1)[1])
            if not key:
                bare = re.sub(r"^(?:\d+\s+)", "", name)
                key = self._monster_names.get(bare)
            if not key:
                stem = re.sub(r"(?:es|s)$", "", name) if name.endswith("s") else name
                key = self._monster_names.get(stem) or slug(stem or name)
        self._resolve_cache[text] = key
        return key

    def monster_name(self, key, fallback=None):
        m = self.monster_by_key.get(key)
        return m["name"] if m else (fallback or key.replace("_", " "))

    def item_key(self, category, value):
        text = _strip_article(str(value or "")).lower().strip()
        key = self._item_names.get((category, text)) or self._item_names.get((category, slug(text)))
        if key:
            return key
        stripped = re.sub(r"^(potion|scroll|wand|ring|amulet|staff|book)s? of ", "", text)
        return self._item_names.get((category, stripped))

    def match_equipment(self, entry):
        """Map an equipment record (snapshot dict or morgue string) to (cat, key)."""
        if isinstance(entry, dict):
            base = entry.get("base_key")
            if base:
                for cat in self.items:
                    if (cat, base) in self.item_by_key:
                        return cat, base
            text = entry.get("name", "")
        else:
            text = str(entry)
        lname = re.sub(r"[{(].*$", "", text.lower())
        for name, cat, key in self._item_scan:
            if name and re.search(r"(?<![a-z])" + re.escape(name) + r"(?![a-z])", lname):
                return cat, key
        return None


def _playable_reference(playable, branches):
    """Degraded reference built from -playable-json (+ -branches-json)."""
    species = []
    abbr_to_species = {}
    for sp in playable.get("species", []):
        mods = sp.get("modifiers") or {}
        entry = {"key": slug(sp.get("name")), "name": sp.get("name"), "abbrev": sp.get("abbr"),
                 "aptitudes": sp.get("apts") or {}, "xp_mod": mods.get("xp"), "hp_mod": mods.get("hp"),
                 "mp_mod": mods.get("mp"), "will_mod": mods.get("wl"), "playable": True,
                 "recommended_jobs": sp.get("recommended_jobs", [])}
        species.append(entry)
        abbr_to_species[sp.get("abbr")] = entry
    jobs = []
    abbr_to_job = {}
    for job in playable.get("jobs", []):
        entry = {"key": slug(job.get("name")), "name": job.get("name"), "abbrev": job.get("abbr"),
                 "playable": True, "recommended_species": job.get("recommended_species", [])}
        jobs.append(entry)
        abbr_to_job[job.get("abbr")] = entry
    combos = []
    for code in playable.get("combos", []):
        sp, jb = abbr_to_species.get(str(code)[:2]), abbr_to_job.get(str(code)[2:])
        if sp and jb:
            combos.append({"species": sp["key"], "job": jb["key"],
                           "recommended": jb["name"] in sp.get("recommended_jobs", [])})
    out = dict(SKELETON_REFERENCE)
    out.update({"species": species, "jobs": jobs, "combos": combos,
                "branches": (branches or {}).get("branches", []),
                "generated_by": "crawl -playable-json (partial fallback)"})
    return out
