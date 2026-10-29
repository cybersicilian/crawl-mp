"""Browser logout shared by the lobby and read-only record pages."""
from urllib.parse import unquote

import tornado.web

from webtiles import auth


def login_cookie(handler):
    cookie = handler.get_cookie("login", "")
    return unquote(cookie) if "%20" not in cookie else cookie


def signed_in_user(handler):
    username, valid = auth.check_login_cookie(login_cookie(handler))
    return username if valid else None


class LogoutHandler(tornado.web.RequestHandler):
    def post(self):
        # jQuery.cookie encodes the token delimiter a second time; cookies
        # issued directly by the HTTP login helper already contain %20.
        auth.forget_login_cookie(login_cookie(self))
        self.clear_cookie("login", path="/")
        self.set_header("Cache-Control", "no-store")
        self.redirect("/#lobby", status=303)
