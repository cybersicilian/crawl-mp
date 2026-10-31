import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from tornado.testing import AsyncHTTPTestCase, AsyncTestCase, gen_test
from tornado.web import Application

from webtiles import auth, crash_reports


class CrashReportsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.params = SimpleNamespace(templated=lambda key, **kwargs: str(self.root))
        self.process = SimpleNamespace(game_params=self.params, username="Owner", record_id="test-id")

    def tearDown(self):
        crash_reports._reports.clear()
        self.temp.cleanup()

    def test_null_public_urls_are_unavailable(self):
        for value in (None, "None", "null", "", "  NONE  "):
            self.assertIsNone(crash_reports.public_base(value))

    def test_owner_only_and_bounded_report(self):
        report = self.root / "crash-Owner-20261016.txt"
        report.write_bytes(b"x" * (crash_reports.MAX_REPORT_BYTES + 100))
        crash_reports.capture(self.process, "- The crash report: " + str(report))
        self.assertEqual(crash_reports.register(self.process), "/api/crash-report/test-id")
        self.assertIsNone(crash_reports.read("test-id", "DifferentAccount"))
        self.assertIn("truncated", crash_reports.read("test-id", "owner"))

    def test_report_cannot_escape_morgue_directory(self):
        outside = self.root.parent / "crash-not-owner.txt"
        crash_reports.capture(self.process, "The crash report: " + str(outside))
        self.assertIsNone(crash_reports.register(self.process))
        link = self.root / "crash-symlink.txt"
        link.symlink_to(outside)
        crash_reports.capture(self.process, "The crash report: " + str(link))
        self.assertIsNone(crash_reports.register(self.process))


class CrashReportHTTPTest(AsyncHTTPTestCase):
    def get_app(self):
        return Application([(r"/report/([a-z-]+)", crash_reports.CrashReportHandler)])

    def test_download_requires_existing_owner_session(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "crash-test.txt"
            path.write_text("Diagnostic only")
            crash_reports._reports["one-game"] = ("Owner", path)
            auth.login_tokens[(123456, "Owner")] = None
            try:
                self.assertEqual(self.fetch("/report/one-game").code, 404)
                response = self.fetch("/report/one-game", headers={"Cookie": "login=Owner%2520123456"})
                self.assertEqual(response.code, 200)
                self.assertEqual(response.body, b"Diagnostic only")
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertIn("attachment", response.headers["Content-Disposition"])
            finally:
                auth.login_tokens.pop((123456, "Owner"), None)
                crash_reports._reports.clear()


class CheckpointValidationTest(AsyncTestCase):
    @gen_test
    async def test_only_confirmed_native_loadable_checkpoints_enable_resume(self):
        game = {"mode": "qa", "saved_at": None}
        definition = Mock(get_call_base=Mock(return_value=["crawl"]))
        native = SimpleNamespace(returncode=0, communicate=AsyncMock())
        with patch.object(crash_reports.config, "games", {"qa": definition}), \
                patch.object(crash_reports.game_library, "save_files", return_value=["/tmp/one.cs"]), \
                patch.object(crash_reports.asyncio, "create_subprocess_exec", new_callable=AsyncMock, return_value=native) as spawn:
            self.assertFalse(await crash_reports.checkpoint_loadable(game))
            spawn.assert_not_called()
            game["saved_at"] = "2026-10-16T20:00:00Z"
            for payload, expected in ((b'{"normal":{"loadable":true}}', True),
                                      (b'{"normal":{"loadable":false}}', False),
                                      (b'{"normal":{"loadable":"true"}}', False),
                                      (b'invalid native output', False)):
                native.communicate.return_value = (payload, b"")
                self.assertEqual(await crash_reports.checkpoint_loadable(game), expected)
            native.returncode = 1
            self.assertFalse(await crash_reports.checkpoint_loadable(game))
