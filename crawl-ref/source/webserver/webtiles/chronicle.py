"""Co-op Chronicle persistence module for DCSS WebTiles.

Stores and queries:
  1. All Player Ghosts (both downed ghosts and permadeath ghosts, backed by DCSS bones)
  2. All Party Compositions (members, species/jobs, seed, friendly fire, status)
  3. All Cool Items Found (runes, orbs, gems, unrandarts, randarts, manuals, rare consumables, ego gear)

Manages `./rcs/coop_chronicle.db` (SQLite) and automatically ingests live JSONL
events appended by the C++ `crawl` engine to `./rcs/coop_chronicle.jsonl`.
"""

import datetime
import json
import logging
import os
import sqlite3

DEFAULT_BASE_DIR = "./rcs"
DB_FILENAME = "coop_chronicle.db"
JSONL_FILENAME = "coop_chronicle.jsonl"

CATEGORY_VALUE_SCORES = {
    "orb": 1000,
    "rune": 500,
    "gem": 400,
    "unrandart": 350,
    "randart": 250,
    "manual": 200,
    "rare_consumable": 180,
    "ego_gear": 100,
}


def _utc_now_str():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _get_db_path(base_dir=DEFAULT_BASE_DIR):
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, DB_FILENAME)


def _get_conn(base_dir=DEFAULT_BASE_DIR):
    db_path = _get_db_path(base_dir)
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(base_dir=DEFAULT_BASE_DIR):
    """Initialize the Co-op Chronicle SQLite tables if they do not exist."""
    try:
        with _get_conn(base_dir) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS player_ghosts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    hero_name TEXT,
                    username TEXT,
                    slot INTEGER,
                    species TEXT,
                    job TEXT,
                    xl INTEGER,
                    god TEXT,
                    place TEXT,
                    killer TEXT,
                    hp_max INTEGER,
                    ac INTEGER,
                    ev INTEGER,
                    sh INTEGER,
                    weapon TEXT,
                    down_type TEXT,
                    bones_saved INTEGER
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS party_comps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    comp_name TEXT,
                    host TEXT,
                    player_count INTEGER,
                    friendly_fire INTEGER,
                    seed TEXT,
                    party_spec TEXT,
                    members_json TEXT,
                    deepest_place TEXT,
                    status TEXT
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS cool_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT,
                    item_name TEXT,
                    category TEXT,
                    finder_name TEXT,
                    finder_species TEXT,
                    finder_job TEXT,
                    slot INTEGER,
                    place TEXT,
                    value_score INTEGER
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chronicle_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )
            conn.commit()
    except Exception:
        logging.warning("Failed to initialize coop_chronicle.db", exc_info=True)


def _auto_comp_name(members, party_spec="", player_count=1):
    """Build a descriptive party composition name when none is explicitly provided."""
    if isinstance(members, list) and members:
        tags = []
        for m in members:
            if isinstance(m, dict):
                sp = (m.get("species") or "")[:2]
                jb = (m.get("job") or "")[:2]
                nm = m.get("name") or ""
                if sp and jb:
                    tags.append(f"{nm} ({sp}/{jb})" if nm else f"{sp}/{jb}")
                elif nm:
                    tags.append(nm)
        if tags:
            mode = f"{len(tags)}P Co-op" if len(tags) > 1 else "Solo"
            return f"{mode}: " + " + ".join(tags)
    if party_spec:
        return f"{player_count}P Party ({party_spec})"
    return f"{player_count}P Co-op Expedition"


def record_party_comp(
    comp_name="",
    host="",
    player_count=1,
    friendly_fire=False,
    party_spec="",
    members=None,
    seed="",
    status="Active",
    deepest_place="D:1",
    timestamp=None,
    base_dir=DEFAULT_BASE_DIR,
    **kwargs,
):
    """Record a party composition in coop_chronicle.db."""
    init_db(base_dir)
    ts = timestamp or _utc_now_str()
    if members is None:
        members = []
    if isinstance(members, str):
        members_json = members
        try:
            members_list = json.loads(members)
        except Exception:
            members_list = []
    else:
        members_list = list(members)
        members_json = json.dumps(members_list)

    if not host and members_list and isinstance(members_list[0], dict):
        host = members_list[0].get("name") or members_list[0].get("username") or "Host"

    if not comp_name:
        comp_name = _auto_comp_name(members_list, party_spec, int(player_count or 1))

    try:
        with _get_conn(base_dir) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO party_comps (
                    timestamp, comp_name, host, player_count, friendly_fire,
                    seed, party_spec, members_json, deepest_place, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    str(comp_name),
                    str(host or ""),
                    int(player_count or 1),
                    1 if friendly_fire else 0,
                    str(seed or ""),
                    str(party_spec or ""),
                    members_json,
                    str(deepest_place or "D:1"),
                    str(status or "Active"),
                ),
            )
            conn.commit()
            return cur.lastrowid
    except Exception:
        logging.warning("Failed to record party comp", exc_info=True)
        return None


