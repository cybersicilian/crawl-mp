"""View models for the reference-heavy /stats sections."""
import collections

from webtiles.stats_parse import *  # noqa: F401,F403
from webtiles.stats_parse import (_float, _int, _strip_article)
from webtiles.stats_views import *  # noqa: F401,F403
from webtiles.stats_views import (_Ctx, _breakdown, _col, _counter_table, _entity_list, _facts_summary,
                                  _fmt, _games_table, _q, _ref_facts, _table)
from webtiles.stats_catalog import navigation, search
from webtiles import stats_analysis_views


def _item_gameplay(ctx):
    ref = ctx.ref
    equipped, used, found = collections.Counter(), collections.Counter(), collections.Counter()
    for g in ctx.games:
        for e in g.get("equipment") or []:
            hit = ref.match_equipment(e)
            if hit:
                equipped[hit] += 1
            if isinstance(e, dict) and e.get("ego"):
                for cat in ("weapon_brands", "armour_egos"):
                    k = ref.item_key(cat, e["ego"])
                    if k:
                        equipped[(cat, k)] += 1
        for cat, names in (g.get("actions") or {}).items():
            for item_cat in ACTION_ITEM_CATEGORIES.get(str(cat).lower(), ()):
                for name, n in names.items():
                    k = ref.item_key(item_cat, name)
                    if k:
                        used[(item_cat, k)] += _int(n, 0)
    for it in ctx.chronicle.get("item", []):
        hit = ref.match_equipment(it.get("item_name", ""))
        if hit:
            found[hit] += 1
    return equipped, used, found


ITEM_COLUMNS = {
    "weapons": (("skill", "Skill", False), ("damage", "Dmg", True), ("hit", "Hit", True),
                ("delay", "Delay", True), ("hands", "Hands", True)),
    "armour": (("slot", "Slot", False), ("ac", "AC", True), ("ev_penalty", "EV pen.", True), ("str_req", "Str req.", True)),
    "missiles": (("damage", "Dmg", True),),
    "jewellery": (("kind", "Kind", False),),
    "talismans": (("form", "Form", False),),
    "unrands": (("base", "Base", False),),
    "potions": (("price", "Price", True),),
    "scrolls": (("price", "Price", True),),
    "wands": (("charges", "Charges", True),),
}


