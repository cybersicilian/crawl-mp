"""Real private persistence and HTTP boundaries, with no native game process."""
import json
from pathlib import Path
import re
import tempfile
from unittest.mock import Mock, patch

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles import auth, profile_graphics, userdb, ws_handler
from webtiles.graphics_http import GraphicsAPIHandler, GraphicsPageHandler
from webtiles.profile_http import ProfilePageHandler


class GraphicsTests(AsyncHTTPTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = userdb.crawl_db(str(Path(self.temp.name) / 'settings.sqlite'))
        self.addCleanup(self.database.close)
        for replacement in [patch.object(userdb, 'settings_db', self.database), patch.object(auth, 'login_tokens', {})]:
            replacement.start(); self.addCleanup(replacement.stop)
        self.cookie = auth.log_in_as_user(Mock(), 'Aster')
        self.peer = auth.log_in_as_user(Mock(), 'Rowan')
        super().setUp()

    def get_app(self):
        return tornado.web.Application([(r'/profile', ProfilePageHandler),
            (r'/settings/graphics', GraphicsPageHandler),
            (r'/api/profile/graphics', GraphicsAPIHandler)],
            template_path=str(Path(__file__).parents[1] / 'templates'))

    def request(self, changes=None, cookie=None, owner='Aster', xsrf=True, raw=False):
        cookie = cookie or self.cookie
        response = self.fetch('/api/profile/graphics', headers={'Cookie': 'login=' + cookie})
        if changes is None:
            return response
        token = response.headers['Set-Cookie'].split(';', 1)[0]
        headers = {'Cookie': 'login=' + cookie + '; ' + token, 'X-Profile-User': owner,
                   'Content-Type': 'application/json'}
        if xsrf:
            headers['X-XSRFToken'] = token.split('=', 1)[1]
        return self.fetch('/api/profile/graphics', method='POST', headers=headers,
                          body=json.dumps(changes if raw else {'changes': changes}))

    def test_defaults_are_classic_and_private_profile_contains_graphics(self):
        response = self.request()
        data = json.loads(response.body)
        self.assertEqual(response.headers['Cache-Control'], 'no-store, private')
        self.assertEqual(data['settings']['mode'], 'classic')
        self.assertEqual(data['settings']['ui_theme'], 'folio')
        self.assertFalse(any(value for key, value in data['settings'].items() if type(value) is bool))
        self.assertEqual(data['revision'], 0)
        page = self.fetch('/profile', headers={'Cookie': 'login=' + self.cookie})
        self.assertEqual(page.code, 200)
        self.assertIn(b'id="profile_graphics"', page.body)
        self.assertIn(b'profile-graphics', page.body)
        graphics = self.fetch('/settings/graphics', headers={'Cookie': 'login=' + self.cookie})
        self.assertEqual(graphics.code, 200)
        self.assertNotIn(b'Illustrated', graphics.body)
        self.assertEqual(self.fetch('/settings/graphics', follow_redirects=False).headers['Location'], '/?graphics=1#lobby')

    def test_account_ownership_case_insensitivity_and_persistence_after_reopen(self):
        self.assertEqual(self.request({'mode': 'premium', 'lighting': True}).code, 200)
        self.assertTrue(profile_graphics.state('ASTER')['settings']['lighting'])
        self.assertEqual(profile_graphics.state('Rowan')['settings']['mode'], 'classic')
        other = userdb.crawl_db(self.database.name)
        try:
            with patch.object(userdb, 'settings_db', other):
                self.assertTrue(profile_graphics.state('aster')['settings']['lighting'])
        finally:
            other.close()

    def test_partial_updates_merge_instead_of_clobbering_other_fields(self):
        self.request({'lighting': True, 'mode': 'premium'})
        self.request({'clouds': True})
        data = json.loads(self.request({'bloom': True}).body)
        self.assertTrue(all(data['settings'][key] for key in ['lighting', 'clouds', 'bloom']))
        self.assertEqual(data['revision'], 3)

    def test_ui_theme_is_private_durable_and_defaults_for_legacy_settings(self):
        with self.database as db:
            profile_graphics._schema(db)
            db.execute('INSERT INTO profile_graphics VALUES (?, ?, ?)',
                       ('Aster', json.dumps({'mode': 'classic', 'motion': 'reduced'}), 4))
        self.assertEqual(profile_graphics.state('Aster')['settings']['ui_theme'], 'folio')
        for theme in ['folio', 'dungeon', 'contrast']:
            data = json.loads(self.request({'ui_theme': theme}).body)
            self.assertEqual(data['settings']['ui_theme'], theme)
            self.assertEqual(data['settings']['mode'], 'classic')
            self.assertEqual(data['settings']['motion'], 'reduced')
        other = userdb.crawl_db(self.database.name)
        try:
            with patch.object(userdb, 'settings_db', other):
                self.assertEqual(profile_graphics.state('aster')['settings']['ui_theme'], 'contrast')
                self.assertEqual(profile_graphics.state('Rowan')['settings']['ui_theme'], 'folio')
        finally:
            other.close()

    def test_invalid_fields_types_and_owner_injection_leave_state_unchanged(self):
        for patch_data in [{}, {'lighting': 1}, {'lighting': 'true'}, {'motion': 'unlimited'},
                           {'mode': []}, {'ui_theme': 'unknown'}, {'ui_theme': True},
                           {'unknown': False}, {'username': 'Rowan'}]:
            with self.subTest(patch_data=patch_data):
                self.assertEqual(self.request(patch_data).code, 400)
        self.assertEqual(self.request({'changes': {'lighting': True}, 'username': 'Rowan'}, raw=True).code, 400)
        self.assertEqual(profile_graphics.state('Aster')['revision'], 0)

    def test_missing_auth_xsrf_or_changed_account_cannot_write(self):
        self.assertEqual(self.fetch('/api/profile/graphics').code, 401)
        self.assertEqual(self.request({'lighting': True}, xsrf=False).code, 403)
        self.assertEqual(self.request({'lighting': True}, cookie=self.peer).code, 409)
        self.assertEqual(profile_graphics.state('Rowan')['revision'], 0)
        auth.forget_login_cookie(self.cookie)
        self.assertEqual(self.request().code, 401)

    def test_push_is_scoped_to_authenticated_owner(self):
        socket = Mock()
        with patch.object(ws_handler, 'find_user_sockets', return_value=[socket]) as lookup:
            response = self.request({'clouds': True})
        lookup.assert_called_once_with('Aster')
        payload = json.loads(response.body)
        socket.send_message.assert_called_once_with('profile_graphics', **payload)

    def test_login_queue_and_storage_failure_fallback_are_classic(self):
        socket = Mock(); socket.username = 'Aster'
        profile_graphics.send_state(socket, queued=True)
        self.assertEqual(socket.queue_message.call_args.args[0], 'profile_graphics')
        with patch.object(userdb, 'settings_db', userdb.crawl_db('')):
            profile_graphics.send_state(socket)
        self.assertFalse(socket.send_message.call_args.kwargs['available'])
        self.assertEqual(socket.send_message.call_args.kwargs['settings']['mode'], 'classic')

    def test_every_preset_obeys_the_same_canonical_schema(self):
        for preset in profile_graphics.SCHEMA['presets']:
            values = profile_graphics.defaults() | preset['settings']
            self.assertEqual(profile_graphics.validate(values), values)
