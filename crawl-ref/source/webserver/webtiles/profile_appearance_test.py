"""Profile persistence, ownership and XSRF checks use an isolated settings DB."""
import json
from pathlib import Path
import re
import tempfile
from unittest.mock import Mock, patch
from urllib.parse import quote

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import auth, profile_appearance, userdb, ws_handler
from webtiles.profile_http import ProfilePageHandler, AppearanceAPIHandler


class ProfileAppearanceTests(AsyncHTTPTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.database = userdb.crawl_db(str(Path(self.directory.name) / "settings.sqlite"))
        self.addCleanup(self.database.close)
        self.db_patch = patch.object(userdb, "settings_db", self.database)
        self.db_patch.start(); self.addCleanup(self.db_patch.stop)
        tokens = patch.object(auth, "login_tokens", {})
        tokens.start(); self.addCleanup(tokens.stop)
        self.cookie = auth.log_in_as_user(Mock(), "Aster")
        self.peer_cookie = auth.log_in_as_user(Mock(), "Rowan")
        super().setUp()

    def get_app(self):
        return tornado.web.Application([
            (r"/profile", ProfilePageHandler), (r"/api/profile/appearance", AppearanceAPIHandler)
        ], template_path=str(Path(__file__).parents[1] / "templates"))

    def page(self, cookie=None):
        return self.fetch("/profile", headers={"Cookie": "login=" + (cookie or self.cookie)}, follow_redirects=False)

    def save(self, data, cookie=None, xsrf=True, profile_user=None):
        page = self.page(cookie)
        token = re.search(rb'name="_xsrf" value="([^"]+)"', page.body).group(1).decode()
        cookies = "login=" + (cookie or self.cookie)
        cookies += "; " + page.headers["Set-Cookie"].split(";", 1)[0]
        headers = {"Cookie": cookies, "Content-Type": "application/json", "X-Profile-User":
                   profile_user or auth.check_login_cookie(cookie or self.cookie)[0]}
        if xsrf: headers["X-XSRFToken"] = token
        return self.fetch("/api/profile/appearance", method="POST", body=json.dumps(data), headers=headers)

    def test_new_profile_is_classic_and_page_has_direct_radio_choices(self):
        response = self.page()
        self.assertEqual(response.code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store, private")
        self.assertIn(b'value="classic" aria-describedby="texture_pack_help" checked', response.body)
        self.assertIn(b'value="illustrated"', response.body)
        self.assertEqual(profile_appearance.get_pack("Aster"), "classic")

    def test_persistence_is_per_account_case_insensitive_and_survives_reopen(self):
        self.assertEqual(self.save({"texture_pack": "illustrated"}).code, 200)
        self.assertEqual(profile_appearance.get_pack("aster"), "illustrated")
        self.assertEqual(profile_appearance.get_pack("Rowan"), "classic")
        other = userdb.crawl_db(self.database.name)
        try:
            with patch.object(userdb, "settings_db", other):
                self.assertEqual(profile_appearance.get_pack("ASTER"), "illustrated")
        finally: other.close()
        self.assertEqual(self.save({"texture_pack": "classic"}).code, 200)
        self.assertEqual(profile_appearance.get_pack("Aster"), "classic")

    def test_missing_login_and_xsrf_cannot_change_preferences(self):
        response = self.fetch("/api/profile/appearance", method="POST", body='{"texture_pack":"illustrated"}')
        self.assertEqual(response.code, 401)
        self.assertEqual(self.save({"texture_pack": "illustrated"}, xsrf=False).code, 403)
        self.assertEqual(profile_appearance.get_pack("Aster"), "classic")
        page = self.fetch("/profile", follow_redirects=False)
        self.assertEqual(page.code, 302)
        self.assertEqual(page.headers["Location"], "/?profile=1#lobby")

    def test_payload_cannot_select_unknown_pack_or_another_account(self):
        for data in ({"texture_pack": "arbitrary"}, {"texture_pack": "illustrated", "username": "Rowan"},
                     {"texture_pack": []}, ["illustrated"], {}):
            with self.subTest(data=data): self.assertEqual(self.save(data).code, 400)
        self.assertEqual(profile_appearance.get_pack("Aster"), "classic")
        self.assertEqual(profile_appearance.get_pack("Rowan"), "classic")

    def test_browser_cookie_encoding_and_authentication_are_shared_with_login(self):
        self.assertEqual(self.page(quote(self.cookie, safe="")).code, 200)
        auth.forget_login_cookie(self.cookie)
        self.assertEqual(self.page().code, 302)
        self.assertEqual(self.fetch("/api/profile/appearance", headers={"Cookie": "login=" + self.cookie}).code, 401)

    def test_update_pushes_only_to_the_authenticated_account_sockets(self):
        socket = Mock()
        with patch.object(ws_handler, "find_user_sockets", return_value=[socket]) as lookup:
            self.assertEqual(self.save({"texture_pack": "illustrated"}).code, 200)
        lookup.assert_called_once_with("Aster")
        socket.send_message.assert_called_once_with("profile_appearance", username="Aster", texture_pack="illustrated", available=True)

    def test_stale_profile_cannot_write_after_an_account_change_in_another_tab(self):
        response = self.save({"texture_pack": "illustrated"}, cookie=self.peer_cookie, profile_user="Aster")
        self.assertEqual(response.code, 409)
        self.assertEqual(profile_appearance.get_pack("Rowan"), "classic")
        self.assertEqual(profile_appearance.get_pack("Aster"), "classic")

    def test_login_state_is_queued_and_unavailable_storage_does_not_break_login(self):
        socket = Mock(); socket.username = "Aster"
        profile_appearance.send_state(socket, queued=True)
        socket.queue_message.assert_called_once_with("profile_appearance", username="Aster", texture_pack="classic", available=True)
        with patch.object(userdb, "settings_db", userdb.crawl_db("")):
            profile_appearance.send_state(socket)
        socket.send_message.assert_called_once_with("profile_appearance", username="Aster", texture_pack="classic", available=False)