def section_items(ctx, key):
    ref = ctx.ref
    equipped, used, found = _item_gameplay(ctx)
    if key:
        cat, _, ikey = key.partition(".")
        it = ref.item_by_key.get((cat, ikey))
        if not it:
            return None
        skip = {"key", "name", "description", "properties", "spells", "tags", "intrinsic"}
        facts = [["Category", ITEM_CATEGORIES.get(cat, cat)]] + [
            [k.replace("_", " ").capitalize(), _fmt(v)] for k, v in it.items()
            if k not in skip and not isinstance(v, dict) and v not in (None, "", [])]
        tables = []
        if it.get("properties"):
            tables.append(_table("props", "Properties", [_col("prop", "Property"), _col("val", "Value")],
                                 [{"prop": k, "val": _fmt(v)} for k, v in it["properties"].items()], "No properties."))
        if cat == "books" and it.get("spells"):
            tables.append(_table("spells", "Spells", [_col("spell", "Spell"), _col("level", "Level", True)],
                                 [{"spell": ctx.stat("spells", ref.spell_key(s), (ref.spell_by_key.get(ref.spell_key(s)) or {}).get("name", s)),
                                   "level": (ref.spell_by_key.get(ref.spell_key(s)) or {}).get("level")} for s in it["spells"]],
                                 "No spells."))
        wielders = [g for g in ctx.games if any(ref.match_equipment(e) == (cat, ikey) for e in g.get("equipment") or [])]
        tables.append(_games_table(ctx, wielders, "wielders", "Heroes equipped with it at last record",
                                   empty="No recorded hero ended with this equipped."))
        finds = [i for i in ctx.chronicle.get("item", []) if ref.match_equipment(i.get("item_name", "")) == (cat, ikey)]
        tables.append(_table("finds", "Chronicle finds", [_col("item", "Item"), _col("finder", "Finder"), _col("place", "Place")],
                             [{"item": i.get("item_name"), "finder": i.get("finder_name"), "place": i.get("place")} for i in finds],
                             "Not recorded among notable finds yet."))
        lists = []
        for lk, label in (("tags", "Tags"), ("intrinsic", "Intrinsic properties")):
            if it.get(lk):
                lists.append([label, it[lk]])
        return {"title": it["name"], "intro": "%s reference and record." % ITEM_CATEGORIES.get(cat, cat),
                "ref_facts": facts, "description": it.get("description", ""), "lists": lists,
                "facts": [["Equipped at last record", equipped.get((cat, ikey), 0)],
                          ["Times used (action counts)", used.get((cat, ikey), 0)],
                          ["Chronicle finds", found.get((cat, ikey), 0)]],
                "tables": tables}
    tables = []
    for cat, entries in ref.items.items():
        extra = ITEM_COLUMNS.get(cat, ())
        cols = [_col("name", "Name")] + [_col(k, label, num) for k, label, num in extra] + [
            _col("equipped", "Equipped", True), _col("used", "Used", True), _col("found", "Found", True)]
        rows = []
        for it in entries:
            row = {"name": ctx.stat("items", "%s.%s" % (cat, it["key"]), it["name"]),
                   "equipped": equipped.get((cat, it["key"]), 0), "used": used.get((cat, it["key"]), 0),
                   "found": found.get((cat, it["key"]), 0)}
            for k, _label, _num in extra:
                row[k] = _fmt(it.get(k)) if not isinstance(it.get(k), (int, float)) else it.get(k)
            rows.append(row)
        if rows or cat in ITEM_CATEGORIES:
            tables.append(_table("items-" + cat, ITEM_CATEGORIES.get(cat, cat.replace("_", " ").title()),
                                 cols, rows, "No %s in the reference data yet." % ITEM_CATEGORIES.get(cat, cat).lower()))
    return {"title": "Items", "intro": "Every item class, ego and unrandart in this build — with what heroes carry and use.",
            "tables": tables, "toc": True}


def section_spells(ctx, key):
    ref = ctx.ref
    casts, known = collections.Counter(), collections.Counter()
    casters = collections.defaultdict(collections.Counter)
    for g in ctx.games:
        for name, n in ((g.get("actions") or {}).get("cast") or {}).items():
            k = ref.spell_key(name)
            casts[k] += _int(n, 0)
            casters[k][g.get("name") or "?"] += _int(n, 0)
        for s in g.get("spells_known") or []:
            known[ref.spell_key(s)] += 1
    monsters_with = collections.defaultdict(list)
    for m in ref.monsters:
        for s in m.get("spells") or []:
            monsters_with[s.get("key")].append(m)
    if key:
        key = key if key in ref.spell_by_key else ref.spell_key(key)
        sp = ref.spell_by_key.get(key)
        if not sp and not casts.get(key) and not known.get(key):
            return None
        sp = sp or {"key": key, "name": key.replace("_", " ")}
        tables = [
            _table("books", "Found in books", [_col("book", "Book")],
                   [{"book": ctx.stat("items", "books." + b, (ref.item_by_key.get(("books", b)) or {}).get("name", b))}
                    for b in sp.get("books") or []], "Not found in any book."),
            _table("monsters", "Monsters that cast it", [_col("monster", "Monster"), _col("hd", "HD", True)],
                   [{"monster": ctx.stat("monsters", m["key"], m["name"]), "hd": m.get("hd")} for m in monsters_with.get(key, [])],
                   "No monster casts it."),
            _table("casters", "Top hero casters", [_col("hero", "Hero"), _col("casts", "Casts", True)],
                   [{"hero": ctx.stat("players", h, h), "casts": n} for h, n in casters[key].most_common(25)],
                   "No hero has cast it yet."),
        ]
        return {"title": sp["name"], "intro": "Spell reference and record.",
                "description": sp.get("description", ""),
                "ref_facts": _ref_facts(sp, (("level", "Level"), ("schools", "Schools"), ("range", "Range"),
                                             ("noise", "Noise"), ("flags", "Flags"))),
                "facts": [["Times cast", casts.get(key, 0)], ["Heroes who knew it", known.get(key, 0)]],
                "tables": tables}
    rows = []
    seen = set()
    for sp in ref.spells:
        seen.add(sp["key"])
        rows.append({"name": ctx.stat("spells", sp["key"], sp["name"]), "level": sp.get("level"),
                     "schools": _fmt(sp.get("schools") or []), "range": _fmt(sp.get("range")),
                     "casts": casts.get(sp["key"], 0), "known": known.get(sp["key"], 0),
                     "monsters": len(monsters_with.get(sp["key"], []))})
    for k in (set(casts) | set(known)) - seen:
        rows.append({"name": ctx.stat("spells", k, k.replace("_", " ")), "level": None, "schools": "", "range": "",
                     "casts": casts.get(k, 0), "known": known.get(k, 0), "monsters": 0})
    cols = [_col("name", "Spell"), _col("level", "Level", True), _col("schools", "Schools"), _col("range", "Range"),
            _col("casts", "Times cast", True), _col("known", "Heroes knowing", True), _col("monsters", "Monster casters", True)]
    return {"title": "Spells", "intro": "Every spell in this build, and how often our heroes reach for it.",
            "tables": [_table("spells", "All spells", cols, rows, "No spell data or casts recorded yet.")]}


