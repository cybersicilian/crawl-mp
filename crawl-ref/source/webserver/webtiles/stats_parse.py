"""Pure parsers for the stats sources: xlogfile/milestones, hero_snapshot
events and morgue files, plus shared constants (see docs/stats.md)."""
import collections
import datetime
import os
import re

RCS_DIR = os.environ.get("CRAWL_STATS_RCS_DIR", "./rcs")
FIXTURE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "util", "fixtures", "stats-reference.json")
INGEST_INTERVAL = 30          # seconds between lazy re-ingests
PERIODIC_INTERVAL_MS = 5 * 60 * 1000
BINARY_TIMEOUT = 120

SECTIONS = collections.OrderedDict([
    ("overview", "Overview"), ("combos", "Combos"), ("species", "Species"),
    ("jobs", "Backgrounds"), ("monsters", "Monsters"), ("items", "Items"),
    ("spells", "Spells"), ("gods", "Gods"), ("branches", "Branches"),
    ("deaths", "Deaths"), ("players", "Players & heroes"), ("skills", "Skills"),
    ("mutations", "Mutations"), ("impacts", "Win & score impact"), ("ratings", "Global Elo"),
])
PRIORITY = {"snapshot": 4, "xlog": 3, "morgue": 2, "library": 1}
ITEM_CATEGORIES = collections.OrderedDict([
    ("weapons", "Weapons"), ("armour", "Armour"), ("missiles", "Missiles"),
    ("wands", "Wands"), ("staves", "Staves"), ("potions", "Potions"),
    ("scrolls", "Scrolls"), ("jewellery", "Jewellery"), ("misc", "Evokers & misc"),
    ("talismans", "Talismans"), ("books", "Books"), ("weapon_brands", "Weapon brands"),
    ("armour_egos", "Armour egos"), ("unrands", "Unrandarts"),
])
# Action-table categories (lowercased) -> item categories they consume.
ACTION_ITEM_CATEGORIES = {
    "quaff": ("potions",), "drink": ("potions",), "read": ("scrolls",),
    "evoke": ("wands", "misc", "staves", "talismans"), "zap": ("wands",),
    "melee": ("weapons", "unrands"), "fire": ("weapons", "missiles"),
    "throw": ("missiles",), "armour": ("armour",),
}
OUTCOME_LABELS = {"alive": "In progress", "dead": "Fallen", "won": "Won",
                  "quit": "Quit", "left": "Left the dungeon"}
KTYP_LABELS = {
    "mon": "Slain by a monster", "beam": "Struck by a ranged attack", "pois": "Poison",
    "cloud": "Cloud", "lava": "Lava", "water": "Drowned", "starvation": "Starvation",
    "stupidity": "Stupidity", "weakness": "Weakness", "clumsiness": "Clumsiness",
    "trap": "Trap", "quitting": "Quit", "winning": "Won", "leaving": "Left the dungeon",
    "wizmode": "Wizard mode", "draining": "Drained", "rotting": "Rotting",
    "spore": "Spores", "targeting": "Own spell", "spell": "Own spell", "acid": "Acid",
    "curare": "Curare", "melting": "Melting", "bleeding": "Bleeding", "tso_smiting": "Smitten",
    "divine_wrath": "Divine wrath", "bounce": "Own bolt", "reflect": "Reflected bolt",
    "self_aimed": "Own spell", "falling_through_gate": "Fell", "disintegration": "Disintegrated",
    "mirror_damage": "Mirror damage", "headbutt": "Headbutt", "rolling": "Rolling",
    "zot": "Zot", "freezing": "Froze", "barbs": "Barbs", "being_thrown": "Thrown",
    "collision": "Collision", "zombie": "Zombified", "unknown": "Unknown",
}
BRANCH_ABBREVS = {
    "d": "Dungeon", "temple": "Temple", "lair": "Lair", "swamp": "Swamp",
    "shoals": "Shoals", "snake": "Snake Pit", "spider": "Spider Nest",
    "slime": "Slime Pits", "orc": "Orcish Mines", "elf": "Elven Halls",
    "vaults": "Vaults", "crypt": "Crypt", "tomb": "Tomb", "depths": "Depths",
    "zot": "Zot", "hell": "Hell", "dis": "Dis", "geh": "Gehenna",
    "coc": "Cocytus", "tar": "Tartarus", "abyss": "Abyss", "pan": "Pandemonium",
    "zig": "Ziggurat", "bazaar": "Bazaar", "trove": "Trove", "sewer": "Sewer",
    "ossuary": "Ossuary", "bailey": "Bailey", "icecv": "Ice Cave",
    "volcano": "Volcano", "wizlab": "Wizlab", "desolation": "Desolation",
    "gauntlet": "Gauntlet", "arena": "Arena", "crucible": "Crucible",
    "labyrinth": "Labyrinth", "lab": "Labyrinth", "blade": "Hall of Blades",
    "hall": "Hall of Blades", "forest": "Enchanted Forest", "ecumenical temple": "Temple",
    "the dungeon": "Dungeon", "pits of slime": "Slime Pits",
}
PLACE_ABBREVS = {"Dungeon": "D", "Orcish Mines": "Orc", "Snake Pit": "Snake", "Spider Nest": "Spider",
                 "Slime Pits": "Slime", "Elven Halls": "Elf", "Gehenna": "Geh", "Cocytus": "Coc",
                 "Tartarus": "Tar", "Pandemonium": "Pan", "Ziggurat": "Zig", "Ice Cave": "IceCv"}
