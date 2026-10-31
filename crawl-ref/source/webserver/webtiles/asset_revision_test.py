import tempfile
import unittest
from pathlib import Path

from webtiles.asset_revision import revision


class AssetRevisionTests(unittest.TestCase):
    def test_browser_release_changes_independently_of_native_version(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "feature.js"
            script.write_text("first")
            baseline = revision(root)
            self.assertEqual(baseline, revision(root))
            script.write_text("changed")
            self.assertNotEqual(baseline, revision(root))
            style = root / "theme.css"
            style.write_text("body { color: red; }")
            styled = revision(root)
            self.assertNotEqual(styled, baseline)
            (root / "notes.md").write_text("Unrelated documentation")
            self.assertEqual(styled, revision(root))
            nested = root / "nested"
            nested.mkdir()
            style.rename(nested / "theme.css")
            self.assertNotEqual(styled, revision(root))
            script.unlink()
            self.assertNotEqual(styled, revision(root))


if __name__ == "__main__":
    unittest.main()
