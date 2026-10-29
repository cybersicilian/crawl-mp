"""Dedup/merge of per-source game rows into one record per game."""
import collections
import json
import re

from webtiles.stats_parse import *  # noqa: F401,F403
from webtiles.stats_parse import (_int, _seconds, _strip_article)


def merge_games(rows, miles, chronicle, library, ref):
    groups = collections.OrderedDict()
    morgues, libs = [], []
    for r in rows:
        game = json.loads(r["row_json"])
        game["source"] = r["source"]
        if r["source"] == "morgue":
            morgues.append(game)
        elif r["source"] == "library":
            libs.append(game)
        else:
            groups.setdefault(r["dedup"], []).append(game)
    by_name = collections.defaultdict(list)
    for dk, group in groups.items():
        for g in group:
            by_name[str(g.get("name", "")).lower()].append(dk)
    for m in morgues:
        target = None
        m_end = _seconds(m.get("end_ts"))
        for dk in by_name.get(str(m.get("name", "")).lower(), []):
            for g in groups[dk]:
                g_end = _seconds(g.get("end_ts"))
                if m_end is not None and g_end is not None and abs(m_end - g_end) <= 180:
                    target = dk
                    break
            if target:
                break
        if target:
            groups[target].append(m)
        else:
            groups["morgue:%s|%s" % (str(m.get("name")).lower(), m.get("end_ts"))] = [m]
    by_name_seed = {}
    for dk, group in groups.items():
        for g in group:
            if g.get("seed"):
                by_name_seed.setdefault((str(g.get("name", "")).lower(), str(g["seed"])), dk)
    for lrow in libs:
        dk = by_name_seed.get((str(lrow.get("name", "")).lower(), lrow.get("seed", "")))
        if dk:
            groups[dk].append(lrow)
        else:
            groups["library:%s|%s" % (lrow.get("game_id"), lrow.get("hero_id"))] = [lrow]

    milestones = collections.defaultdict(list)
    for mi in miles:
        milestones[mi["dedup"]].append(mi)
    parties = {}
    for p in chronicle.get("party", []):
        if p.get("seed"):
            try:
                members = json.loads(p.get("members_json") or "[]")
            except ValueError:
                members = []
            parties[str(p["seed"])] = {"size": _int(p.get("player_count"), len(members) or 1),
                                       "host": p.get("host") or "",
                                       "members": [m.get("name") for m in members if isinstance(m, dict)]}
    accounts = library.get("accounts", {})
    account_names = {v.lower(): k for k, v in accounts.items()}

    out = []
    for dk, group in groups.items():
        out.append(_merge_group(dk, group, milestones, parties, library, accounts, account_names, ref))
    out.sort(key=lambda g: g["when"] or "", reverse=True)
    return out


SCALARS = ("name", "species", "job", "xl", "turns", "dur", "place", "branch", "depth", "god",
           "piety", "runes", "score", "outcome", "ktyp", "killer", "start_ts", "end_ts", "updated",
           "version", "seed", "party_size", "account", "account_id", "game_id", "hero_id",
           "hp_max", "mp_max", "ac", "ev", "sh", "str", "int", "dex", "gold", "kill_total",
           "combo_raw", "slot", "created")
DETAILS = ("actions", "skills", "equipment", "spells_known", "max_depth", "observations")


