"""Logout revokes the presented token before redirecting back to sign-in."""
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import quote

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import auth
from webtiles.auth_http import LogoutHandler


class LogoutHTTPTests(AsyncHTTPTestCase):
    def setUp(self):
        self.tokens = patch.object(auth, "login_tokens", {})
        self.tokens.start()
        self.addCleanup(self.tokens.stop)
        super().setUp()

    def get_app(self):
        return tornado.web.Application([(r"/logout", LogoutHandler)])

    def logout(self, cookie=""):
        return self.fetch("/logout", method="POST", body="",
                          headers={"Cookie": "login=" + cookie}, follow_redirects=False)

    def assert_signed_out(self, response):
        self.assertEqual(response.code, 303)
        self.assertEqual(response.headers["Location"], "/#lobby")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        cleared = response.headers["Set-Cookie"]
        self.assertIn('login=""', cleared)
        self.assertIn("Path=/", cleared)

    def test_browser_cookie_is_revoked_and_other_sessions_are_preserved(self):
        cookie = auth.log_in_as_user(Mock(), "Host")
        other = auth.log_in_as_user(Mock(), "Player2")
        self.assert_signed_out(self.logout(quote(cookie, safe="")))
        self.assertEqual(auth.check_login_cookie(cookie), ("Host", False))
        self.assertEqual(auth.check_login_cookie(other), ("Player2", True))

    def test_http_cookie_is_also_revoked(self):
        cookie = auth.log_in_as_user(Mock(), "Host")
        self.assert_signed_out(self.logout(cookie))
        self.assertFalse(auth.check_login_cookie(cookie)[1])

    def test_missing_stale_and_malformed_cookies_can_sign_out_repeatedly(self):
        for cookie in ("", "Host%2520123", "malformed", "%invalid"):
            with self.subTest(cookie=cookie):
                self.assert_signed_out(self.logout(cookie))
                self.assert_signed_out(self.logout(cookie))

    def test_get_does_not_revoke_session(self):
        cookie = auth.log_in_as_user(Mock(), "Host")
        response = self.fetch("/logout", headers={"Cookie": "login=" + cookie})
        self.assertEqual(response.code, 405)
        self.assertTrue(auth.check_login_cookie(cookie)[1])

    def test_shared_form_supports_xsrf_protection(self):
        class Page(tornado.web.RequestHandler):
            def get(self):
                self.render("logout.html")

        self._app.settings.update(xsrf_cookies=True, template_path=str(
            Path(__file__).parents[1] / "templates"))
        self._app.add_handlers(r".*", [(r"/", Page)])
        page = self.fetch("/")
        self.assertEqual(page.code, 200)
        self.assertIn(b'name="_xsrf"', page.body)
        self.assertEqual(self.logout().code, 403)
        xsrf_cookie = page.headers["Set-Cookie"].split(";", 1)[0]
        xsrf = xsrf_cookie.partition("=")[2]
        response = self.fetch("/logout", method="POST", body="_xsrf=" + xsrf,
                              headers={"Cookie": xsrf_cookie}, follow_redirects=False)
        self.assert_signed_out(response)
