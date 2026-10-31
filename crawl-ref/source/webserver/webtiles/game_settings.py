"""Account-owned game preferences; existing RC files remain intact."""
import json
import os
import sqlite3
from pathlib import Path

from webtiles import userdb
from webtiles.game_settings_model import SCHEMA, FIELDS, launch_values, read_values
from webtiles.game_settings_model import validate_changes, validate_value, encode


def _scope(path):
    path = Path(path)
    return os.path.join(os.path.realpath(path.parent), path.name.lower())


def _schema(db):
    db.execute('''CREATE TABLE IF NOT EXISTS account_game_settings (
        username TEXT COLLATE NOCASE NOT NULL, scope TEXT NOT NULL,
        settings TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (username, scope))''')


def _read(db, username, path):
    row = db.execute('SELECT settings, revision FROM account_game_settings '
                     'WHERE username=? AND scope=?', (username, _scope(path))).fetchone()
    if not row:
        return {}, 0
    saved = json.loads(row[0])
    # Do not silently discard malformed or retired preferences at launch.
    if not isinstance(saved, dict) or set(saved) - FIELDS.keys():
        raise ValueError('Saved game settings need to be reviewed.')
    return {key: validate_value(key, value) for key, value in saved.items()}, row[1]


def state(username, path, call):
    base, locked = launch_values(call)
    try:
        legacy = Path(path).read_text()
    except FileNotFoundError:
        legacy = ''
    inherited, customized, uncertain = read_values(legacy, base)
    with userdb.settings_db as db:
        _schema(db)
        overrides, revision = _read(db, username, path)
    return dict(schema=SCHEMA, base=base, inherited=inherited,
                values=dict(inherited, **overrides, **locked), overrides=overrides,
                customized=sorted(customized), uncertain=sorted(uncertain),
                locked=locked, revision=revision)


def update(username, path, changes):
    if not username:
        raise ValueError('Sign in to save game settings.')
    changes = validate_changes(changes)
    with userdb.settings_db as db:
        _schema(db)
        db.execute('BEGIN IMMEDIATE')
        saved, revision = _read(db, username, path)
        for key, value in changes.items():
            if value is None:
                saved.pop(key, None)
            else:
                saved[key] = value
        if sum(len(encode(key, value).encode('utf-8')) for key, value in saved.items()) > 65536:
            raise ValueError('Game settings are too large. Shorten the custom rule lists.')
        # Crawl skips late options when its RC file does not exist. Create only
        # the missing empty file; never rewrite an existing configuration.
        try:
            with open(path, 'x') as file:
                file.write('# Preferences are managed through Game settings.\n')
        except FileExistsError:
            pass
        db.execute('''INSERT INTO account_game_settings VALUES (?, ?, ?, ?)
            ON CONFLICT(username, scope) DO UPDATE SET settings=excluded.settings,
            revision=excluded.revision''', (username, _scope(path), json.dumps(saved), revision + 1))
    return revision + 1


def launch_arguments(username, path):
    """Pass typed choices after RC loading, before server-enforced late options."""
    with userdb.settings_db as db:
        try:
            saved, _ = _read(db, username, path)
        except sqlite3.OperationalError as error:
            if 'no such table' not in str(error):
                raise
            return []
    result = []
    for key, value in saved.items():
        result.extend(['-extra-opt-last', encode(key, value)])
    return result
