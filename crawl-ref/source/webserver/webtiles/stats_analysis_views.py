"""Stats projections for observational impact estimates and account Elo."""
import collections
import urllib.parse

from webtiles.stats_analysis import for_store, owner_key
from webtiles.stats_observations import STAGES
from webtiles.stats_parse import SECTIONS
from webtiles.skill_rating import Rating
from webtiles.record_visibility import is_test_account
from webtiles.stats_views import _col, _table

EFFECT_NOTE = (
    "Differences describe matched historical outcomes, not proven causes or live win predictions. "
    "Starting choices use completed expeditions; other features use earlier snapshots at the selected XL. "
    "Controls share rules version, party size, prior Elo band, exact snapshot XL and other starting choices. "
    "At least 5 expeditions and 3 accounts per comparison cell are required. "
    "Win ranges propagate 95% Wilson bounds; score ranges are approximate. "
    "Repeated players, selection bias and many comparisons can make these ranges overconfident. "
    "Unknown exposure is excluded. Wizard games never contribute.")
RATING_NOTE = (
    "Global across this server archive. Page filters select displayed accounts; their ratings always use full history. "
    "Elo starts at 1500 and updates once per completed account expedition against a dungeon challenge "
    "defined by rules version, party size and starting composition. K is 32 for the first 20 results, then 16. "
    "Deaths, quits and leaving without the Orb are losses. Wizard games and incomplete parties are excluded. "
    "Co-op rates the owning account once, not each human controller. Legacy names have unverified identity. "
    "Ratings are provisional for 20 results; model expectations are not calibrated win probabilities.")


def _impact_link(ctx, identifier, label):
    return ctx.stat("impacts", identifier, label)


def _feature_link(ctx, feature):
    name = feature.name + (" · " + feature.action.replace("_", " ") if feature.action else "")
    return _impact_link(ctx, feature.identifier, name)


def _range(values, suffix=""):
    return "—" if values is None else "%+.2f to %+.2f%s" % (values[0], values[1], suffix)


def _effect_row(ctx, model, identifier, other=None):
    estimate = model.effect(identifier, ctx.filters["stage"], other, ctx.analysis_units)
    feature = model.features[other or identifier]
    row = {"name": _feature_link(ctx, feature), "category": SECTIONS.get(feature.section, "Actions"),
           "action": feature.action.replace("_", " ") or "Recorded exposure",
           "stage": "Starting choices" if estimate["stage"] == "start" else STAGES[estimate["stage"]],
           "win_delta": estimate["win_delta_pp"], "win_range": _range(estimate["win_range_pp"], " pp"),
           "score_delta": estimate["score_delta"], "score_range": _range(estimate["score_range"]),
           "samples": " / ".join(map(str, estimate["counts"])),
           "score_samples": " / ".join(map(str, estimate["score_counts"])),
           "owners": " / ".join(map(str, estimate["owners"])),
           "observed": estimate["observed_exposed"],
           "status": "Estimated association" if estimate["status"] == "estimated" else "Insufficient data",
           "estimate": estimate}
    if other:
        row["name"] = _impact_link(ctx, identifier + "::" + other, feature.name +
                                   (" · " + feature.action.replace("_", " ") if feature.action else ""))
    return row


def _effect_table(tid, title, rows, interaction=False):
    columns = [_col("name", "Interaction with" if interaction else "Feature"), _col("category", "Category"),
               _col("action", "Observation"), _col("stage", "Stage"),
               _col("win_delta", "Win difference (pp)", True), _col("win_range", "Win uncertainty range"),
               _col("score_delta", "Score difference", True), _col("score_range", "Score uncertainty range"),
               _col("samples", "AB / A only / B only / neither" if interaction else "Exposed / controls"),
               _col("owners", "Accounts per cell"), _col("score_samples", "Scored per cell"),
               _col("observed", "Observed exposures", True), _col("status", "Evidence")]
    note = "Matched historical associations. Missing estimates mean insufficient evidence. Counts and uncertainty accompany every estimate."
    if interaction:
        note = ("Interaction = (both − first only) − (second only − neither). "
                "Positive means the combination is associated with more success than the separate differences suggest. "
                "All four cells need support. " + note)
    return _table(tid, title, columns, rows, "No observations support this comparison yet.", note)


def prepare(ctx, store):
    ctx.analysis = for_store(store, ctx.ref)
    selected = {g["id"] for g in ctx.games}
    ctx.analysis_units = frozenset(r["key"] for r in ctx.analysis.runs
                                   if any(g["id"] in selected for g in r["heroes"]))
    ctx.analysis.observations("start")
    ctx.analysis.observations(ctx.filters["stage"])