def section_gods(ctx, key):
    ref = ctx.ref
    by = collections.defaultdict(list)
    for g in ctx.games:
        by[g["god_key"] or "_none"].append(g)
    if key:
        key = key if key in ref.god_by_key or key == "_none" else ref.god_key(key)
        god = ref.god_by_key.get(key)
        gs = by.get(key, [])
        if not god and not gs and key != "_none":
            return None
        name = god["name"] if god else ("No god" if key == "_none" else (gs[0].get("god") if gs else key))
        god = god or {}
        piety = [g["piety"] for g in gs if isinstance(g.get("piety"), int)]
        facts = _facts_summary(summarize(gs)) + [["Average piety", round(sum(piety) / len(piety)) if piety else "—"]]
        abilities = god.get("abilities") or []
        return {"title": name, "intro": "God reference and record.", "description": god.get("description", ""),
                "facts": facts, "lists": [["Abilities", abilities]] if abilities else [],
                "tables": [_games_table(ctx, gs, "followers", "Followers", empty="No hero has followed this god yet.")]}
    rows, cols = _entity_list(ctx, "gods", ref.gods, lambda g: g["god_key"], [_col("piety", "Avg piety", True)],
                              lambda e: {"piety": (lambda p: round(sum(p) / len(p)) if p else None)(
                                  [g["piety"] for g in by.get(e["key"], []) if isinstance(g.get("piety"), int)])}, "God")
    none = summarize(by.get("_none", []))
    rows.append({"name": ctx.stat("gods", "_none", "No god"), "piety": None, "games": none["games"], "wins": none["wins"],
                 "win_rate": none["win_rate"], "avg_xl": none["avg_xl"], "best_score": none["best_score"]})
    return {"title": "Gods", "intro": "The pantheon, and which heroes kept the faith.",
            "tables": [_table("gods", "Pantheon", cols, rows, "No god data available.")]}


