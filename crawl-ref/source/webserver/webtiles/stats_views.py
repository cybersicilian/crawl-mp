"""Filters, aggregation and view models for the core /stats sections."""
import collections
import math
import urllib.parse

from webtiles.stats_parse import *  # noqa: F401,F403
from webtiles.stats_parse import (_DATE_RE, _float, _int, _strip_article)
from webtiles.stats_observations import STAGES
from webtiles.record_visibility import is_test_account
from webtiles.stats_metrics import mob_record, MOB_KDR_NOTE

# --------------------------------------------------------------------------
# Filters and aggregation
# --------------------------------------------------------------------------

def parse_filters(args):
    """args: mapping name -> str. Returns normalised filters (invalid dropped)."""
    f = {"account": "", "mode": "", "since": "", "until": "", "include_wizmode": False, "stage": "1"}
    account = str(args.get("account") or "").strip()
    f["account"] = account[:80]
    if args.get("mode") in ("solo", "party"):
        f["mode"] = args["mode"]
    for k in ("since", "until"):
        v = str(args.get(k) or "").strip()
        if _DATE_RE.match(v):
            f[k] = v
    f["include_wizmode"] = str(args.get("include_wizmode") or "").lower() in ("1", "true", "yes", "on")
    if args.get("stage") in STAGES:
        f["stage"] = args["stage"]
    return f


def filter_query(filters):
    pairs = [(k, filters[k]) for k in ("account", "mode", "since", "until") if filters.get(k)]
    if filters.get("include_wizmode"):
        pairs.append(("include_wizmode", "1"))
    if filters.get("stage", "1") != "1":
        pairs.append(("stage", filters["stage"]))
    return ("?" + urllib.parse.urlencode(pairs)) if pairs else ""


def apply_filters(games, filters):
    out = []
    acct = (filters.get("account") or "").lower()
    for g in games:
        if g.get("wizmode") and not filters.get("include_wizmode"):
            continue
        if filters.get("mode") and g["mode"] != filters["mode"]:
            continue
        if acct and acct not in (str(g.get("account", "")).lower(), str(g.get("account_id", "")).lower(),
                                 str(g.get("name", "")).lower()):
            continue
        when = g.get("when") or ""
        if filters.get("since") and when[:10] < filters["since"]:
            continue
        if filters.get("until") and (not when or when[:10] > filters["until"]):
            continue
        out.append(g)
    return out


