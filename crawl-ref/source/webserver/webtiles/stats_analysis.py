"""Adapters from merged Crawl records to reusable effects and Elo mechanisms.

The independent unit is an account's expedition, including all its party
heroes. Start choices use historical results; acquired features use the first
non-final snapshot in a selected XL band. Final equipment and the fatal enemy
are never used as predictors. Values remain observational associations.
"""
import collections
from dataclasses import dataclass
import math

from webtiles.outcome_effects import Observation, contrast
from webtiles.record_visibility import is_test_account
from webtiles.skill_rating import RatedResult, replay
from webtiles.stats_parse import ACTION_ITEM_CATEGORIES, ITEM_CATEGORIES, slug


@dataclass(frozen=True)
class Feature:
    identifier: str
    section: str
    key: str
    name: str
    action: str = ""


def account_aliases(games):
    aliases = collections.defaultdict(set)
    for game in games:
        if game.get("account_id") and game.get("account"):
            aliases[game["account"].casefold()].add(str(game["account_id"]))
    return {name: next(iter(ids)) for name, ids in aliases.items() if len(ids) == 1}


def owner_key(game, aliases):
    name = str(game.get("account") or game.get("name") or "").casefold()
    identifier = str(game.get("account_id") or aliases.get(name) or "")
    return "id:" + identifier if identifier else "legacy:" + name


def expeditions(games, aliases):
    """No party can contribute twice through several heroes or partial deaths."""
    groups = collections.defaultdict(list)
    for game in games:
        owner = owner_key(game, aliases)
        identity = game.get("game_id") or game["id"]
        groups[(owner, str(identity))].append(game)
    runs = []
    for (owner, identity), heroes in sorted(groups.items()):
        if any(g.get("wizmode") or is_test_account(g.get("account")) for g in heroes):
            continue
        if any(g.get("outcome") not in ("won", "dead", "quit", "left") for g in heroes):
            continue
        size = max(g.get("party_size") or 1 for g in heroes)
        if size > 1 and (not all(g.get("game_id") for g in heroes) or len(heroes) != size):
            continue
        starts = [g.get("start_ts") for g in heroes]
        ends = [g.get("end_ts") for g in heroes]
        if not all(starts) or not all(ends) or any(a > b for a, b in zip(starts, ends)):
            continue
        versions = {g.get("version") for g in heroes}
        if len(versions) != 1 or not all(versions):
            continue
        build = tuple(sorted((g.get("species_key") or "?", g.get("job_key") or "?") for g in heroes))
        if any("?" in pair for pair in build):
            continue
        version = next(iter(versions))
        challenge = repr((version, size, build))
        scores = [g.get("score") for g in heroes]
        score = sum(scores) if all(isinstance(s, (int, float)) and math.isfinite(s) and s >= 0
                                  for s in scores) else None
        runs.append({"key": owner + "|" + identity, "owner": owner, "heroes": heroes,
                     "name": heroes[0].get("account") or heroes[0].get("name") or "Unknown",
                     "started": min(starts), "ended": max(ends), "version": version,
                     "size": size, "build": build, "challenge": challenge, "score": score,
                     "won": any(g["outcome"] == "won" for g in heroes)})
    return runs


