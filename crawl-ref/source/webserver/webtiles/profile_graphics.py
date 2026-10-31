"""Private account graphics, independent of native characters and save files."""
import json
import logging
from pathlib import Path
import sqlite3

from webtiles import userdb

SCHEMA = json.loads((Path(__file__).parents[1] / 'static/graphics-settings.json').read_text())
FIELDS = {field['id']: field for field in SCHEMA['fields']}


def defaults():
    return {key: field['default'] for key, field in FIELDS.items()}


def validate(changes):
    if not isinstance(changes, dict) or not changes or set(changes) - FIELDS.keys():
        raise ValueError('Choose valid graphics settings.')
    for key, value in changes.items():
        field = FIELDS[key]
        if field['type'] == 'boolean':
            if type(value) is not bool:
                raise ValueError('Graphics switches must be true or false.')
        elif not isinstance(value, str) or value not in field['options']:
            raise ValueError('Choose a supported graphics option.')
    return dict(changes)


def _schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS profile_graphics (
        username TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
        settings TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0
    )''')


def _read(db, username):
    row = db.execute('SELECT settings, revision FROM profile_graphics WHERE username=?',
                     (username,)).fetchone()
    result = defaults()
    if row:
        saved = json.loads(row[0])
        for key, value in saved.items():
            if key in FIELDS:
                result.update(validate({key: value}))
    return result, row[1] if row else 0


def state(username):
    settings, revision = defaults(), 0
    if username:
        with userdb.settings_db as db:
            _schema(db)
            settings, revision = _read(db, username)
    return {'username': username, 'settings': settings, 'revision': revision,
            'schema': SCHEMA, 'available': True}


def update(username, changes):
    if not username:
        raise ValueError('Sign in to save graphics settings.')
    changes = validate(changes)
    with userdb.settings_db as db:
        _schema(db)
        # Partial updates merge atomically: edits to different fields in two
        # tabs/devices do not overwrite one another's whole settings object.
        db.execute('BEGIN IMMEDIATE')
        settings, revision = _read(db, username)
        settings.update(changes)
        db.execute('''INSERT INTO profile_graphics(username, settings, revision) VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET settings=excluded.settings,
            revision=excluded.revision''', (username, json.dumps(settings), revision + 1))
    return {'username': username, 'settings': settings, 'revision': revision + 1,
            'schema': SCHEMA, 'available': True}


def send_state(socket, queued=False):
    if not socket.username:
        return
    try:
        payload = state(socket.username)
    except (sqlite3.Error, OSError, ValueError):
        logging.warning('Account graphics settings are temporarily unavailable')
        payload = {'username': socket.username, 'settings': defaults(), 'revision': 0,
                   'schema': SCHEMA, 'available': False}
    sender = socket.queue_message if queued else socket.send_message
    sender('profile_graphics', **payload)