SKELETON_REFERENCE = {"version": "", "monsters": [], "items": {}, "spells": [], "species": [],
                      "jobs": [], "combos": [], "gods": [], "mutations": [], "skills": [],
                      "branches": []}
FILTER_KEYS = ("account", "mode", "since", "until", "include_wizmode", "stage")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def slug(value):
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")


def _int(value, default=None):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def xlog_time(value):
    """xlog timestamps use a zero-based month: 20260916150207D == 2026-10-16."""
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})", str(value or ""))
    if not m:
        return None
    y, mo, d, h, mi, s = (int(x) for x in m.groups())
    try:
        return _iso(datetime.datetime(y, mo + 1, d, h, mi, s))
    except ValueError:
        return None


def snapshot_time(value):
    """Snapshot ``start`` is YYYYMMDDHHMMSS with a calendar (1-based) month;
    ISO strings are accepted too."""
    text = str(value or "").strip()
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})", text)
    if m:
        y, mo, d, h, mi, s = (int(x) for x in m.groups())
        try:
            return _iso(datetime.datetime(y, mo or 1, d, h, mi, s))
        except ValueError:
            return None
    return iso_time(text)


def iso_time(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        dt = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo:
        dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return _iso(dt)


def _seconds(iso):
    try:
        return datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").timestamp()
    except (TypeError, ValueError):
        return None


def dedup_key(name, start):
    return "%s|%s" % (str(name or "").lower(), start or "")


def parse_xlog_line(line):
    """Parse one xlogfile/milestones line. ``::`` is an escaped literal colon."""
    line = line.rstrip("\r\n")
    if not line.strip():
        return None
    fields = {}
    for part in line.replace("::", "\0").split(":"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        fields[key] = value.replace("\0", ":")
    return fields or None


def _strip_article(name):
    return re.sub(r"^(?:an?|the)\s+", "", str(name or "").strip(), flags=re.I)


def _plural_forms(name):
    lname = name.lower()
    if " of " in lname:
        head, tail = lname.split(" of ", 1)
        return [h + " of " + tail for h in _plural_forms(head)]
    forms = {lname + "s", lname}
    if re.search(r"(s|sh|ch|x|z)$", lname):
        forms.add(lname + "es")
    if re.search(r"[^aeiou]y$", lname):
        forms.add(lname[:-1] + "ies")
    if lname.endswith("f"):
        forms.add(lname[:-1] + "ves")
    if lname.endswith("fe"):
        forms.add(lname[:-2] + "ves")
    if lname.endswith("man"):
        forms.add(lname[:-3] + "men")
    if lname.endswith("us"):
        forms.add(lname[:-2] + "i")
    if lname.endswith("mouse"):
        forms.add(lname[:-5] + "mice")
    if lname.endswith("child"):
        forms.add(lname + "ren")
    return list(forms)


def _xlog_outcome(ktyp):
    return {"winning": "won", "quitting": "quit", "leaving": "left",
            "wizmode": "quit"}.get(ktyp or "", "dead")


def _branch_name(value):
    text = str(value or "").strip()
    if not text:
        return ""
    text = text.split(":")[0]
    return BRANCH_ABBREVS.get(text.lower(), text)


# --------------------------------------------------------------------------
# Source parsers (pure functions, unit-tested)
# --------------------------------------------------------------------------

def xlog_game(fields):
    name = fields.get("name")
    start = xlog_time(fields.get("start"))
    if not name or not start:
        return None
    ktyp = fields.get("ktyp", "")
    end = xlog_time(fields.get("end"))
    killer = fields.get("killer") or ""
    if not killer and ktyp not in ("winning", "quitting", "leaving", "wizmode"):
        killer = fields.get("kaux") or ""
    return {
        "name": name, "species": fields.get("race", ""), "job": fields.get("cls", ""),
        "xl": _int(fields.get("xl")), "turns": _int(fields.get("turn")),
        "dur": _int(fields.get("dur")), "place": fields.get("place", ""),
        "branch": _branch_name(fields.get("br") or fields.get("place")),
        "depth": _int(fields.get("absdepth")), "god": fields.get("god", ""),
        "piety": _int(fields.get("piety")), "runes": _int(fields.get("urune") or fields.get("nrune"), 0),
        "score": _int(fields.get("sc")), "outcome": _xlog_outcome(ktyp), "ktyp": ktyp,
        "killer": killer, "start_ts": start, "end_ts": end, "updated": end or start,
        "wizmode": ktyp == "wizmode" or fields.get("wiz") == "1" or fields.get("explore") == "1",
        "version": fields.get("vlong") or fields.get("v", ""), "seed": fields.get("seed", ""),
        "kill_total": _int(fields.get("kills")), "hp_max": _int(fields.get("mhp")),
        "ac": _int(fields.get("ac")), "ev": _int(fields.get("ev")), "sh": _int(fields.get("sh")),
        "str": _int(fields.get("str")), "int": _int(fields.get("int")), "dex": _int(fields.get("dex")),
        "gold": _int(fields.get("gold")), "final": True,
        "skills": ({fields["sk"]: _float(fields.get("sklev"))} if fields.get("sk") else {}),
    }


def snapshot_game(event):
    if event.get("type") != "hero_snapshot":
        return None
    name = event.get("name") or ""
    start = snapshot_time(event.get("start"))
    if not name and not (event.get("game_id") and event.get("hero_id")):
        return None
    updated = iso_time(event.get("time")) or start
    outcome = event.get("outcome") or ("alive" if not event.get("final") else "dead")
    runes = event.get("runes")
    game = dict(event)
    game.update({
        "name": name, "start_ts": start, "updated": updated,
        "end_ts": updated if event.get("final") else None,
        "branch": _branch_name(event.get("branch") or event.get("place")),
        "runes": len(runes) if isinstance(runes, list) else _int(runes, 0),
        "rune_list": runes if isinstance(runes, list) else [],
        "outcome": outcome, "final": bool(event.get("final")),
        "wizmode": event.get("ktyp") == "wizmode" or bool(event.get("wizard")) or bool(event.get("wizmode")),
        "party_size": _int(event.get("party_size"), 1) or 1,
        "account_id": event.get("account_id") or "",
        "kills": {str(k): _int(v, 0) for k, v in (event.get("kills") or {}).items()},
    })
    return game


_SPECIES_LINE = re.compile(r"Began as an? (.+?) on ")
_HEADER = re.compile(r"^\s*(\d+)\s+(\S.*?) the .*?\(level (\d+),")


def parse_morgue(text, filename=""):
    """Extract what a morgue/character dump records about one finished game."""
    lines = text.splitlines()
    game = {"final": True, "kill_names": {}, "actions": {}, "skills": {}, "equipment": [],
            "spells_known": [], "branches_visited": [], "outcome": "dead"}
    m = re.match(r"morgue-(.+)-(\d{8})-(\d{6})\.txt$", os.path.basename(filename))
    if m:
        game["name"] = m.group(1)
        try:
            game["end_ts"] = _iso(datetime.datetime.strptime(m.group(2) + m.group(3), "%Y%m%d%H%M%S"))
        except ValueError:
            pass
    head = "\n".join(lines[:40])
    v = re.search(r"version (\S+)", head)
    if v:
        game["version"] = v.group(1)
    s = re.search(r"Game seed: (\d+)", head)
    if s:
        game["seed"] = s.group(1)
    if re.search(r"wizard mode|\bwizmode\b", head, re.I):
        game["wizmode"] = True
    for line in lines[:40]:
        h = _HEADER.match(line)
        if h and "score" not in game:
            game["score"] = int(h.group(1))
            game.setdefault("name", h.group(2))
            game["xl"] = int(h.group(3))
        sp = _SPECIES_LINE.search(line)
        if sp:
            game["combo_raw"] = sp.group(1).strip()
        k = re.search(r"^\s+(Slain|Killed|Mangled|Blown up|Annihilated|Shot|Hit|Burnt|Frozen|"
                      r"Drowned|Engulfed|Poisoned|Drained|Smote|Crushed|Eviscerated|Splattered) by (.+?)"
                      r"(?: \(\d+ damage\))?$", line)
        if k and "killer" not in game:
            game["killer"] = k.group(2)
            game["ktyp"] = "mon"
        if re.search(r"Escaped with the Orb", line):
            game["outcome"], game["ktyp"] = "won", "winning"
        elif re.search(r"Quit the game", line):
            game["outcome"], game["ktyp"] = "quit", "quitting"
        elif re.search(r"Got out of the dungeon alive", line):
            game["outcome"], game["ktyp"] = "left", "leaving"
        t = re.search(r"\((\d+) turns\)", line)
        if t:
            game["turns"] = int(t.group(1))
        p = re.search(r"\.\.\. (?:on|in) (?:level (\d+) of )?(.+?)\.$", line.strip())
        if p and "place_text" not in game:
            game["place_text"] = p.group(0)
            branch = _branch_name(p.group(2).replace("the ", "", 1))
            game["branch"] = branch
            short = PLACE_ABBREVS.get(branch, branch)
            game["place"] = "%s:%s" % (short, p.group(1)) if p.group(1) else short
        g = re.search(r"God:\s+(\S.*?)(?:\s+\[|\s{2,}|$)", line)
        if g and g.group(1).strip():
            game["god"] = g.group(1).strip()
        stat = re.search(r"Health:\s*-?\d+/(\d+)\s+AC:\s*(-?\d+)\s+Str:\s*(\d+)", line)
        if stat:
            game["hp_max"], game["ac"], game["str"] = (int(x) for x in stat.groups())
    i, n = 0, len(lines)
    action_cat = ""
    while i < n:
        line = lines[i]
        stripped = line.strip()
        if stripped == "Vanquished Creatures":
            i += 1
            while i < n and lines[i].strip() and not re.match(r"^\d+ creatures? vanquished", lines[i].strip()):
                vm = re.match(r"^\s+(?:(\d+)\s+|(?:an?|the)\s+)?(.+?)(?:\s+\(([^)]*)\))?\s*$",
                              lines[i], re.I)
                if vm:
                    count = int(vm.group(1) or 1)
                    nm = vm.group(2).strip()
                    game["kill_names"][nm] = game["kill_names"].get(nm, 0) + count
                i += 1
            continue
        if re.match(r"^Action\s+\|\|", line):
            i += 1
            while i < n and "||" in lines[i] or (i < n and lines[i].startswith("---")):
                row = lines[i]
                i += 1
                if row.startswith("---") or "||" not in row:
                    continue
                left, right = row.split("||", 1)
                nums = re.findall(r"\d+", right)
                if not nums:
                    continue
                if ":" in left:
                    cat, name = left.split(":", 1)
                    action_cat = cat.strip().lower() or action_cat
                else:
                    name = left
                name = name.strip()
                if action_cat and name:
                    bucket = game["actions"].setdefault(action_cat, {})
                    bucket[name] = bucket.get(name, 0) + int(nums[-1])
            continue
        if stripped == "Skills:":
            i += 1
            while i < n:
                sm = re.match(r"^\s*[+\-*O]?\s*Level\s+([\d.]+)(?:\([\d.]+\))?\s+(.+?)\s*$", lines[i])
                if sm:
                    game["skills"][sm.group(2)] = float(sm.group(1))
                elif lines[i].strip() and game["skills"]:
                    break
                elif not lines[i].strip() and game["skills"]:
                    break
                i += 1
            continue
        if re.match(r"^You knew the following spells", stripped):
            i += 1
            while i < n and not lines[i].strip():
                i += 1
            i += 1  # header row
            while i < n and lines[i].strip():
                spm = re.match(r"^\s*[a-zA-Z] - (.+?)\s{2,}", lines[i])
                if spm:
                    game["spells_known"].append(spm.group(1).strip())
                i += 1
            continue
        if stripped == "Branches:":
            i += 1
            while i < n and lines[i].strip():
                for bm in re.finditer(r"([A-Z][A-Za-z' ]*?) \((\d+)/(\d+)\)", lines[i]):
                    game["branches_visited"].append(_branch_name(bm.group(1).strip()))
                i += 1
            continue
        if stripped == "Inventory:":
            i += 1
            while i < n and not re.match(r"^\s+Skills:", lines[i]):
                em = re.match(r"^\s*([a-zA-Z]) - (.+?) \(([^)]*)\)\s*$", lines[i])
                if em and not re.search(r"quivered", em.group(3)) and re.search(
                        r"weapon|worn|wielded|hand|neck|offhand|finger|ring|amulet|in use|active",
                        em.group(3)):
                    game["equipment"].append({"slot": em.group(3), "name": em.group(2)})
                i += 1
            continue
        i += 1
    if not game.get("branch") and game.get("place"):
        game["branch"] = _branch_name(game["place"])
    if game.get("branch") and game["branch"] not in game["branches_visited"]:
        game["branches_visited"].append(game["branch"])
    game["updated"] = game.get("end_ts")
    return game
