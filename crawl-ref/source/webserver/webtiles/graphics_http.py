"""Authenticated graphics preferences; the client cannot select another owner."""
import json
import sqlite3
from pathlib import Path

import tornado.web

from webtiles import profile_graphics
from webtiles.auth_http import signed_in_user
from webtiles.asset_revision import revision


class GraphicsPageHandler(tornado.web.RequestHandler):
    def get(self):
        username = signed_in_user(self)
        self.set_header('Cache-Control', 'no-store, private')
        if not username:
            self.redirect('/?graphics=1#lobby')
            return
        try:
            state = profile_graphics.state(username)
        except (sqlite3.Error, OSError, ValueError):
            raise tornado.web.HTTPError(503, 'Graphics settings are temporarily unavailable')
        self.render('graphics.html', username=username,
                    graphics_json=json.dumps(state).replace('<', '\\u003c'),
                    graphics_revision=revision(Path(__file__).parents[1] / 'static'))


class GraphicsAPIHandler(tornado.web.RequestHandler):
    def prepare(self):
        self.set_header('Cache-Control', 'no-store, private')
        self.username = signed_in_user(self)
        if not self.username:
            raise tornado.web.HTTPError(401, 'Sign in to manage graphics settings')

    def get(self):
        # In-game controls can obtain an XSRF cookie without opening a profile tab.
        self.xsrf_token
        try:
            self.write(profile_graphics.state(self.username))
        except (sqlite3.Error, OSError, ValueError):
            raise tornado.web.HTTPError(503, 'Graphics settings are temporarily unavailable')

    def post(self):
        self.check_xsrf_cookie()
        if self.request.headers.get('X-Profile-User', '').casefold() != self.username.casefold():
            raise tornado.web.HTTPError(409, 'Your sign-in changed; reload graphics settings')
        try:
            data = json.loads(self.request.body)
            if not isinstance(data, dict) or set(data) != {'changes'}:
                raise ValueError('Only graphics settings can be changed here.')
            payload = profile_graphics.update(self.username, data['changes'])
        except (ValueError, TypeError):
            raise tornado.web.HTTPError(400, 'Choose valid graphics settings')
        except (sqlite3.Error, OSError):
            raise tornado.web.HTTPError(503, 'Could not save graphics settings')
        from webtiles import ws_handler
        for socket in ws_handler.find_user_sockets(self.username):
            socket.send_message('profile_graphics', **payload)
        self.write(payload)
