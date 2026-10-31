"""Bounded pre-result landmarks retained from the existing snapshot stream."""
import collections
import json

STAGES = {"1": "XL 1–4", "5": "XL 5–9", "10": "XL 10–14",
          "15": "XL 15–19", "20": "XL 20–27"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS landmarks (skey TEXT NOT NULL, stage TEXT NOT NULL,
    turns INTEGER NOT NULL, updated TEXT NOT NULL, row_json TEXT NOT NULL,
    PRIMARY KEY (skey, stage));
"""


def prepare(conn):
    conn.executescript(SCHEMA)
    # Existing caches must replay old event files once, to recover landmarks.
    if not conn.execute("SELECT 1 FROM meta WHERE key = 'landmarks_v1'").fetchone():
        conn.execute("UPDATE files SET offset = 0, size = 0, mtime_ns = 0 WHERE kind = 'events'")
        conn.execute("INSERT INTO meta VALUES ('landmarks_v1', '1')")
        conn.commit()


def record(conn, skey, game):
    xl, turns = game.get("xl"), game.get("turns")
    if game.get("final") or game.get("downed") or game.get("outcome") != "alive" or game.get("wizmode") or \
            not isinstance(xl, int) or not 1 <= xl <= 27 or \
            not isinstance(turns, int) or turns < 0 or not game.get("updated"):
        return False
    stage = str(max(int(s) for s in STAGES if int(s) <= xl))
    old = conn.execute("SELECT turns, updated FROM landmarks WHERE skey = ? AND stage = ?",
                       (skey, stage)).fetchone()
    if old and (old["turns"], old["updated"]) <= (turns, game["updated"]):
        return False
    conn.execute("INSERT OR REPLACE INTO landmarks VALUES (?, ?, ?, ?, ?)",
                 (skey, stage, turns, game["updated"], json.dumps(game)))
    return True


def attach(conn, rows):
    by = collections.defaultdict(list)
    for row in conn.execute("SELECT skey, stage, row_json FROM landmarks"):
        by[row["skey"]].append(dict(json.loads(row["row_json"]), stage=row["stage"]))
    for row in rows:
        if row["source"] == "snapshot" and row["skey"] in by:
            game = json.loads(row["row_json"])
            game["observations"] = by[row["skey"]]
            row["row_json"] = json.dumps(game)