def section_branches(ctx, key):
    ref = ctx.ref
    visits, deaths, deepest = collections.defaultdict(list), collections.defaultdict(list), {}
    for g in ctx.games:
        for b in g["branch_keys"]:
            visits[b].append(g)
        if g["outcome"] == "dead" and g.get("branch_key"):
            deaths[g["branch_key"]].append(g)
        for b, d in (g.get("max_depth") or {}).items():
            bk = ref.branch_key(b)
            deepest[bk] = max(deepest.get(bk, 0), _int(d, 0))
        place = g.get("place") or ""
        if ":" in place and g.get("branch_key"):
            deepest[g["branch_key"]] = max(deepest.get(g["branch_key"], 0), _int(place.split(":")[-1], 0))
    if key:
        key = key if key in ref.branch_by_key else ref.branch_key(key)
        br = ref.branch_by_key.get(key)
        if not br and key not in visits:
            return None
        br = br or {"key": key, "name": key.replace("_", " ").title()}
        killers = collections.Counter(g["killer_key"] for g in deaths.get(key, []) if g.get("killer_key"))
        return {"title": br["name"], "intro": br.get("long_name") or "Branch reference and record.",
                "description": br.get("description", ""),
                "ref_facts": _ref_facts(br, (("long_name", "Full name"), ("abbrev", "Abbreviation"), ("levels", "Levels"),
                                             ("has_rune", "Has a rune"), ("parent", "Entered from"))),
                "facts": [["Heroes who visited", len(visits.get(key, []))], ["Heroes who fell here", len(deaths.get(key, []))],
                          ["Deepest level reached", deepest.get(key) or "—"]],
                "tables": [_counter_table(ctx, "killers", "Killers here", killers, "Killer", "monsters",
                                          {k: ref.monster_name(k) for k in killers}, 25, "No one has fallen here yet."),
                           _games_table(ctx, deaths.get(key, []), "deaths", "Heroes who fell here", empty="No deaths here yet."),
                           _games_table(ctx, visits.get(key, []), "visitors", "Visitors", 25, "No recorded visits yet.")]}
    rows, seen = [], set()
    for br in ref.branches:
        seen.add(br["key"])
        rows.append({"name": ctx.stat("branches", br["key"], br["name"]), "levels": br.get("levels"),
                     "rune": _fmt(br.get("has_rune")) if "has_rune" in br else "",
                     "visits": len(visits.get(br["key"], [])), "deaths": len(deaths.get(br["key"], [])),
                     "deepest": deepest.get(br["key"])})
    for k in set(visits) - seen:
        rows.append({"name": ctx.stat("branches", k, k.replace("_", " ").title()), "levels": None, "rune": "",
                     "visits": len(visits[k]), "deaths": len(deaths.get(k, [])), "deepest": deepest.get(k)})
    cols = [_col("name", "Branch"), _col("levels", "Levels", True), _col("rune", "Rune"), _col("visits", "Visits", True),
            _col("deaths", "Deaths", True), _col("deepest", "Deepest", True)]
    return {"title": "Branches", "intro": "The dungeon's branches, how often they are braved, and where heroes fall.",
            "tables": [_table("branches", "All branches", cols, rows, "No branch data available.")]}


def section_deaths(ctx, key):
    ref = ctx.ref
    dead = [g for g in ctx.games if g["outcome"] == "dead"]
    killers, places, ktyps = collections.Counter(), collections.Counter(), collections.Counter()
    names = {}
    for g in dead:
        if g.get("killer_key"):
            killers[g["killer_key"]] += 1
            names[g["killer_key"]] = ref.monster_name(g["killer_key"], _strip_article(g["killer"]))
        places[g.get("place") or "Unknown"] += 1
    for g in ctx.games:
        if g.get("ktyp"):
            ktyps[g["ktyp"]] += 1
    tables = [
        _counter_table(ctx, "killers", "Killers", killers, "Killer", "monsters", names, None, "No heroes have fallen yet.", "Heroes slain"),
        _table("places", "Places of death", [_col("place", "Place"), _col("count", "Deaths", True)],
               [{"place": p, "count": n} for p, n in places.most_common()], "No deaths recorded yet."),
        _table("ktyp", "Manner of ending", [_col("ktyp", "Ending"), _col("label", "Meaning"), _col("count", "Games", True)],
               [{"ktyp": k, "label": KTYP_LABELS.get(k, k.replace("_", " ")), "count": n} for k, n in ktyps.most_common()],
               "No finished games yet."),
        _games_table(ctx, dead, "recent", "Recent deaths", 50, "No heroes have fallen yet."),
    ]
    ghosts = ctx.chronicle.get("ghost", [])
    tables.append(_table("ghosts", "Party falls (chronicle ghosts)",
                         [_col("hero", "Hero"), _col("combo", "Combo"), _col("xl", "XL", True), _col("place", "Place"),
                          _col("killer", "Killer"), _col("type", "Kind"), _col("when", "When")],
                         [{"hero": gh.get("hero_name"), "combo": "%s %s" % (gh.get("species", ""), gh.get("job", "")),
                           "xl": _int(gh.get("xl")), "place": gh.get("place"),
                           "killer": ctx.stat("monsters", ref.monster_key(gh.get("killer")), gh.get("killer")) if gh.get("killer") else "",
                           "type": str(gh.get("down_type") or "").replace("_", " "), "when": str(gh.get("timestamp") or "")}
                          for gh in sorted(ghosts, key=lambda x: str(x.get("timestamp") or ""), reverse=True)],
                         "No party member has fallen in a co-op game yet."))
    return {"title": "Deaths", "intro": "Who killed whom, where, and how.",
            "facts": [["Deaths", len(dead)], ["Distinct killers", len(killers)], ["Party falls", len(ghosts)]],
            "tables": tables}


