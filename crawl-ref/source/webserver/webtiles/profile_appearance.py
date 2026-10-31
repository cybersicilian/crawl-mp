"""Account-owned appearance settings; native game state is never involved."""
import logging
import sqlite3

from webtiles import userdb

DEFAULT_PACK = "classic"
PACKS = (
    {"id": "classic", "label": "Classic", "description": "Original Crawl terrain and sprites."},
    {"id": "illustrated", "label": "Illustrated", "description":
     "Painted terrain, soft material transitions, and illustrated environmental sprites."},
)
PACK_IDS = frozenset(pack["id"] for pack in PACKS)


def _schema(db):
    db.execute("""CREATE TABLE IF NOT EXISTS profile_appearance (
        username TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
        texture_pack TEXT NOT NULL CHECK(texture_pack IN ('classic', 'illustrated'))
    )""")


def get_pack(username):
    if not username:
        return DEFAULT_PACK
    with userdb.settings_db as db:
        _schema(db)
        row = db.execute("SELECT texture_pack FROM profile_appearance WHERE username=?",
                         (username,)).fetchone()
    return row[0] if row and row[0] in PACK_IDS else DEFAULT_PACK


def set_pack(username, texture_pack):
    if not username:
        raise ValueError("Sign in to save your texture pack.")
    if not isinstance(texture_pack, str) or texture_pack not in PACK_IDS:
        raise ValueError("Choose Classic or Illustrated.")
    with userdb.settings_db as db:
        _schema(db)
        db.execute("""INSERT INTO profile_appearance(username, texture_pack) VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET texture_pack=excluded.texture_pack""",
                   (username, texture_pack))
    return texture_pack


def state(username):
    return {"username": username, "texture_pack": get_pack(username), "available": True}


def send_state(socket, queued=False):
    if not socket.username:
        return
    try:
        payload = state(socket.username)
    except (sqlite3.Error, OSError):
        logging.warning("Profile appearance settings are temporarily unavailable")
        payload = {"username": socket.username, "texture_pack": DEFAULT_PACK, "available": False}
    sender = socket.queue_message if queued else socket.send_message
    sender("profile_appearance", **payload)