def _merge_group(dk, group, milestones, parties, library, accounts, account_names, ref):
    group.sort(key=lambda g: (PRIORITY.get(g["source"], 0), g.get("updated") or ""), reverse=True)
    top = group[0]
    # Final results must outrank a saved, still-alive snapshot. Otherwise its
    # outcome hides the completed run even when the xlog supplies its score.
    # Keep source priority for rich details, identity and snapshot observations.
    scalar_rows = sorted(group, key=lambda r: bool(r.get("final") and
                         r.get("outcome") in ("won", "dead", "quit", "left")), reverse=True)
    g = {k: None for k in SCALARS}
    for r in scalar_rows:
        for k in SCALARS:
            if g.get(k) in (None, "") and r.get(k) not in (None, ""):
                g[k] = r[k]
    g["source"] = top["source"]
    g["sources"] = sorted({r["source"] for r in group}, key=lambda s: -PRIORITY.get(s, 0))
    g["wizmode"] = any(r.get("wizmode") for r in group)
    for k in DETAILS:
        g[k] = next((r[k] for r in group if r.get(k)),
                    [] if k in ("equipment", "spells_known", "observations") else {})
    kills = {}
    for r in group:
        if r.get("kills"):
            kills = dict(r["kills"])
            break
        if r.get("kill_names"):
            for nm, n in r["kill_names"].items():
                key = ref.monster_key(nm)
                kills[key] = kills.get(key, 0) + n
            break
    canonical_kills = collections.Counter()
    for name, count in kills.items():
        canonical_kills[ref.monster_key(name)] += count
    g["kills"] = dict(canonical_kills)
    if not g.get("kill_total"):
        g["kill_total"] = sum(kills.values())
    # Species/job split for morgue-only rows ("Deep Elf Conjurer").
    if (not g.get("species") or not g.get("job")) and g.get("combo_raw"):
        raw = g["combo_raw"]
        for sp in sorted(ref.species, key=lambda s: -len(s["name"])):
            if raw.lower().startswith(sp["name"].lower() + " "):
                g["species"], g["job"] = sp["name"], raw[len(sp["name"]) + 1:]
                break
        else:
            parts = raw.split(" ", 1)
            g["species"], g["job"] = parts[0], parts[1] if len(parts) > 1 else ""
    visited = []
    for r in group:
        for b in r.get("branches_visited") or []:
            if b and b not in visited:
                visited.append(b)
    for b in (g.get("max_depth") or {}):
        if b not in visited:
            visited.append(b)
    uniques, god_hist = [], []
    for mi in milestones.get(dk, []):
        if mi["type"] in ("br.enter", "br.end") and mi.get("br"):
            if mi["br"] not in visited:
                visited.append(mi["br"])
        elif mi["type"] == "uniq":
            mm = re.match(r"killed (.+?)\.?$", mi.get("text", ""))
            if mm:
                uniques.append(mm.group(1))
        elif mi["type"] == "god.worship" and mi.get("god"):
            god_hist.append(mi["god"])
    if g.get("branch") and g["branch"] not in visited:
        visited.append(g["branch"])
    g["branch_keys"] = sorted({ref.branch_key(b) for b in visited if b})
    g["branch_key"] = ref.branch_key(g.get("branch") or g.get("place"))
    if not g.get("god") and god_hist:
        g["god"] = god_hist[-1]
    g["god_key"] = ref.god_key(g.get("god"))
    g["uniques"] = uniques
    # Party / account resolution.
    party = parties.get(str(g.get("seed") or ""))
    size = _int(g.get("party_size"), 0) or 0
    if party:
        size = max(size, party["size"] or 1)
    g["party_size"] = size or 1
    g["mode"] = "party" if g["party_size"] > 1 else "solo"
    if g.get("account_id") and accounts.get(g["account_id"]):
        g["account"] = accounts[g["account_id"]]
    if not g.get("account"):
        if party and party.get("host"):
            g["account"] = party["host"]
        else:
            g["account"] = g.get("name") or ""
    if not g.get("account_id"):
        g["account_id"] = account_names.get(str(g["account"]).lower(), "")
    g["hero_link"] = g.get("hero_id") if g.get("hero_id") in library.get("heroes", {}) else ""
    g["game_link"] = g.get("game_id") if g.get("game_id") in library.get("games", {}) else ""
    if not g["game_link"]:
        for r in group:
            if r.get("game_id") in library.get("games", {}):
                g["game_link"] = r["game_id"]
                g["hero_link"] = g["hero_link"] or (r.get("hero_id") if r.get("hero_id") in library.get("heroes", {}) else "")
                break
    g["species_key"] = ref.species_key(g.get("species"))
    g["job_key"] = ref.job_key(g.get("job"))
    g["killer_key"] = ref.monster_key(g["killer"]) if g.get("killer") and g.get("outcome") == "dead" else ""
    g["outcome"] = g.get("outcome") or "alive"
    g["when"] = g.get("end_ts") or g.get("updated") or g.get("start_ts") or g.get("created") or ""
    g["id"] = dk
    return g