def section_players(ctx, key):
    from webtiles.record_visibility import is_test_account
    games = ctx.games
    lib_accounts = {identifier: name for identifier, name in ctx.library.get("accounts", {}).items()
                    if not is_test_account(name)}
    if key:
        lk = key.lower()
        def mine(g):
            return lk in (str(g.get("account", "")).lower(), str(g.get("name", "")).lower(),
                          str(g.get("account_id", "")).lower())
        gs = [g for g in games if mine(g)]
        # Known adventurers whose games are all filtered out still get a page.
        if not gs and not any(mine(g) for g in ctx.all_games) and \
                not any(v.lower() == lk for v in lib_accounts.values()):
            return None
        s = summarize(gs)
        account_id = next((g["account_id"] for g in gs if g.get("account_id")), "") or \
            next((k for k, v in lib_accounts.items() if v.lower() == lk), "")
        killed = collections.Counter()
        for g in gs:
            for k, n in g["kills"].items():
                killed[k] += n
        links = [{"text": "Library profile", "href": "/players/" + account_id}] if account_id in lib_accounts else []
        return {"title": key, "intro": "Every recorded hero and game for this adventurer.",
                "facts": _facts_summary(s) + [["Heroes", s["heroes"]], ["Monsters slain", s["kills"]]],
                "links": links,
                "tables": [_breakdown(ctx, gs, lambda g: "%s.%s" % (g["species_key"], g["job_key"]),
                                      lambda k, g2: "%s %s" % (g2[0].get("species"), g2[0].get("job")), "combos",
                                      "Combo", "combos", "Combos played"),
                           _counter_table(ctx, "killed", "Most slain", killed, "Monster", "monsters",
                                          {k: ctx.ref.monster_name(k) for k in killed}, 25, "No kills recorded yet.", "Kills"),
                           _games_table(ctx, gs, "games", "Games")]}
    accounts = collections.defaultdict(list)
    heroes = collections.defaultdict(list)
    for g in games:
        accounts[g.get("account") or "?"].append(g)
        heroes[(g.get("name") or "?", g.get("account") or "?")].append(g)
    acc_rows = []
    for acct, gs in accounts.items():
        s = summarize(gs)
        fav = collections.Counter("%s %s" % (g.get("species"), g.get("job")) for g in gs).most_common(1)
        aid = next((g["account_id"] for g in gs if g.get("account_id") in lib_accounts), "")
        acc_rows.append({"account": ctx.stat("players", acct, acct), "games": s["games"], "wins": s["wins"],
                         "heroes": s["heroes"], "best_score": s["best_score"], "favourite": fav[0][0] if fav else "",
                         "last": (gs[0].get("when") or "")[:10],
                         "profile": {"text": "Profile", "href": "/players/" + aid} if aid else ""})
    acc_rows.sort(key=lambda r: -r["games"])
    hero_rows = []
    for (name, acct), gs in heroes.items():
        s = summarize(gs)
        latest = gs[0]
        hero_rows.append({"hero": ctx.hero_cell(latest) if latest.get("hero_link") else ctx.stat("players", name, name),
                          "account": ctx.stat("players", acct, acct), "combo": ctx.combo_link(latest),
                          "games": s["games"], "wins": s["wins"], "max_xl": s["max_xl"], "best_score": s["best_score"],
                          "last": (latest.get("when") or "")[:10]})
    hero_rows.sort(key=lambda r: r["last"], reverse=True)
    return {"title": "Players & heroes", "intro": "Adventurers and the heroes they have sent below.",
            "tables": [_table("accounts", "Adventurers",
                              [_col("account", "Account"), _col("games", "Games", True), _col("wins", "Wins", True),
                               _col("heroes", "Heroes", True), _col("best_score", "Best score", True),
                               _col("favourite", "Favourite combo"), _col("last", "Last played"), _col("profile", "Library")],
                              acc_rows, "No adventurers have recorded a game yet."),
                       _table("heroes", "Heroes",
                              [_col("hero", "Hero"), _col("account", "Account"), _col("combo", "Latest combo"),
                               _col("games", "Games", True), _col("wins", "Wins", True), _col("max_xl", "Best XL", True),
                               _col("best_score", "Best score", True), _col("last", "Last seen")],
                              hero_rows, "No heroes recorded yet.")]}