class Analysis:
    def __init__(self, games, ref):
        self.ref = ref
        self.aliases = account_aliases(games)
        self.runs = expeditions(games, self.aliases)
        self._builds = {run["key"]: run["build"] for run in self.runs}
        self.features = {}
        self._stages, self._effects = {}, {}
        self._coverage = {}
        for section in ("species", "jobs", "gods", "monsters", "spells"):
            for entry in getattr(ref, section):
                self.register(section, entry["key"], entry["name"])
        self.register("gods", "_none", "No god")
        for category, entries in ref.items.items():
            for entry in entries:
                self.register("items", category + "." + entry["key"], entry["name"])
        results = [RatedResult(r["key"], r["owner"], r["challenge"], r["started"], r["ended"], r["won"])
                   for r in self.runs]
        self.ratings, self.challenges, self.start_ratings = replay(results)

    def register(self, section, key, name, action=""):
        identifier = section + ":" + key + ("~" + action if action else "")
        self.features.setdefault(identifier, Feature(identifier, section, key, name, action))
        return identifier

    def choices(self, hero):
        return {self.register("species", hero.get("species_key") or self.ref.species_key(hero.get("species")),
                              hero.get("species") or "Unknown species"),
                self.register("jobs", hero.get("job_key") or self.ref.job_key(hero.get("job")),
                              hero.get("job") or "Unknown background")}

    def exposures(self, snapshot):
        features = self.choices(snapshot)
        god = self.ref.god_key(snapshot.get("god")) or "_none"
        features.add(self.register("gods", god, snapshot.get("god") or "No god"))

        def item_feature(category, key, action):
            entry = self.ref.item_by_key.get((category, key))
            name = entry["name"] if entry else key.replace("_", " ")
            features.add(self.register("items", category + "." + key, name))
            features.add(self.register("items", category + "." + key, name, action))

        for equipment in snapshot.get("equipment") or []:
            if isinstance(equipment, dict) and equipment.get("melded"):
                continue
            hit = self.ref.match_equipment(equipment)
            if hit:
                item_feature(*hit, "equipped")
            if isinstance(equipment, dict) and equipment.get("ego"):
                for category in ("weapon_brands", "armour_egos"):
                    key = self.ref.item_key(category, equipment["ego"])
                    if key:
                        item_feature(category, key, "equipped")
        for category, names in (snapshot.get("actions") or {}).items():
            for name, count in names.items():
                if not isinstance(count, (int, float)) or count <= 0:
                    continue
                action = slug(category)
                features.add(self.register("actions", action + "." + slug(name), str(name), action))
                for item_category in ACTION_ITEM_CATEGORIES.get(category.lower(), ()):
                    key = self.ref.item_key(item_category, name)
                    if key:
                        item_feature(item_category, key, action)
                if category.lower() == "cast":
                    key = self.ref.spell_key(name)
                    features.add(self.register("spells", key, str(name)))
                    features.add(self.register("spells", key, str(name), "cast"))
        for name in snapshot.get("spells_known") or []:
            key = self.ref.spell_key(name)
            entry = self.ref.spell_by_key.get(key, {})
            features.add(self.register("spells", key, entry.get("name", str(name))))
        for key, count in (snapshot.get("kills") or {}).items():
            if isinstance(count, (int, float)) and count > 0:
                features.add(self.register("monsters", key, self.ref.monster_name(key)))
        return features

    def observations(self, stage):
        if stage in self._stages:
            return self._stages[stage]
        observations = []
        for run in self.runs:
            features, snapshots = set(), []
            if stage == "start":
                for hero in run["heroes"]:
                    features.update(self.choices(hero))
                coverage = {"species", "jobs"}
            else:
                for hero in run["heroes"]:
                    eligible = [o for o in hero.get("observations") or [] if o.get("stage") == stage and
                                not o.get("final") and not o.get("downed") and not o.get("wizmode") and o.get("outcome") == "alive" and
                                o.get("version") == run["version"] and o.get("updated", "") < run["ended"]]
                    if not eligible:
                        break
                    snapshot = min(eligible, key=lambda o: (o.get("turns", 0), o.get("updated", "")))
                    snapshots.append(snapshot)
                    features.update(self.exposures(snapshot))
                if len(snapshots) != len(run["heroes"]):
                    continue
                required = {"species": ("species",), "jobs": ("job",), "gods": ("god",),
                            "items": ("equipment", "actions"), "actions": ("actions",),
                            "monsters": ("kills",), "spells": ("spells_known", "actions")}
                coverage = {section for section, fields in required.items()
                            if all(all(field in o for field in fields) for o in snapshots)}
            # Match pre-run skill and exact rules version; party size is never pooled.
            stratum = (run["version"], run["size"], int(self.start_ratings[run["key"]] // 200))
            if snapshots:
                # Hold exact observed XL fixed within the selected band.
                stratum += (tuple(sorted(o.get("xl") for o in snapshots)),)
            observations.append(Observation(run["key"], run["owner"], stratum,
                                            frozenset(features), run["won"], run["score"]))
            self._coverage[(stage, run["key"])] = coverage
        self._stages[stage] = observations
        return observations

    def effect(self, identifier, stage="1", other=None, units=None):
        feature = self.features[identifier]
        chosen = "start" if feature.section in ("species", "jobs") and not feature.action else stage
        if other and self.features[other].section not in ("species", "jobs"):
            chosen = stage
        if other and feature.section not in ("species", "jobs"):
            chosen = stage
        cache_key = (identifier, chosen, other, units)
        if cache_key not in self._effects:
            if len(self._effects) >= 4096:
                self._effects.clear()
            changing = {feature.section}
            if other:
                changing.add(self.features[other].section)
            observations = []
            for o in self.observations(chosen):
                if units is not None and o.unit not in units:
                    continue
                if not changing <= self._coverage[(chosen, o.unit)]:
                    continue
                # Hold the other starting choices fixed, except dimensions being contrasted.
                fixed_dimensions = {"species", "jobs"} - changing
                build = self._builds[o.unit]
                fixed = build if len(fixed_dimensions) == 2 else \
                    tuple(sorted(pair[0 if "species" in fixed_dimensions else 1] for pair in build)) \
                    if fixed_dimensions else ()
                observations.append(Observation(o.unit, o.owner, o.stratum + (fixed,), o.features, o.won, o.score))
            self._effects[cache_key] = dict(contrast(observations, identifier, other), stage=chosen)
        return self._effects[cache_key]


def for_store(store, ref):
    key = (store._generation, id(ref))
    cached = getattr(store, "_analysis_cache", None)
    if not cached or cached[0] != key:
        cached = (key, Analysis(store.games(ref), ref))
        store._analysis_cache = cached
    return cached[1]