def _valid_score(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def summarize(games):
    total = len(games)
    wins = sum(1 for g in games if g["outcome"] == "won")
    deaths = sum(1 for g in games if g["outcome"] == "dead")
    alive = sum(1 for g in games if g["outcome"] == "alive")
    finished = total - alive
    xls = [g["xl"] for g in games if isinstance(g.get("xl"), int)]
    deepest = max(games, key=lambda g: g.get("depth") or 0, default=None)
    best_score = max((g["score"] for g in games if _valid_score(g.get("score"))), default=None)
    return {
        "games": total, "wins": wins, "deaths": deaths, "alive": alive, "finished": finished,
        "win_rate": round(100.0 * wins / finished, 1) if finished else None,
        "avg_xl": round(sum(xls) / len(xls), 1) if xls else None,
        "max_xl": max(xls) if xls else None,
        "best_score": best_score,
        "deepest": (deepest.get("place") if deepest and deepest.get("depth") else
                    (deepest.get("place") if deepest else None)),
        "deepest_depth": deepest.get("depth") if deepest else None,
        "heroes": len({str(g.get("name", "")).lower() for g in games}),
        "kills": sum(g.get("kill_total") or 0 for g in games),
        "turns": sum(g.get("turns") or 0 for g in games),
    }


# --------------------------------------------------------------------------
# View models
# --------------------------------------------------------------------------

def _q(value):
    return urllib.parse.quote(str(value), safe="")


class _Ctx(object):
    def __init__(self, ref, games, filters, chronicle=None, library=None, all_games=None):
        self.ref, self.games, self.filters = ref, games, filters
        self.all_games = games if all_games is None else all_games
        self.qs = filter_query(filters)
        self.chronicle = chronicle or {"party": [], "ghost": [], "item": []}
        self.library = library or {}

    def link(self, text, path):
        return {"text": "" if text is None else text, "href": path + self.qs}

    def stat(self, section, key, text):
        return self.link(text, "/stats/%s/%s" % (section, _q(key)))

    def skill_cell(self, name):
        key = slug(name)
        known = {s["key"] for s in self.ref.skills}
        return self.stat("skills", key, name) if key in known else name

    def combo_link(self, g):
        text = ("%s %s" % (g.get("species") or "?", g.get("job") or "?")).strip()
        return self.stat("combos", "%s.%s" % (g["species_key"], g["job_key"]), text)

    def hero_cell(self, g):
        if g.get("hero_link"):
            return {"text": g.get("name") or "Unknown", "href": "/players/" + g["hero_link"]}
        return self.stat("players", g.get("account") or g.get("name"), g.get("name") or "Unknown")


def _col(key, label, num=False, view=None):
    return {"key": key, "label": label, "num": num, "view": view}


def _table(tid, title, columns, rows, empty, note=None):
    return {"id": tid, "title": title, "columns": columns, "rows": rows, "empty": empty, "note": note}


def _pct(v):
    return None if v is None else v


def _games_table(ctx, games, tid="games", title="Games", limit=None, empty=None):
    cols = [_col("hero", "Hero"), _col("account", "Account"), _col("combo", "Combo"),
            _col("xl", "XL", True), _col("place", "Place"), _col("outcome", "Outcome"),
            _col("killer", "Fate"), _col("score", "Score", True), _col("turns", "Turns", True),
            _col("mode", "Mode"), _col("when", "When"), _col("expedition", "Record")]
    rows = []
    for g in games[:limit] if limit else games:
        killer = ""
        if g["outcome"] == "dead" and g.get("killer"):
            killer = ctx.stat("monsters", g["killer_key"], g["killer"]) if g.get("killer_key") else g["killer"]
        elif g["outcome"] == "won":
            killer = "Escaped with the Orb"
        rows.append({
            "hero": ctx.hero_cell(g), "account": ctx.stat("players", g.get("account"), g.get("account")),
            "combo": ctx.combo_link(g), "xl": g.get("xl"), "place": g.get("place") or "",
            "outcome": OUTCOME_LABELS.get(g["outcome"], g["outcome"]) + (" · wizard" if g.get("wizmode") else ""),
            "killer": killer, "score": g.get("score"), "turns": g.get("turns"),
            "mode": "Party of %d" % g["party_size"] if g["mode"] == "party" else "Solo",
            "when": (g.get("when") or "").replace("T", " ").replace("Z", " UTC"),
            "expedition": {"text": "Expedition", "href": "/games/" + g["game_link"]} if g.get("game_link") else "",
        })
    return _table(tid, title, cols, rows, empty or "No games match these filters yet.",
                  "Showing the latest %d of %d." % (limit, len(games)) if limit and len(games) > limit else None)


def _counter_table(ctx, tid, title, counter, label, section=None, names=None, limit=None,
                   empty="Nothing recorded yet.", count_label="Count"):
    rows = []
    for key, n in counter.most_common(limit):
        name = (names or {}).get(key, key)
        rows.append({"name": ctx.stat(section, key, name) if section and key else (name or "—"), "count": n})
    return _table(tid, title, [_col("name", label), _col("count", count_label, True)], rows, empty)


def _leaderboard_table(ctx, limit=25):
    eligible = [g for g in ctx.games
                if g.get("outcome") in ("won", "dead", "quit", "left")
                and not g.get("wizmode")
                and not is_test_account(g.get("account") or g.get("name"))
                and _valid_score(g.get("score"))]
    eligible.sort(key=lambda g: (g["score"], g.get("when") or "", g.get("id") or ""), reverse=True)
    table = _games_table(ctx, eligible, "leaderboard", "Best runs leaderboard", limit,
                         "No completed runs with a recorded score match these filters yet.")
    table["columns"].insert(0, _col("rank", "Rank", True))
    rank, previous = 0, None
    for index, row in enumerate(table["rows"], 1):
        if row["score"] != previous:
            rank, previous = index, row["score"]
        row["rank"] = rank
    table["note"] = ("Top %d of %d completed hero runs by score, highest first. "
                     "Tied scores share a rank, newest first. Solo and party heroes are listed individually; "
                     "wizard and test runs are excluded. Account, mode and date filters apply." %
                     (min(limit, len(eligible)), len(eligible)))
    return table


def _breakdown(ctx, games, keyfn, namefn, section, label, tid, title):
    groups = collections.defaultdict(list)
    for g in games:
        k = keyfn(g)
        if k:
            groups[k].append(g)
    rows = []
    for k, gs in groups.items():
        s = summarize(gs)
        rows.append({"name": ctx.stat(section, k, namefn(k, gs)), "games": s["games"], "wins": s["wins"],
                     "win_rate": s["win_rate"], "avg_xl": s["avg_xl"], "best_score": s["best_score"]})
    rows.sort(key=lambda r: -r["games"])
    cols = [_col("name", label), _col("games", "Games", True), _col("wins", "Wins", True),
            _col("win_rate", "Win %", True), _col("avg_xl", "Avg XL", True), _col("best_score", "Best score", True)]
    return _table(tid, title, cols, rows, "No games recorded yet.")


def _facts_summary(s):
    return [["Games", s["games"]], ["Wins", s["wins"]], ["Deaths", s["deaths"]],
            ["In progress", s["alive"]],
            ["Win rate (finished)", "%s%%" % s["win_rate"] if s["win_rate"] is not None else "—"],
            ["Average XL", s["avg_xl"] if s["avg_xl"] is not None else "—"],
            ["Best score", s["best_score"] if s["best_score"] is not None else "—"],
            ["Deepest", s["deepest"] or "—"]]


def _fmt(v):
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, (list, tuple)):
        return ", ".join(_fmt(x) for x in v) if v else "—"
    if isinstance(v, dict):
        return ", ".join("%s %s" % (k, _fmt(x)) for k, x in v.items()) if v else "—"
    return "—" if v in (None, "") else v