def section_skills(ctx, key):
    ref = ctx.ref
    levels = collections.defaultdict(list)
    for g in ctx.games:
        for name, lvl in (g.get("skills") or {}).items():
            if _float(lvl) is not None:
                levels[slug(name)].append(_float(lvl))
    names = {s["key"]: s["name"] for s in ref.skills}
    for k in levels:
        names.setdefault(k, k.replace("_", " ").title())
    if key:
        if key not in names:
            return None
        sname = names[key]
        apts = []
        for sp in ref.species:
            for sk, v in (sp.get("aptitudes") or {}).items():
                if slug(sk) == key:
                    apts.append({"species": ctx.stat("species", sp["key"], sp["name"]), "apt": v})
        starts = []
        for jb in ref.jobs:
            for sk, v in (jb.get("skills") or {}).items():
                if slug(sk) == key:
                    starts.append({"job": ctx.stat("jobs", jb["key"], jb["name"]), "lvl": v})
        lv = levels.get(key, [])
        return {"title": sname, "intro": "Skill aptitudes and training on this server.",
                "facts": [["Heroes with this skill recorded", len(lv)],
                          ["Average level", round(sum(lv) / len(lv), 1) if lv else "—"],
                          ["Highest level", max(lv) if lv else "—"]],
                "tables": [_table("apts", "Species aptitudes", [_col("species", "Species"), _col("apt", "Aptitude", True)],
                                  apts, "No aptitude data available."),
                           _table("starts", "Backgrounds that start with it", [_col("job", "Background"), _col("lvl", "Level", True)],
                                  starts, "No background starts with this skill (or data unavailable).")]}
    rows = []
    for k, n in names.items():
        apts = [v for sp in ref.species for sk, v in (sp.get("aptitudes") or {}).items() if slug(sk) == k and isinstance(v, (int, float))]
        lv = levels.get(k, [])
        rows.append({"name": ctx.stat("skills", k, n), "avg_apt": round(sum(apts) / len(apts), 1) if apts else None,
                     "best_apt": max(apts) if apts else None, "heroes": len(lv),
                     "avg_lvl": round(sum(lv) / len(lv), 1) if lv else None, "max_lvl": max(lv) if lv else None})
    cols = [_col("name", "Skill"), _col("avg_apt", "Avg aptitude", True), _col("best_apt", "Best aptitude", True),
            _col("heroes", "Heroes trained", True), _col("avg_lvl", "Avg level", True), _col("max_lvl", "Max level", True)]
    return {"title": "Skills", "intro": "Aptitudes across species, and how far heroes actually trained.",
            "tables": [_table("skills", "All skills", cols, rows, "No skill data available.")]}


def section_mutations(ctx, key):
    ref = ctx.ref
    holders = collections.defaultdict(list)
    for sp in ref.species:
        for m in sp.get("mutations") or []:
            mk = m.get("key") if isinstance(m, dict) else slug(m)
            holders[mk].append(sp)
    if key:
        m = ref.mutation_by_key.get(key)
        if not m:
            return None
        return {"title": m["name"], "intro": "Mutation reference.", "description": m.get("description", ""),
                "ref_facts": _ref_facts(m, (("levels", "Levels"),)),
                "tables": [_table("species", "Species born with it", [_col("species", "Species")],
                                  [{"species": ctx.stat("species", sp["key"], sp["name"])} for sp in holders.get(key, [])],
                                  "No species starts with it.")]}
    rows = [{"name": ctx.stat("mutations", m["key"], m["name"]), "levels": m.get("levels"),
             "species": len(holders.get(m["key"], []))} for m in ref.mutations]
    return {"title": "Mutations", "intro": "Every mutation in this build.",
            "tables": [_table("mutations", "All mutations",
                              [_col("name", "Mutation"), _col("levels", "Levels", True), _col("species", "Innate in species", True)],
                              rows, "Mutation reference data is not available yet.")]}


