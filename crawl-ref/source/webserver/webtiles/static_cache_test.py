"""Unversioned static assets revalidate; hashed URLs stay long-cached."""
import tempfile
from pathlib import Path

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles.server import RevalidatingStaticHandler


class StaticCacheHeaderTests(AsyncHTTPTestCase):
    def get_app(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        Path(self.root.name, "tabletop").mkdir()
        Path(self.root.name, "style.css").write_text('@import url("tabletop/welcome.css");\n')
        Path(self.root.name, "tabletop", "welcome.css").write_text(".welcome-seat { display: grid; }\n")
        return tornado.web.Application(static_path=self.root.name,
                                       static_handler_class=RevalidatingStaticHandler)

    def test_imported_stylesheet_must_revalidate(self):
        response = self.fetch("/static/tabletop/welcome.css")
        self.assertEqual(response.code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-cache")
        self.assertIn("Etag", response.headers)

    def test_revalidation_is_a_cheap_304(self):
        etag = self.fetch("/static/tabletop/welcome.css").headers["Etag"]
        response = self.fetch("/static/tabletop/welcome.css",
                              headers={"If-None-Match": etag})
        self.assertEqual(response.code, 304)

    def test_versioned_url_keeps_long_max_age(self):
        response = self.fetch("/static/style.css?v=abc123")
        self.assertEqual(response.code, 200)
        self.assertRegex(response.headers["Cache-Control"], r"^max-age=\d{6,}$")