def _ref_facts(entry, keys):
    facts = []
    for k, label in keys:
        if k in entry and entry[k] not in (None, "", [], {}):
            facts.append([label, _fmt(entry[k])])
    return facts


def section_overview(ctx, key):
    games, ref = ctx.games, ctx.ref
    s = summarize(games)
    facts = [["Games recorded", s["games"]], ["Heroes", s["heroes"]],
             ["Accounts", len({g["account"].lower() for g in games if g.get("account")})],
             ["Wins", s["wins"]],
             ["Win rate (finished)", "%s%%" % s["win_rate"] if s["win_rate"] is not None else "—"],
             ["In progress", s["alive"]], ["Monsters slain", s["kills"]], ["Turns played", s["turns"]],
             ["Party games", sum(1 for g in games if g["mode"] == "party")]]
    killers, killed, combos = collections.Counter(), collections.Counter(), collections.Counter()
    killer_names, combo_names = {}, {}
    for g in games:
        if g["outcome"] == "dead" and g.get("killer_key"):
            killers[g["killer_key"]] += 1
            killer_names[g["killer_key"]] = ref.monster_name(g["killer_key"], _strip_article(g["killer"]))
        for k, n in g["kills"].items():
            killed[k] += n
        ck = "%s.%s" % (g["species_key"], g["job_key"])
        combos[ck] += 1
        combo_names[ck] = "%s %s" % (g.get("species") or "?", g.get("job") or "?")
    killed_names = {k: ref.monster_name(k) for k in killed}
    tables = [
        _leaderboard_table(ctx),
        _games_table(ctx, games, "recent", "Recent games", 10,
                     "No games have been recorded on this server yet. Finish or save a game and it will appear here."),
        _table("killers", "Deadliest foes", [_col("name", "Monster"), _col("killed", "Heroes slain", True),
               _col("slain", "Times slain", True), _col("kdr", "Mob KDR", True)],
               [{"name": ctx.stat("monsters", k, killer_names[k]), "killed": n, "slain": killed[k],
                 "kdr": mob_record(n, killed[k])} for k, n in killers.most_common(10)],
               "No heroes have fallen to recorded monsters yet.", MOB_KDR_NOTE),
        _counter_table(ctx, "killed", "Most slain monsters", killed, "Monster", "monsters", killed_names, 10,
                       "No kills recorded yet.", "Times slain"),
        _counter_table(ctx, "popular", "Popular combos", combos, "Combo", "combos", combo_names, 10,
                       "No combos played yet.", "Games"),
    ]
    items = ctx.chronicle.get("item", [])
    if items:
        rows = [{"item": i.get("item_name"), "finder": i.get("finder_name"), "place": i.get("place"),
                 "when": str(i.get("timestamp") or "")} for i in sorted(items, key=lambda i: str(i.get("timestamp") or ""), reverse=True)[:10]]
        tables.append(_table("finds", "Notable finds (chronicle)",
                             [_col("item", "Item"), _col("finder", "Finder"), _col("place", "Place"), _col("when", "When")],
                             rows, "No notable items recorded yet."))
    return {"title": "The server at a glance", "intro": "Follow the runs, meet the deadliest creatures, and find your next build.",
            "facts": facts, "tables": tables,
            "highlights": [
                {"label": "Deadliest creature", "value": killer_names[killers.most_common(1)[0][0]] if killers else "No fallen heroes yet",
                 "detail": "%d heroes slain" % killers.most_common(1)[0][1] if killers else "The bestiary awaits its first record",
                 "href": "/stats/monsters" + ctx.qs},
                {"label": "Most played build", "value": combo_names[combos.most_common(1)[0][0]] if combos else "Your next expedition",
                 "detail": "%d recorded runs" % combos.most_common(1)[0][1] if combos else "Explore species and backgrounds",
                 "href": "/stats/combos" + ctx.qs},
            ]}