def section_impacts(ctx, key):
    model = ctx.analysis
    if key:
        first, separator, second = key.partition("::")
        if first not in model.features or (separator and (second not in model.features or first == second)):
            return None
        if separator:
            row = _effect_row(ctx, model, first, second)
            return {"title": model.features[first].name + " × " + model.features[second].name,
                    "intro": "Matched four-cell interaction; missing evidence remains unknown.",
                    "impact": row["estimate"],
                    "tables": [_effect_table("interaction", "Combined interaction", [row], True)],
                    "links": [_feature_link(ctx, model.features[first]), _feature_link(ctx, model.features[second])]}
        feature = model.features[first]
        result = {"title": feature.name, "intro": "Win and final score associations for this recorded feature.",
                  "tables": [], "links": []}
        add_detail(ctx, result, feature.section, feature.key, feature.identifier)
        if feature.section != "actions":
            result["links"].append(ctx.stat(feature.section, feature.key, "Reference & game records"))
        return result
    query = " ".join(str(ctx.query or "").split())[:160]
    terms = query.casefold().replace("_", " ").split()
    first = ctx.comparison if ctx.comparison in model.features else ""
    features = sorted((f for f in model.features.values() if all(term in
                      (f.name + " " + f.identifier + " " + f.action).casefold().replace("_", " ") for term in terms)
                      and f.identifier != first), key=lambda f: (f.section, f.name.casefold(), f.action))
    matches = [{"name": f.name + (" · " + f.action if f.action else ""),
                "href": _impact_link(ctx, first + "::" + f.identifier if first else f.identifier, "")["href"]}
               for f in features[:30]]
    if ctx.lookup:
        return {"title": "Feature lookup", "feature_matches": matches}
    rows = [_effect_row(ctx, model, first, f.identifier) if first else _effect_row(ctx, model, f.identifier)
            for f in features]
    return {"title": "Win & score impact", "intro": (
        "Every reference feature has an evidence row. Use the table filter to find an item, species, class, god, "
        "enemy or action; open it for interactions. Enemy exposure means defeated before the snapshot, "
        "not encountered or killed by. Missing evidence means unknown, not zero effect."),
        "impact_search": {"query": query, "compare": first},
        "feature_matches": matches,
        "tables": [_effect_table("impacts", "Interactions with " + model.features[first].name if first else "Feature estimates",
                                 rows, bool(first))]}


def add_detail(ctx, result, section, key, identifier=None):
    model = ctx.analysis
    identifier = identifier or section + ":" + key
    if identifier not in model.features:
        return
    row = _effect_row(ctx, model, identifier)
    result["impact"] = row["estimate"]
    result["impact_search"] = {"query": "", "compare": identifier}
    result.setdefault("tables", []).insert(0, _effect_table("impact", "Win & final score impact", [row]))
    variations = [f for f in model.features.values() if f.section == section and f.key == key and
                  f.action and f.identifier != identifier]
    if variations:
        result["tables"].insert(1, _effect_table("impact-actions", "Interactions with this feature",
                                               [_effect_row(ctx, model, f.identifier) for f in variations]))
    shared = collections.Counter()
    observations = model.observations(ctx.filters["stage"])
    # Starting-choice pairs also work when only legacy outcomes exist.
    if section in ("species", "jobs"):
        observations = observations + model.observations("start")
    for observation in observations:
        if observation.unit in ctx.analysis_units and identifier in observation.features:
            shared.update(f for f in observation.features if f != identifier)
    candidates = [f for f, _n in sorted(shared.items(), key=lambda p: (-p[1], p[0]))
                  if not (model.features[f].section == section and model.features[f].key == key)][:50]
    result["tables"].append(_effect_table("impact-pairs", "Build & action interactions",
                                          [_effect_row(ctx, model, identifier, f) for f in candidates], True))
    result["tables"][-1]["note"] += " Showing up to 50 observed partners. Use Compare interactions to look up any other pair."