SECTION_FUNCS = {
    "overview": section_overview, "combos": section_combos, "species": section_species,
    "jobs": section_jobs, "monsters": section_monsters, "items": section_items,
    "spells": section_spells, "gods": section_gods, "branches": section_branches,
    "deaths": section_deaths, "players": section_players, "skills": section_skills,
    "mutations": section_mutations,
    "impacts": stats_analysis_views.section_impacts, "ratings": stats_analysis_views.section_ratings,
}


def build_section(store, section, key=None, filters=None, query="", comparison="", lookup=False):
    """Return the view model for a section (None -> 404)."""
    if section not in SECTION_FUNCS and section != "search":
        return None
    filters = filters or parse_filters({})
    ref = store.reference()
    all_games = store.games(ref)
    games = apply_filters(all_games, filters)
    _rows, _miles, chronicle, library = store._load() if section in ("overview", "items", "deaths", "players", "ratings") \
        else (None, None, None, None)
    ctx = _Ctx(ref, games, filters, chronicle, library, all_games)
    ctx.query, ctx.comparison, ctx.lookup = query, comparison, lookup
    analytical = section in ("impacts", "ratings", "players", "species", "jobs", "items", "gods", "monsters", "spells")
    if analytical:
        stats_analysis_views.prepare(ctx, store)
    if section == "search":
        if key:
            return None
        found = search(ref, games, filters, query)
        result = {"title": "Search the archive", "intro": "Find reference entries and recorded adventurers in one place.",
                  "search": found, "tables": [_table("results", "Search results", [
                      _col("name", "Entry"), _col("category", "Category"), _col("description", "About")],
                      [{"name": {"text": row["name"], "href": row["href"]},
                        "category": row["category"], "description": row["description"]} for row in found["results"]],
                      "No entries match. Try a shorter name or another keyword." if found["query"] else
                      "Search by name, category or keyword above to explore the archive.",
                      "Showing %d of %d matches. Refine your search to narrow the results." %
                      (len(found["results"]), found["total"]) if found["limited"] else None)]}
    else:
        result = SECTION_FUNCS[section](ctx, key)
    if result is None:
        return None
    if analytical:
        stats_analysis_views.decorate(ctx, result, section, key)
    for table in result.get("tables", []):
        # Column roles are presentation metadata. Preserve every underlying cell
        # and let the no-JavaScript view show the complete table.
        if any(c["key"] == "win_effect" for c in table["columns"]):
            reference_columns = {
                "species": {"abbrev", "str", "int", "dex", "xp_mod"},
                "jobs": {"abbrev", "str", "int", "dex"},
                "spells": {"level", "schools", "range", "monsters"},
                "items": {k for fields in ITEM_COLUMNS.values() for k, _, _ in fields},
            }.get(section, set())
            for column in table["columns"]:
                if column["key"] in reference_columns:
                    column["view"] = "reference"
            if not table.get("views"):
                table["views"] = [["record", "Server record"]]
                if reference_columns:
                    table["views"].append(["reference", "Mechanics & record"])
            table["views"].append(["analysis", "Win & score associations"])
            for column in table["columns"]:
                if column["key"] in ("win_effect", "score_effect", "impact"):
                    column["view"] = "analysis"
    result.setdefault("facts", [])
    result.setdefault("ref_facts", [])
    result.setdefault("lists", [])
    result.setdefault("links", [])
    result.setdefault("tables", [])
    result.setdefault("description", "")
    result.update({
        "section": section, "section_label": SECTIONS.get(section, "Search"), "key": key, "filters": filters,
        "filter_query": ctx.qs,
        "navigation": navigation(ref, games, filters),
        "reference": {"source": ref.source, "version": ref.version},
        "impact_stages": list(stats_analysis_views.STAGES.items()),
        "has_analysis": any(c["key"] == "win_effect" for t in result["tables"] for c in t["columns"]),
        "has_table_views": any(t.get("views") for t in result["tables"]),
        "counts": {"games": len(games), "all_games": len(all_games),
                   "excluded_wizmode": sum(1 for g in all_games if g.get("wizmode"))},
    })
    return result