def section_combos(ctx, key):
    ref, games = ctx.ref, ctx.games
    by_pair = collections.defaultdict(list)
    for g in games:
        by_pair[(g["species_key"], g["job_key"])].append(g)
    if key:
        sk, _, jk = key.partition(".")
        sp, jb = ref.species_by_key.get(sk), ref.jobs_by_key.get(jk)
        gs = by_pair.get((sk, jk), [])
        if not (sp and jb) and not gs:
            return None
        sname = sp["name"] if sp else (gs[0].get("species") if gs else sk)
        jname = jb["name"] if jb else (gs[0].get("job") if gs else jk)
        combo = ref.combo_by_pair.get((sk, jk)) or {}
        facts = _facts_summary(summarize(gs))
        ref_facts = _ref_facts(combo, (("str", "Starting Str"), ("int", "Starting Int"), ("dex", "Starting Dex"),
                                       ("hp", "Starting HP"), ("mp", "Starting MP"), ("recommended", "Recommended")))
        if ref.combos and (sk, jk) not in ref.combo_by_pair:
            ref_facts.append(["Legal combo", "No (not offered at character creation)"])
        tables = [_games_table(ctx, gs, "games", "Games as %s %s" % (sname, jname))]
        if sp and sp.get("aptitudes"):
            tables.append(_table("aptitudes", "%s aptitudes" % sname, [_col("skill", "Skill"), _col("apt", "Aptitude", True)],
                                 [{"skill": k, "apt": v} for k, v in sp["aptitudes"].items()], "No aptitudes."))
        if jb and jb.get("skills"):
            tables.append(_table("skills", "%s starting skills" % jname, [_col("skill", "Skill"), _col("lvl", "Level", True)],
                                 [{"skill": k, "lvl": v} for k, v in jb["skills"].items()], "No starting skills."))
        kit = (jb or {}).get("equipment") or []
        return {"title": "%s %s" % (sname, jname), "intro": "Combo record and starting kit.",
                "facts": facts, "ref_facts": ref_facts,
                "lists": [["Starting equipment", kit]] if kit else [],
                "links": [ctx.stat("species", sk, sname), ctx.stat("jobs", jk, jname)],
                "tables": tables}
    species = [s for s in ref.species if s.get("playable", True)]
    jobs = [j for j in ref.jobs if j.get("playable", True)]
    known_sp = {s["key"] for s in species}
    known_jb = {j["key"] for j in jobs}
    for (sk, jk), gs in by_pair.items():
        if sk and sk not in known_sp:
            species.append({"key": sk, "name": gs[0].get("species") or sk})
            known_sp.add(sk)
        if jk and jk not in known_jb:
            jobs.append({"key": jk, "name": gs[0].get("job") or jk})
            known_jb.add(jk)
    species.sort(key=lambda s: s["name"])
    jobs.sort(key=lambda j: j["name"])
    legal = set(ref.combo_by_pair) if ref.combos else None
    grid_rows, list_rows = [], []
    max_games = max([len(v) for v in by_pair.values()] or [0])
    for sp in species:
        cells = []
        for jb in jobs:
            gs = by_pair.get((sp["key"], jb["key"]), [])
            s = summarize(gs) if gs else None
            is_legal = legal is None or (sp["key"], jb["key"]) in legal
            # Kept compact (1000+ cells): the template derives links and labels.
            cells.append({"games": len(gs), "wins": s["wins"] if s else 0, "legal": is_legal,
                          "heat": round(len(gs) / max_games, 2) if max_games and gs else 0})
            if gs:
                list_rows.append({"combo": ctx.stat("combos", "%s.%s" % (sp["key"], jb["key"]), "%s %s" % (sp["name"], jb["name"])),
                                  "games": s["games"], "wins": s["wins"], "win_rate": s["win_rate"],
                                  "avg_xl": s["avg_xl"], "best_score": s["best_score"], "deepest": s["deepest"] or ""})
        grid_rows.append({"species": {"key": sp["key"], "name": sp["name"]}, "href": "/stats/species/%s%s" % (_q(sp["key"]), ctx.qs), "cells": cells})
    list_rows.sort(key=lambda r: -r["games"])
    cols = [_col("combo", "Combo"), _col("games", "Games", True), _col("wins", "Wins", True),
            _col("win_rate", "Win %", True), _col("avg_xl", "Avg XL", True),
            _col("best_score", "Best score", True), _col("deepest", "Deepest")]
    return {"title": "Combos", "intro": "Every species and background pairing — click a cell for its record.",
            "grid": {"jobs": [{"key": j["key"], "name": j["name"], "abbrev": j.get("abbrev") or j.get("abbr") or "",
                               "href": "/stats/jobs/%s%s" % (_q(j["key"]), ctx.qs)} for j in jobs],
                     "rows": grid_rows},
            "tables": [_table("played", "Played combos", cols, list_rows,
                              "No combos have been played yet. Explore the full pairing grid below.")]}