def decorate(ctx, result, section, key):
    if (result.get("impact") or section == "impacts") and not ctx.lookup:
        result["impact_methodology"] = EFFECT_NOTE
    if section in ("species", "jobs", "items", "gods", "monsters", "spells"):
        if key:
            add_detail(ctx, result, section, key)
        else:
            for table in result.get("tables", []):
                for row in table["rows"]:
                    cell = row.get("name")
                    if not isinstance(cell, dict) or not cell.get("href", "").startswith("/stats/" + section + "/"):
                        continue
                    entity = urllib.parse.unquote(cell["href"].split("?", 1)[0].rsplit("/", 1)[1])
                    identifier = section + ":" + entity
                    if identifier not in ctx.analysis.features:
                        continue
                    effect = ctx.analysis.effect(identifier, ctx.filters["stage"], units=ctx.analysis_units)
                    row.update(win_effect=effect["win_delta_pp"], score_effect=effect["score_delta"],
                               impact=_impact_link(ctx, identifier, "Estimate & uncertainty"))
                table["columns"].extend([_col("win_effect", "Win difference (pp)", True),
                                          _col("score_effect", "Score difference", True), _col("impact", "Impact")])
                table["note"] = (table.get("note") or "") + " Matched associations; — means insufficient data. Open Impact for ranges and counts."
    if section == "players":
        result["tables"].insert(0, rating_table(ctx, key))
        if key:
            owners = {owner_key(g, ctx.analysis.aliases) for g in ctx.all_games if key.casefold() in
                      (str(g.get("account") or "").casefold(), str(g.get("account_id") or "").casefold(),
                       str(g.get("name") or "").casefold())}
            events = sorted((event for owner in owners if owner in ctx.analysis.ratings
                             for event in ctx.analysis.ratings[owner].history), key=lambda e: (e["when"], e["key"]),
                            reverse=True)
            result["tables"].insert(1, _table("elo-history", "Elo history", [
                _col("when", "Completed"), _col("outcome", "Result"), _col("rating", "Elo", True),
                _col("change", "Change", True), _col("expected", "Model expectation (%)", True)],
                [{"when": event["when"], "outcome": "Won" if event["won"] else "Lost",
                  "rating": event["rating"], "change": event["change"], "expected": round(100 * event["expected"], 1)}
                 for event in events[:50]], "No rated results yet.",
                "Latest 50 rated expeditions across all dates and modes. Expectations are model outputs and require calibration."))


def rating_table(ctx, key=None):
    model = ctx.analysis
    selected_owners = {owner_key(g, model.aliases) for g in ctx.games}
    if key:
        selected_owners = {owner_key(g, model.aliases) for g in ctx.all_games if key.casefold() in
                           (str(g.get("account") or "").casefold(), str(g.get("account_id") or "").casefold(),
                            str(g.get("name") or "").casefold())}
    names = {owner_key(g, model.aliases): g.get("account") or g.get("name") or "Unknown" for g in ctx.all_games}
    for identifier, name in ctx.library.get("accounts", {}).items():
        if is_test_account(name):
            continue
        owner = "id:" + identifier
        names[owner] = name
        if not any(ctx.filters.get(k) for k in ("account", "mode", "since", "until")) or \
                (key and key.casefold() in (name.casefold(), identifier.casefold())):
            selected_owners.add(owner)
    rows = []
    ranked = sorted(model.ratings, key=lambda owner: (-model.ratings[owner].value, owner))
    ranks = {owner: index + 1 for index, owner in enumerate(ranked)}
    owners = ranked + sorted(set(names) - set(ranked))
    for owner in owners:
        if owner not in selected_owners:
            continue
        rating = model.ratings.get(owner, Rating())
        name = names[owner]
        rows.append({"account": ctx.stat("players", owner[3:] if owner.startswith("id:") else name, name),
                     "rank": ranks.get(owner), "elo": round(rating.value, 1), "games": rating.games,
                     "wins": rating.wins, "change": round(rating.last_change, 1),
                     "status": "Unrated" if not rating.games else "Provisional" if rating.games < 20 else "Established",
                     "identity": "Account" if owner.startswith("id:") else "Unverified legacy name"})
    return _table("global-elo", "Global account Elo", [
        _col("account", "Account"), _col("rank", "Global rank", True), _col("elo", "Elo", True),
        _col("change", "Latest change", True), _col("games", "Rated expeditions", True),
        _col("wins", "Wins", True), _col("status", "Status"), _col("identity", "Identity")], rows,
        "No eligible completed expeditions for these accounts yet. New accounts start at 1500 when their first result is rated.",
        RATING_NOTE)


def section_ratings(ctx, key):
    if key:
        return None
    return {"title": "Global Elo", "intro": "One account rating across solo and co-op expeditions, adjusted for the dungeon challenge.",
            "ratings": {"scope": "server_archive", "initial": 1500, "provisional_games": 20,
                        "rated_expeditions": len(ctx.analysis.runs)},
            "tables": [rating_table(ctx)]}
