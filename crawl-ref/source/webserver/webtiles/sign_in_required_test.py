"""Real WebSocket and SQLite coverage for personal-account-only access."""
import json
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch

import tornado.web
from tornado.testing import AsyncHTTPTestCase, gen_test
from tornado.websocket import websocket_connect

from webtiles import auth, config, userdb
from webtiles.ws_handler import CrawlWebSocket


class AccountSocket(CrawlWebSocket):
    """Exercise production authentication without starting a native game."""
    def open(self):
        self.application.socket = self

    def on_close(self):
        pass

    def init_user(self, callback):
        callback(0)

    def send_lobby_html(self):
        pass

    def library_fetch(self):
        pass

    def library_fetch_async(self, **kwargs):
        pass

    def reset_lobby_timeout(self):
        pass


class SignInRequiredTests(AsyncHTTPTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="dcss-accounts-")
        self.addCleanup(self.directory.cleanup)
        self.values = dict(dgl_mode=True, crypt_algorithm="6", max_passwd_length=128,
                           disabled_accounts=["Host", "Player2", "Player3", "Player4"])
        self.configuration = patch.object(config, "server_config", self.values)
        self.configuration.start()
        self.addCleanup(self.configuration.stop)
        dbfile = str(Path(self.directory.name) / "accounts.db3")
        userdb.create_user_db(dbfile)
        self.database = userdb.crawl_db(dbfile)
        self.addCleanup(self.database.close)
        self.user_database = patch.object(userdb, "user_db", self.database, create=True)
        self.user_database.start()
        self.addCleanup(self.user_database.stop)
        self.tokens = patch.object(auth, "login_tokens", {})
        self.tokens.start()
        self.addCleanup(self.tokens.stop)
        self.games = patch.object(config, "games", {"test": Mock(templated=Mock(return_value="Test game"))})
        self.games.start()
        self.addCleanup(self.games.stop)
        self.connections = []
        super().setUp()

    def tearDown(self):
        for connection in self.connections:
            connection.close()
        super().tearDown()

    def get_app(self):
        return tornado.web.Application([(r"/socket", AccountSocket)])

    async def connect(self):
        connection = await websocket_connect(self.get_url("/socket").replace("http", "ws", 1),
                                             subprotocols=["no-compression"])
        self.connections.append(connection)
        return connection

    async def exchange(self, connection, kind, expected, **fields):
        connection.write_message(json.dumps(dict(msg=kind, **fields)))
        while True:
            raw = await connection.read_message()
            self.assertIsNotNone(raw)
            for message in json.loads(raw)["msgs"]:
                if message["msg"] == expected:
                    return message

    @gen_test
    async def test_unknown_sign_in_never_creates_an_account(self):
        connection = await self.connect()
        for password in ("crawl", "private password", "", None):
            await self.exchange(connection, "login", "login_fail",
                                username="NewAdventurer", password=password)
            self.assertIsNone(userdb.get_user_info("NewAdventurer"))
            self.assertIsNone(self._app.socket.username)

    @gen_test
    async def test_missing_password_does_not_use_the_old_default(self):
        self.assertIsNone(userdb.register_user("Adventurer", "crawl", ""))
        connection = await self.connect()
        for password in ("", None):
            response = await self.exchange(connection, "login", "login_fail",
                                           username="Adventurer", password=password)
            self.assertIn("password", response["reason"])
            self.assertIsNone(self._app.socket.username)

    @gen_test
    async def test_personal_password_and_remembered_session_still_work(self):
        self.assertIsNone(userdb.register_user("Adventurer", "private password", ""))
        connection = await self.connect()
        await self.exchange(connection, "login", "login_fail",
                            username="Adventurer", password="wrong password")
        response = await self.exchange(connection, "login", "login_success",
                                       username=" adventurer ", password="private password")
        self.assertEqual(response["username"], "Adventurer")
        cookie = await self.exchange(connection, "set_login_cookie", "login_cookie")
        returning = await self.connect()
        response = await self.exchange(returning, "token_login", "login_success", cookie=cookie["cookie"])
        self.assertEqual(response["username"], "Adventurer")

    @gen_test
    async def test_expired_remembered_session_is_rejected_before_the_purge(self):
        self.assertIsNone(userdb.register_user("Adventurer", "private password", ""))
        self.values["login_token_lifetime"] = 0
        cookie = auth.log_in_as_user(Mock(), "Adventurer")
        connection = await self.connect()
        await self.exchange(connection, "token_login", "login_fail", cookie=cookie)
        self.assertIsNone(self._app.socket.username)
        self.assertEqual(auth.login_tokens, {})

    @gen_test
    async def test_explicit_registration_signs_in_with_a_personal_account(self):
        connection = await self.connect()
        await self.exchange(connection, "register", "register_fail",
                            username="NewAdventurer", password="", email="")
        self.assertIsNone(userdb.get_user_info("NewAdventurer"))
        await self.exchange(connection, "register", "login_success",
                            username="NewAdventurer", password="private password", email="")
        self.assertEqual(self._app.socket.username, "NewAdventurer")
        self.assertTrue(userdb.user_passwd_match("NewAdventurer", "private password")[0])

    @gen_test
    async def test_legacy_shared_passwords_and_tokens_are_rejected_without_deleting_accounts(self):
        shared = self.values["disabled_accounts"]
        self.values["disabled_accounts"] = []
        cookies = {}
        for name in shared:
            self.assertIsNone(userdb.register_user(name, "crawl", ""))
            cookies[name] = auth.log_in_as_user(Mock(), name)
        self.values["disabled_accounts"] = shared
        connection = await self.connect()
        for name in shared:
            await self.exchange(connection, "login", "login_fail", username=name.swapcase(), password="crawl")
            await self.exchange(connection, "token_login", "login_fail", cookie=cookies[name])
            self.assertIsNone(self._app.socket.username)
            self.assertIsNotNone(userdb.get_user_info(name))

    @gen_test
    async def test_shared_names_cannot_be_registered_again(self):
        connection = await self.connect()
        for name in self.values["disabled_accounts"]:
            response = await self.exchange(connection, "register", "register_fail",
                                           username=" " + name.lower() + " ", password="new password", email="")
            self.assertIn("Shared accounts are disabled", response["reason"])
            self.assertIsNone(userdb.get_user_info(name))

    @gen_test
    async def test_anonymous_play_and_spectating_request_sign_in(self):
        connection = await self.connect()
        await self.exchange(connection, "play", "login_required", game_id="test")
        await self.exchange(connection, "watch", "login_required", username="Adventurer")
        self.assertIsNone(self._app.socket.process)
        self.assertIsNone(self._app.socket.watched_game)

    @gen_test
    async def test_direct_login_cannot_bypass_disabled_accounts(self):
        self.values["disabled_accounts"] = []
        self.assertIsNone(userdb.register_user("Host", "crawl", ""))
        self.values["disabled_accounts"] = ["Host"]
        connection = await self.connect()
        self._app.socket.do_login("Host")
        message = json.loads(await connection.read_message())["msgs"][0]
        self.assertEqual(message["msg"], "login_fail")
        self.assertIsNone(self._app.socket.username)
        self.assertIsNone(self._app.socket.user_id)