def _entity_list(ctx, section, entries, gkey, extra_cols, extra_fn, label):
    by = collections.defaultdict(list)
    for g in ctx.games:
        by[gkey(g)].append(g)
    known = {e["key"] for e in entries}
    entries = list(entries)
    for k, gs in by.items():
        if k and k not in known:
            entries.append({"key": k, "name": (gs[0].get(section_name_field(section)) or k), "_gameplay_only": True})
    rows = []
    for e in entries:
        s = summarize(by.get(e["key"], []))
        row = {"name": ctx.stat(section, e["key"], e["name"]), "games": s["games"], "wins": s["wins"],
               "win_rate": s["win_rate"], "avg_xl": s["avg_xl"], "best_score": s["best_score"]}
        row.update(extra_fn(e))
        rows.append(row)
    cols = [_col("name", label)] + extra_cols + [
        _col("games", "Games", True), _col("wins", "Wins", True), _col("win_rate", "Win %", True),
        _col("avg_xl", "Avg XL", True), _col("best_score", "Best score", True)]
    return rows, cols


def section_name_field(section):
    return {"species": "species", "jobs": "job", "gods": "god"}.get(section, "name")


def section_species(ctx, key):
    ref = ctx.ref
    if key:
        sp = ref.species_by_key.get(key)
        gs = [g for g in ctx.games if g["species_key"] == key]
        if not sp and not gs:
            return None
        name = sp["name"] if sp else gs[0].get("species")
        sp = sp or {}
        tables = []
        if sp.get("aptitudes"):
            tables.append(_table("aptitudes", "Aptitudes", [_col("skill", "Skill"), _col("apt", "Aptitude", True)],
                                 [{"skill": ctx.skill_cell(k), "apt": v} for k, v in sp["aptitudes"].items()],
                                 "No aptitudes recorded."))
        tables.append(_breakdown(ctx, gs, lambda g: "%s.%s" % (g["species_key"], g["job_key"]),
                                 lambda k, g2: g2[0].get("job") or k, "combos", "Background", "jobs", "By background"))
        tables.append(_games_table(ctx, gs, "games", "Recent games", 25))
        muts = sp.get("mutations") or []
        return {"title": name, "intro": "Species reference and record.",
                "ref_facts": _ref_facts(sp, (("abbrev", "Abbreviation"), ("str", "Str"), ("int", "Int"), ("dex", "Dex"),
                                             ("hp_mod", "HP modifier"), ("mp_mod", "MP modifier"),
                                             ("will_mod", "Willpower modifier"), ("xp_mod", "XP modifier"),
                                             ("size", "Size"), ("playable", "Playable"),
                                             ("recommended_jobs", "Recommended backgrounds"))),
                "facts": _facts_summary(summarize(gs)),
                "lists": [["Mutations", muts]] if muts else [],
                "description": sp.get("description", ""), "tables": tables}
    rows, cols = _entity_list(ctx, "species", ref.species, lambda g: g["species_key"],
                              [_col("abbrev", "Abbr"), _col("str", "Str", True), _col("int", "Int", True),
                               _col("dex", "Dex", True), _col("xp_mod", "XP mod", True)],
                              lambda e: {"abbrev": e.get("abbrev") or e.get("abbr") or "", "str": e.get("str"),
                                         "int": e.get("int"), "dex": e.get("dex"), "xp_mod": e.get("xp_mod")},
                              "Species")
    return {"title": "Species", "intro": "Every species in this build, with how they fare on this server.",
            "tables": [_table("species", "All species", cols, rows, "No species data available.")]}


