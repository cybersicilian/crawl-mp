"""Private profile page and authenticated, XSRF-protected appearance updates."""
import json
import sqlite3
from pathlib import Path

import tornado.web

from webtiles import profile_appearance, profile_graphics
from webtiles.asset_revision import revision
from webtiles.auth_http import signed_in_user


class ProfilePageHandler(tornado.web.RequestHandler):
    def get(self):
        username = signed_in_user(self)
        self.set_header("Cache-Control", "no-store, private")
        if not username:
            self.redirect("/?profile=1#lobby")
            return
        try:
            texture_pack = profile_appearance.get_pack(username)
            graphics = profile_graphics.state(username)
        except (sqlite3.Error, OSError, ValueError):
            raise tornado.web.HTTPError(503, "Profile settings are temporarily unavailable")
        self.render("profile.html", username=username, texture_pack=texture_pack,
                    packs=profile_appearance.PACKS,
                    graphics_json=json.dumps(graphics).replace('<', '\\u003c'),
                    graphics_revision=revision(Path(__file__).parents[1] / 'static'))


class AppearanceAPIHandler(tornado.web.RequestHandler):
    def prepare(self):
        self.set_header("Cache-Control", "no-store, private")
        self.username = signed_in_user(self)
        if not self.username:
            raise tornado.web.HTTPError(401, "Sign in to manage your profile")

    def get(self):
        try:
            self.write(profile_appearance.state(self.username))
        except (sqlite3.Error, OSError):
            raise tornado.web.HTTPError(503, "Profile settings are temporarily unavailable")

    def post(self):
        self.check_xsrf_cookie()
        if self.request.headers.get("X-Profile-User", "").casefold() != self.username.casefold():
            raise tornado.web.HTTPError(409, "Your sign-in changed; reload your profile")
        try:
            data = json.loads(self.request.body)
            if not isinstance(data, dict) or set(data) != {"texture_pack"}:
                raise ValueError("Only the texture pack can be changed here.")
            pack = profile_appearance.set_pack(self.username, data["texture_pack"])
        except (ValueError, TypeError):
            raise tornado.web.HTTPError(400, "Choose Classic or Illustrated")
        except (sqlite3.Error, OSError):
            raise tornado.web.HTTPError(503, "Could not save your texture pack")
        payload = {"username": self.username, "texture_pack": pack, "available": True}
        # Every signed-in viewer chooses their own art, including co-op peers.
        from webtiles import ws_handler
        for socket in ws_handler.find_user_sockets(self.username):
            socket.send_message("profile_appearance", **payload)
        self.write(payload)