def record_player_ghost(
    hero_name,
    species="",
    job="",
    xl=1,
    place="D:1",
    killer="",
    username="",
    slot=0,
    god="No God",
    hp_max=0,
    ac=0,
    ev=0,
    sh=0,
    weapon="unarmed",
    down_type="permadeath_ghost",
    bones_saved=True,
    timestamp=None,
    base_dir=DEFAULT_BASE_DIR,
    **kwargs,
):
    """Record a player ghost in coop_chronicle.db."""
    init_db(base_dir)
    ts = timestamp or _utc_now_str()
    try:
        with _get_conn(base_dir) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO player_ghosts (
                    timestamp, hero_name, username, slot, species, job, xl,
                    god, place, killer, hp_max, ac, ev, sh, weapon, down_type, bones_saved
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    str(hero_name or "Unknown"),
                    str(username or hero_name or ""),
                    int(slot or 0),
                    str(species or ""),
                    str(job or ""),
                    int(xl or 1),
                    str(god or "No God"),
                    str(place or "D:1"),
                    str(killer or "unknown"),
                    int(hp_max or 0),
                    int(ac or 0),
                    int(ev or 0),
                    int(sh or 0),
                    str(weapon or "unarmed"),
                    str(down_type or "permadeath_ghost"),
                    1 if bones_saved else 0,
                ),
            )
            if place:
                if down_type == "permadeath_ghost":
                    cur.execute(
                        """
                        UPDATE party_comps
                        SET deepest_place = ?, status = ?
                        WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                        """,
                        (str(place), f"Fallen ({place})"),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE party_comps
                        SET deepest_place = ?
                        WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                        """,
                        (str(place),),
                    )
            conn.commit()
            return cur.lastrowid
    except Exception:
        logging.warning("Failed to record player ghost", exc_info=True)
        return None


def record_cool_item(
    item_name,
    category="ego_gear",
    finder_name="",
    finder_species="",
    finder_job="",
    slot=0,
    place="D:1",
    value_score=None,
    timestamp=None,
    base_dir=DEFAULT_BASE_DIR,
    **kwargs,
):
    """Record a cool item discovery in coop_chronicle.db."""
    init_db(base_dir)
    ts = timestamp or _utc_now_str()
    cat_str = str(category or "ego_gear")
    if value_score is None or int(value_score or 0) <= 0:
        score = CATEGORY_VALUE_SCORES.get(cat_str, 100)
    else:
        score = int(value_score)

    try:
        with _get_conn(base_dir) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO cool_items (
                    timestamp, item_name, category, finder_name, finder_species,
                    finder_job, slot, place, value_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ts,
                    str(item_name or "Unknown Item"),
                    cat_str,
                    str(finder_name or ""),
                    str(finder_species or ""),
                    str(finder_job or ""),
                    int(slot or 0),
                    str(place or "D:1"),
                    score,
                ),
            )
            if place:
                cur.execute(
                    """
                    UPDATE party_comps
                    SET deepest_place = ?
                    WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                    """,
                    (str(place),),
                )
            conn.commit()
            return cur.lastrowid
    except Exception:
        logging.warning("Failed to record cool item", exc_info=True)
        return None


def _ingest_single_jsonl_file(conn, jsonl_path):
    if not os.path.isfile(jsonl_path):
        return 0

    meta_key = f"offset:{os.path.abspath(jsonl_path)}"
    cur = conn.cursor()
    cur.execute("SELECT value FROM chronicle_meta WHERE key = ?", (meta_key,))
    row = cur.fetchone()
    offset = int(row["value"]) if row and row["value"].isdigit() else 0

    try:
        file_size = os.path.getsize(jsonl_path)
    except OSError:
        return 0

    if file_size < offset:
        offset = 0

    if file_size == offset:
        return 0

    ingested = 0
    ts = _utc_now_str()
    with open(jsonl_path, "r", encoding="utf-8", errors="replace") as f:
        f.seek(offset)
        while True:
            line = f.readline()
            if not line:
                break
            if not line.endswith("\n") and f.tell() == file_size:
                # Incomplete trailing line being written concurrently; wait for next poll.
                break
            offset = f.tell()
            raw = line.strip()
            if not raw:
                continue
            try:
                evt = json.loads(raw)
            except Exception:
                continue

            evt_type = evt.get("type")
            evt_ts = evt.get("timestamp") or ts

            if evt_type == "ghost":
                hero_name = evt.get("hero_name") or "Unknown"
                place = evt.get("place") or "D:1"
                down_type = evt.get("down_type") or "permadeath_ghost"
                cur.execute(
                    """
                    INSERT INTO player_ghosts (
                        timestamp, hero_name, username, slot, species, job, xl,
                        god, place, killer, hp_max, ac, ev, sh, weapon, down_type, bones_saved
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        evt_ts,
                        str(hero_name),
                        str(evt.get("username") or hero_name),
                        int(evt.get("slot") or 0),
                        str(evt.get("species") or ""),
                        str(evt.get("job") or ""),
                        int(evt.get("xl") or 1),
                        str(evt.get("god") or "No God"),
                        str(place),
                        str(evt.get("killer") or "unknown"),
                        int(evt.get("hp_max") or 0),
                        int(evt.get("ac") or 0),
                        int(evt.get("ev") or 0),
                        int(evt.get("sh") or 0),
                        str(evt.get("weapon") or "unarmed"),
                        str(down_type),
                        1 if evt.get("bones_saved", True) else 0,
                    ),
                )
                if down_type == "permadeath_ghost":
                    cur.execute(
                        """
                        UPDATE party_comps
                        SET deepest_place = ?, status = ?
                        WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                        """,
                        (str(place), f"Fallen ({place})"),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE party_comps
                        SET deepest_place = ?
                        WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                        """,
                        (str(place),),
                    )
                ingested += 1

            elif evt_type == "party_comp":
                members = evt.get("members") or []
                party_spec = str(evt.get("party_spec") or "")
                player_count = int(evt.get("player_count") or len(members) or 1)
                friendly_fire = 1 if evt.get("friendly_fire") else 0
                seed = str(evt.get("seed") or "")
                place = str(evt.get("place") or "D:1")
                comp_name = evt.get("comp_name") or _auto_comp_name(
                    members, party_spec, player_count
                )
                host = evt.get("host") or (
                    members[0].get("name", "Host")
                    if members and isinstance(members[0], dict)
                    else "Host"
                )
                members_json = json.dumps(members)

                # Check if ws_handler recently created a matching party_comps row without a seed
                cur.execute(
                    """
                    SELECT id, seed, comp_name FROM party_comps
                    ORDER BY id DESC LIMIT 1
                    """
                )
                last_comp = cur.fetchone()
                if last_comp and not last_comp["seed"] and seed:
                    cur.execute(
                        """
                        UPDATE party_comps
                        SET seed = ?, party_spec = COALESCE(NULLIF(party_spec, ''), ?),
                            members_json = ?, deepest_place = ?, player_count = ?,
                            friendly_fire = ?
                        WHERE id = ?
                        """,
                        (
                            seed,
                            party_spec,
                            members_json,
                            place,
                            player_count,
                            friendly_fire,
                            last_comp["id"],
                        ),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO party_comps (
                            timestamp, comp_name, host, player_count, friendly_fire,
                            seed, party_spec, members_json, deepest_place, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            evt_ts,
                            str(comp_name),
                            str(host),
                            player_count,
                            friendly_fire,
                            seed,
                            party_spec,
                            members_json,
                            place,
                            str(evt.get("status") or "Active"),
                        ),
                    )
                ingested += 1

            elif evt_type == "cool_item":
                cat_str = str(evt.get("category") or "ego_gear")
                val_score = evt.get("value_score")
                if val_score is None or int(val_score or 0) <= 0:
                    val_score = CATEGORY_VALUE_SCORES.get(cat_str, 100)
                else:
                    val_score = int(val_score)
                place = str(evt.get("place") or "D:1")
                cur.execute(
                    """
                    INSERT INTO cool_items (
                        timestamp, item_name, category, finder_name, finder_species,
                        finder_job, slot, place, value_score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        evt_ts,
                        str(evt.get("item_name") or "Unknown Item"),
                        cat_str,
                        str(evt.get("finder_name") or ""),
                        str(evt.get("finder_species") or ""),
                        str(evt.get("finder_job") or ""),
                        int(evt.get("slot") or 0),
                        place,
                        val_score,
                    ),
                )
                cur.execute(
                    """
                    UPDATE party_comps
                    SET deepest_place = ?
                    WHERE id = (SELECT id FROM party_comps ORDER BY id DESC LIMIT 1)
                    """,
                    (place,),
                )
                ingested += 1

    cur.execute(
        "INSERT OR REPLACE INTO chronicle_meta (key, value) VALUES (?, ?)",
        (meta_key, str(offset)),
    )
    conn.commit()
    return ingested