def section_jobs(ctx, key):
    ref = ctx.ref
    if key:
        jb = ref.jobs_by_key.get(key)
        gs = [g for g in ctx.games if g["job_key"] == key]
        if not jb and not gs:
            return None
        name = jb["name"] if jb else gs[0].get("job")
        jb = jb or {}
        tables = []
        if jb.get("skills"):
            tables.append(_table("skills", "Starting skills", [_col("skill", "Skill"), _col("lvl", "Level", True)],
                                 [{"skill": ctx.skill_cell(k), "lvl": v} for k, v in jb["skills"].items()],
                                 "No starting skills."))
        if jb.get("spells"):
            tables.append(_table("spells", "Starting spells", [_col("spell", "Spell")],
                                 [{"spell": ctx.stat("spells", ref.spell_key(s), (ref.spell_by_key.get(ref.spell_key(s)) or {}).get("name", s))}
                                  for s in jb["spells"]], "No starting spells."))
        tables.append(_breakdown(ctx, gs, lambda g: "%s.%s" % (g["species_key"], g["job_key"]),
                                 lambda k, g2: g2[0].get("species") or k, "combos", "Species", "species", "By species"))
        tables.append(_games_table(ctx, gs, "games", "Recent games", 25))
        kit = jb.get("equipment") or []
        return {"title": name, "intro": "Background reference and record.",
                "ref_facts": _ref_facts(jb, (("abbrev", "Abbreviation"), ("str", "Str bonus"), ("int", "Int bonus"),
                                             ("dex", "Dex bonus"), ("playable", "Playable"),
                                             ("recommended_species", "Recommended species"))),
                "facts": _facts_summary(summarize(gs)),
                "lists": [["Starting equipment", kit]] if kit else [],
                "description": jb.get("description", ""), "tables": tables}
    rows, cols = _entity_list(ctx, "jobs", ref.jobs, lambda g: g["job_key"],
                              [_col("abbrev", "Abbr"), _col("str", "Str", True), _col("int", "Int", True),
                               _col("dex", "Dex", True)],
                              lambda e: {"abbrev": e.get("abbrev") or e.get("abbr") or "", "str": e.get("str"),
                                         "int": e.get("int"), "dex": e.get("dex")},
                              "Background")
    return {"title": "Backgrounds", "intro": "Every background (job) in this build, with how they fare.",
            "tables": [_table("jobs", "All backgrounds", cols, rows, "No background data available.")]}


