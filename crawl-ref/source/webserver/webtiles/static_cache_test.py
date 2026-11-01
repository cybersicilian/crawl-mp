"""Unversioned static assets revalidate; hashed URLs stay long-cached."""
import tempfile
from pathlib import Path

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles.asset_delivery import digests
from webtiles.static_assets import StaticAssetHandler


class StaticCacheHeaderTests(AsyncHTTPTestCase):
    def get_app(self):
        self.root = tempfile.TemporaryDirectory()
        self.addCleanup(self.root.cleanup)
        Path(self.root.name, "tabletop").mkdir()
        Path(self.root.name, "style.css").write_text('@import url("tabletop/welcome.css");\n')
        Path(self.root.name, "tabletop", "welcome.css").write_text(".welcome-seat { display: grid; }\n")
        return tornado.web.Application(static_path=self.root.name,
                                       static_handler_class=StaticAssetHandler)

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
        token = digests(Path(self.root.name, "style.css"))[0]
        response = self.fetch("/static/style.css?v=" + token)
        self.assertEqual(response.code, 200)
        self.assertEqual(response.headers["Cache-Control"], "public, max-age=31536000, immutable")

    def test_static_url_version_is_content_bound(self):
        token = digests(Path(self.root.name, "style.css"))[0]
        version = StaticAssetHandler.get_version({"static_path": self.root.name}, "style.css")
        self.assertEqual(version, token)