def ingest_jsonl_events(base_dir=DEFAULT_BASE_DIR):
    """Ingest any new JSONL events from coop_chronicle.jsonl into SQLite."""
    init_db(base_dir)
    total = 0
    try:
        with _get_conn(base_dir) as conn:
            candidates = [
                os.path.join(base_dir, JSONL_FILENAME),
                os.path.join(base_dir, "saves", JSONL_FILENAME),
            ]
            seen_realpaths = set()
            for path in candidates:
                if os.path.isfile(path):
                    rp = os.path.realpath(path)
                    if rp not in seen_realpaths:
                        seen_realpaths.add(rp)
                        total += _ingest_single_jsonl_file(conn, path)
    except Exception:
        logging.warning("Failed to ingest coop_chronicle.jsonl events", exc_info=True)
    return total


def get_chronicle_summary(limit=25, base_dir=DEFAULT_BASE_DIR):
    """Return latest player ghosts, party comps, and cool items found."""
    init_db(base_dir)
    ingest_jsonl_events(base_dir)

    ghosts = []
    party_comps = []
    cool_items = []

    try:
        with _get_conn(base_dir) as conn:
            cur = conn.cursor()

            cur.execute(
                """
                SELECT id, timestamp, hero_name, username, slot, species, job, xl,
                       god, place, killer, hp_max, ac, ev, sh, weapon, down_type, bones_saved
                FROM player_ghosts
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(limit),),
            )
            for r in cur.fetchall():
                d = dict(r)
                d["bones_saved"] = bool(d.get("bones_saved"))
                ghosts.append(d)

            cur.execute(
                """
                SELECT id, timestamp, comp_name, host, player_count, friendly_fire,
                       seed, party_spec, members_json, deepest_place, status
                FROM party_comps
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(limit),),
            )
            for r in cur.fetchall():
                d = dict(r)
                d["friendly_fire"] = bool(d.get("friendly_fire"))
                try:
                    d["members"] = json.loads(d.get("members_json") or "[]")
                except Exception:
                    d["members"] = []
                spec_tokens = [t.strip() for t in str(d.get("party_spec") or "").split(",") if t.strip()]
                d["seasonings"] = [t.split("=", 1)[1] for t in spec_tokens if t.startswith("seasoning=")]
                place_str = str(d.get("deepest_place") or "D:1")
                depth_digits = "".join(ch for ch in place_str if ch.isdigit())
                depth_val = int(depth_digits) if depth_digits else 1
                mult = 1.0 + (0.15 if d["friendly_fire"] else 0.0) + (0.20 * len(d["seasonings"]))
                d["broth_score"] = int(round((depth_val * 240 + int(d.get("player_count") or 1) * 110) * mult))
                lead_name = d["members"][0].get("name") if d["members"] and isinstance(d["members"][0], dict) else (d.get("host") or "Chef")
                if d["members"] and isinstance(d["members"][0], dict) and d["members"][0].get("mvp_title"):
                    d["mvp_citation"] = f"{d['members'][0]['mvp_title']}: {lead_name}"
                elif "fast_boil" in d["seasonings"]:
                    d["mvp_citation"] = f"Boil Runner: {lead_name}"
                elif d["friendly_fire"] and int(d.get("player_count") or 1) > 1:
                    d["mvp_citation"] = f"Spice Hazard: {lead_name}"
                else:
                    d["mvp_citation"] = f"Head Butcher: {lead_name}"
                party_comps.append(d)

            cur.execute(
                """
                SELECT id, timestamp, item_name, category, finder_name,
                       finder_species, finder_job, slot, place, value_score
                FROM cool_items
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(limit),),
            )
            for r in cur.fetchall():
                cool_items.append(dict(r))
    except Exception:
        logging.warning("Failed to query coop_chronicle.db", exc_info=True)

    return {
        "ghosts": ghosts,
        "party_comps": party_comps,
        "cool_items": cool_items,
    }