def _monster_gameplay(games):
    slain, slain_by, hero_kills = collections.Counter(), collections.defaultdict(list), collections.defaultdict(collections.Counter)
    for g in games:
        for k, n in g["kills"].items():
            slain[k] += n
            hero_kills[k][g.get("name") or "?"] += n
        if g["outcome"] == "dead" and g.get("killer_key"):
            slain_by[g["killer_key"]].append(g)
    return slain, slain_by, hero_kills


def section_monsters(ctx, key):
    ref = ctx.ref
    slain, slain_by, hero_kills = _monster_gameplay(ctx.games)
    if key:
        key = key if key in ref.monster_by_key else ref.monster_key(key)
        m = ref.monster_by_key.get(key)
        if not m and key not in slain and key not in slain_by:
            return None
        m = m or {"key": key, "name": key.replace("_", " ")}
        hp = m.get("hp_avg")
        if hp is not None and m.get("hp_min") is not None:
            hp = "%s (%s–%s)" % (hp, m.get("hp_min"), m.get("hp_max"))
        facts = [["Glyph", m.get("glyph")], ["Genus", m.get("genus")], ["Species", m.get("species")],
                 ["Hit dice", m.get("hd")], ["Hit points", hp], ["AC", m.get("ac")], ["EV", m.get("ev")],
                 ["Willpower", m.get("will")], ["Speed", m.get("speed")], ["XP value", m.get("xp")],
                 ["Size", m.get("size")], ["Holiness", m.get("holiness")], ["Intelligence", m.get("intelligence")],
                 ["Habitat", m.get("habitat")], ["Unique", m.get("unique")], ["Leaves corpse", m.get("corpse")]]
        facts = [[k, _fmt(v)] for k, v in facts if v not in (None, "", [])]
        tables = []
        if m.get("attacks"):
            tables.append(_table("attacks", "Attacks", [_col("type", "Type"), _col("flavour", "Flavour"), _col("damage", "Damage", True)],
                                 [{"type": a.get("type"), "flavour": a.get("flavour"), "damage": a.get("damage")} for a in m["attacks"]],
                                 "No attacks."))
        if m.get("resists"):
            tables.append(_table("resists", "Resistances", [_col("res", "Resistance"), _col("val", "Level")],
                                 [{"res": k, "val": _fmt(v)} for k, v in m["resists"].items()], "No resistances."))
        if m.get("spells"):
            tables.append(_table("spells", "Spells", [_col("spell", "Spell"), _col("freq", "Frequency", True), _col("flags", "Flags")],
                                 [{"spell": ctx.stat("spells", s.get("key"), s.get("name") or s.get("key")),
                                   "freq": s.get("freq"), "flags": _fmt(s.get("flags") or [])} for s in m["spells"]],
                                 "No spells."))
        top = hero_kills.get(key, collections.Counter())
        tables.append(_table("hunters", "Heroes who slay it most", [_col("hero", "Hero"), _col("kills", "Kills", True)],
                             [{"hero": ctx.stat("players", h, h), "kills": n} for h, n in top.most_common(25)],
                             "No hero has slain one yet."))
        tables.append(_games_table(ctx, slain_by.get(key, []), "victims", "Heroes slain by it",
                                   empty="It has not slain any heroes yet."))
        return {"title": m["name"], "intro": "Monster reference and record.",
                "description": m.get("description", ""), "ref_facts": facts,
                "facts": [["Heroes it has slain", len(slain_by.get(key, []))],
                          ["Times slain by heroes", slain.get(key, 0)],
                          ["Mob KDR", mob_record(len(slain_by.get(key, [])), slain.get(key, 0))["text"]]],
                "record_note": MOB_KDR_NOTE,
                "lists": [["Flags", m.get("flags") or []]] if m.get("flags") else [],
                "tables": tables}
    rows = []
    seen = set()
    for m in ref.monsters:
        seen.add(m["key"])
        rows.append({"name": ctx.stat("monsters", m["key"], m["name"]), "glyph": m.get("glyph", ""),
                     "hd": m.get("hd"), "hp": m.get("hp_avg"), "ac": m.get("ac"), "ev": m.get("ev"),
                     "speed": m.get("speed"), "xp": m.get("xp"),
                     "slain": slain.get(m["key"], 0), "killed": len(slain_by.get(m["key"], []))})
    for k in set(slain) | set(slain_by):
        if k not in seen:
            rows.append({"name": ctx.stat("monsters", k, ref.monster_name(k)), "glyph": "", "hd": None, "hp": None,
                         "ac": None, "ev": None, "speed": None, "xp": None,
                         "slain": slain.get(k, 0), "killed": len(slain_by.get(k, []))})
    for row in rows:
        row["kdr"] = mob_record(row["killed"], row["slain"])
        row["has_record"] = bool(row["killed"] or row["slain"])
    rows.sort(key=lambda row: (-row["killed"], -row["slain"], row["name"]["text"].casefold()))
    cols = [_col("name", "Monster"), _col("killed", "Heroes slain", True),
            _col("slain", "Times slain", True), _col("kdr", "Mob KDR", True),
            _col("glyph", "Glyph", view="reference"), _col("hd", "HD", True, "reference"),
            _col("hp", "Avg HP", True, "reference"), _col("ac", "AC", True, "reference"),
            _col("ev", "EV", True, "reference"), _col("speed", "Speed", True, "reference"),
            _col("xp", "XP", True, "reference")]
    note = MOB_KDR_NOTE + (" Monster mechanics are not available in the current reference." if not ref.monsters else "")
    table = _table("monsters", "Bestiary", cols, rows, "No monster data or kills recorded yet.", note)
    table["views"] = [["record", "Server record"], ["reference", "Mechanics & record"]]
    table["record_filter"] = True
    return {"title": "Monsters", "intro": "The full bestiary of this build, and how each creature fares against our heroes.",
            "facts": [["Heroes slain by monsters", sum(len(v) for v in slain_by.values())],
                      ["Monsters slain", sum(slain.values())],
                      ["Creatures with records", sum(row["has_record"] for row in rows)]],
            "tables": [table]}
