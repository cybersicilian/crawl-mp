"""Bundles remain optional and invalidation includes imported CSS and resources."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from webtiles.asset_delivery import MANIFEST
from webtiles.asset_revision import revision
from webtiles.stylesheet_assets import CONFIG, INDEX, active_bundles, bundle_path, document, stylesheet_urls
from webtiles.stylesheet_build import prepare_bundles


class StylesheetAssetTests(unittest.TestCase):
    def test_dependency_resources_and_corruption_return_to_original_styles(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'game'; shared = Path(folder) / 'shared'
            root.mkdir(); (root / 'styles').mkdir(); shared.mkdir()
            (root / CONFIG).write_text(json.dumps({'version': 1, 'entries': {'game': ['style.css']}}))
            (root / 'style.css').write_text('@import "styles/child.css"; @import "/static/shared.css";')
            child = root / 'styles/child.css'; child.write_text('.child{color:red;background:url(../icon.svg);mask-image:url(../future.svg)}')
            image = root / 'icon.svg'; image.write_text('<svg/>')
            (shared / 'shared.css').write_text('.shared{color:blue}')
            public = {'/static/': shared}

            def urls():
                return stylesheet_urls(root, 'game', '/game/content/', public, bundle_prefix='/game/stable/')

            def publish_receipt():
                records = {}
                for name in active_bundles(root):
                    records[name] = {'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
                (root / MANIFEST).write_text(json.dumps({'version': 1, 'assets': records}))

            originals = {path: path.read_bytes() for path in [root / 'style.css', child, image]}
            self.assertIn('/game/content/style.css?v=', urls()[0])
            prepare_bundles(root, public)
            record = document(root / INDEX)['bundles']['game']; path = root / bundle_path(record)
            self.assertIn('../icon.svg?v=', path.read_text())
            self.assertNotIn(str(root), (root / INDEX).read_text())
            self.assertIn('/game/content/style.css?v=', urls()[0], 'Missing delivery receipt keeps the source path')
            publish_receipt(); initial_url = urls()[0]; self.assertIn('/game/stable/.css-bundles/', initial_url)
            first_revision = revision(root)
            image.write_text('<svg>updated</svg>')
            self.assertIn('/game/content/style.css?v=', urls()[0], 'Changed resource invalidates the bundle')
            prepare_bundles(root, public); publish_receipt()
            self.assertNotEqual(initial_url, urls()[0]); self.assertNotEqual(first_revision, revision(root))
            image.write_bytes(originals[image])
            self.assertIn('/game/content/style.css?v=', urls()[0])
            prepare_bundles(root, public); publish_receipt()
            (root / 'future.svg').write_text('<svg>now available</svg>')
            self.assertIn('/game/content/style.css?v=', urls()[0], 'A newly available resource invalidates the previous missing state')
            prepare_bundles(root, public); publish_receipt()
            current = root / bundle_path(document(root / INDEX)['bundles']['game'])
            current.write_text('corrupt')
            self.assertIn('/game/content/style.css?v=', urls()[0], 'Corrupt output never hides the source styles')
            for source, data in originals.items():
                self.assertEqual(source.read_bytes(), data)

    def test_unsupported_imports_keep_sources_and_do_not_expose_local_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / CONFIG).write_text(json.dumps({'version': 1, 'entries': {'main': ['style.css']}}))
            (root / 'style.css').write_text('@import "missing.css";')
            prepare_bundles(root, {})
            self.assertEqual(document(root / INDEX)['bundles'], {})
            self.assertNotIn(folder, (root / INDEX).read_text())
            self.assertIn('/static/style.css?v=', stylesheet_urls(root, 'main', '/static/', {})[0])
