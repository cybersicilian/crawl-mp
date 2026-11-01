import tempfile
import unittest
import os
from pathlib import Path

from webtiles.asset_revision import revision, versions


class AssetRevisionTests(unittest.TestCase):
    def test_content_changes_even_when_size_and_mtime_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); script = root / 'feature.js'; script.write_text('first')
            baseline = revision(root); stat = script.stat()
            script.write_text('other'); os.utime(script, ns=(stat.st_atime_ns, stat.st_mtime_ns))
            self.assertNotEqual(baseline, revision(root))

    def test_file_boundaries_and_additions_are_part_of_the_content_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); script = root / 'a.js'; script.write_text('b.jscontent')
            baseline = revision(root)
            script.write_text(''); (root / 'b.js').write_text('content')
            self.assertNotEqual(baseline, revision(root))

    def test_browser_code_versions_change_without_rotating_unchanged_media_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); script = root / 'feature.js'; script.write_text('first')
            before = versions(b'build identity', root)
            script.write_text('changed')
            after = versions(b'build identity', root)
            self.assertEqual(before.base, after.base)
            self.assertNotEqual(before.content, after.content)
            self.assertNotEqual(before.scripts, after.scripts)
            image = root / 'atlas.png'; image.write_bytes(b'media changes independently')
            self.assertEqual(after, versions(b'build identity', root))
            different_build = versions(b'new build identity', root)
            self.assertNotEqual(after.base, different_build.base)
            self.assertNotEqual(after.content, different_build.content)
            self.assertEqual(after.scripts, different_build.scripts)

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
