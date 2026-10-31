import datetime
import random
import time

import tornado.ioloop
import tornado.websocket
from tornado.ioloop import IOLoop

from webtiles import config

try:
    from typing import Dict, Tuple
except ImportError:
    pass

login_tokens = {}  # type: Dict[Tuple[str,str],datetime.datetime]
rand = random.SystemRandom()


def account_disabled(username):
    """Apply the configured account denylist to passwords and saved sessions."""
    return isinstance(username, str) and username.strip().casefold() in {
        name.casefold() for name in config.get('disabled_accounts')
    }


def purge_login_tokens():
    for token in list(login_tokens):
        if datetime.datetime.now() > login_tokens[token]:
            del login_tokens[token]


def purge_login_tokens_timeout():
    purge_login_tokens()
    # add_timeout takes seconds; the old 60*60*1000 scheduled the next purge
    # ~41 days out, so expired tokens stayed in memory (and valid) for weeks.
    IOLoop.current().add_timeout(time.time() + 60 * 60,
                                 purge_login_tokens_timeout)


def log_in_as_user(request, username):
    token = rand.getrandbits(128)
    expires = datetime.datetime.now() + datetime.timedelta(config.get('login_token_lifetime'))
    login_tokens[(token, username)] = expires
    cookie = username + "%20" + str(token)
    if not isinstance(request, tornado.websocket.WebSocketHandler):
        request.set_cookie("login", cookie)
    return cookie


def _parse_login_cookie(cookie):
    username, _, token = cookie.partition('%20')
    try:
        token = int(token)
    except ValueError:
        token = None
    return username, token


def check_login_cookie(cookie):
    username, token = _parse_login_cookie(cookie)
    if (token, username) not in login_tokens or account_disabled(username):
        return username, False
    expires = login_tokens[(token, username)]
    if expires is not None and datetime.datetime.now() > expires:
        # Expiry is enforced here, not only by the periodic purge.
        del login_tokens[(token, username)]
        return username, False
    return username, True


def forget_login_cookie(cookie):
    username, token = _parse_login_cookie(cookie)
    if (token, username) in login_tokens:
        del login_tokens[(token, username)]
