"""Which tutorial tips an account has met, independent of characters and saves."""
import json
import logging
from pathlib import Path
import sqlite3

from webtiles import system_one, userdb

CATALOG = json.loads((Path(__file__).parents[1] / 'static/tutorial-tips.json').read_text())
TIPS = {tip['id']: tip for tip in CATALOG['tips']}


def _schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS profile_tips (
        username TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
        seen TEXT NOT NULL
    )''')


def _read(db, username):
    row = db.execute('SELECT seen FROM profile_tips WHERE username=?', (username,)).fetchone()
    return set(json.loads(row[0])) & TIPS.keys() if row else set()


def seen(username):
    with userdb.settings_db as db:
        _schema(db)
        return sorted(_read(db, username))


def mark(username, ids):
    """Merge inside one transaction so two open games cannot drop each other's tips."""
    if not isinstance(ids, list) or not all(isinstance(key, str) for key in ids):
        raise ValueError('Tips are named by their catalog ids.')
    known = set(ids) & TIPS.keys()
    if not known:
        return
    with userdb.settings_db as db:
        _schema(db)
        db.execute('BEGIN IMMEDIATE')
        merged = sorted(_read(db, username) | known)
        db.execute('''INSERT INTO profile_tips(username, seen) VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET seen=excluded.seen''',
                   (username, json.dumps(merged)))


def reset(username):
    with userdb.settings_db as db:
        _schema(db)
        db.execute('DELETE FROM profile_tips WHERE username=?', (username,))


def _tutorial_game(socket):
    # The Tutorial mode teaches through its own map and prompts.
    params = getattr(socket.process, 'game_params', None)
    return str(getattr(params, 'id', '') or '').startswith('tut-')


def send_state(socket, **_):
    if not socket.username:
        return
    try:
        known = seen(socket.username)
    except (sqlite3.Error, OSError, ValueError):
        # Tips only teach; a settings outage must not repeat or block anything.
        logging.warning('Tutorial tip history is temporarily unavailable')
        known = list(TIPS)
    socket.send_message('tips_state', catalog=CATALOG, seen=known,
                        jev=system_one.configured(), quiet=_tutorial_game(socket))


def handle_seen(socket, ids=None, **_):
    if not socket.username:
        return
    try:
        mark(socket.username, ids)
    except ValueError:
        return
    except (sqlite3.Error, OSError):
        logging.warning('Could not record a seen tutorial tip')


def handle_reset(socket, **_):
    if not socket.username:
        return
    try:
        reset(socket.username)
    except (sqlite3.Error, OSError):
        logging.warning('Could not reset tutorial tip history')
        return
    from webtiles import ws_handler
    for peer in ws_handler.find_user_sockets(socket.username):
        send_state(peer)
