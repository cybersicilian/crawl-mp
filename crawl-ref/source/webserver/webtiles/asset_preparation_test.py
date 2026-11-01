"""Prepared metadata must describe current sources, recipes and transfer sizes."""
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from webtiles.asset_revision import revision

spec = importlib.util.spec_from_file_location('prepare_assets', Path(__file__).resolve().parents[1] / 'util/prepare-assets.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class AssetPreparationTests(unittest.TestCase):
    def test_v2_png_rejections_keep_meaningful_same_format_savings_without_reencoding_other_formats(self):
        for cached_webp in (False, True):
            with self.subTest(cached_webp=cached_webp), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); data = b'x' * 2_000_000; candidate = b'y' * 1_910_000
                (root / 'image.png').write_bytes(data)
                variants = {}
                if cached_webp:
                    encoded = b'cached WebP'; (root / 'image.png.lossless.webp').write_bytes(encoded)
                    variants['webp'] = {'suffix': '.lossless.webp', 'bytes': len(encoded), 'sha256': prepare.digest(encoded)}
                record = {'bytes': len(data), 'sha256': prepare.digest(data), 'recipe': prepare.PREVIOUS_RECIPE, 'variants': variants}
                (root / prepare.MANIFEST).write_text(json.dumps({'version': 1, 'recipe': prepare.PREVIOUS_RECIPE,
                                                               'assets': {'image.png': record}}))
                with patch.object(prepare, 'optimize_png', return_value=candidate), patch.object(prepare, 'encode', side_effect=AssertionError('Unexpected re-encoding')):
                    result = prepare.prepare(root, time.monotonic() + 5)
                current = result['assets']['image.png']
                self.assertEqual(current['recipe'], prepare.RECIPE)
                self.assertEqual(current['variants']['png']['bytes'], len(candidate))
                self.assertEqual((root / 'image.png.lossless.png').read_bytes(), candidate)
                self.assertEqual((root / 'image.png').read_bytes(), data)
                if cached_webp:
                    self.assertEqual(current['variants']['webp'], variants['webp'])
                self.assertEqual(prepare.check(root), [])

    def test_compatible_v2_text_encodings_are_reused_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = b'const original = true;\n' * 100
            encoded = gzip.compress(data, mtime=0)
            (root / 'file.js').write_bytes(data); (root / 'file.js.gz').write_bytes(encoded)
            variant = {'suffix': '.gz', 'bytes': len(encoded), 'sha256': prepare.digest(encoded)}
            record = {'bytes': len(data), 'sha256': prepare.digest(data), 'recipe': prepare.PREVIOUS_RECIPE,
                      'variants': {'gzip': variant}}
            (root / prepare.MANIFEST).write_text(json.dumps({'version': 1, 'recipe': prepare.PREVIOUS_RECIPE,
                                                           'assets': {'file.js': record}}))
            with patch.object(prepare, 'encode', side_effect=AssertionError('Unexpected re-encoding')):
                result = prepare.prepare(root, time.monotonic() + 5)
            self.assertEqual(result['assets']['file.js']['recipe'], prepare.RECIPE)
            self.assertEqual(result['assets']['file.js']['variants']['gzip'], variant)
            self.assertEqual((root / 'file.js.gz').read_bytes(), encoded)
            self.assertEqual(prepare.check(root), [])

    def test_checker_rejects_stale_versions_recipes_sizes_and_unsafe_variants(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = b'const original = true;\n' * 100
            (root / 'file.js').write_bytes(data)
            encoded = gzip.compress(data, mtime=0); (root / 'file.js.gz').write_bytes(encoded)
            record = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'recipe': prepare.RECIPE,
                      'variants': {'gzip': {'suffix': '.gz', 'bytes': len(encoded), 'sha256': hashlib.sha256(encoded).hexdigest()}}}
            baseline = {'version': 1, 'recipe': prepare.RECIPE, 'script_revision': revision(root), 'assets': {'file.js': record}}

            def checked(mutation):
                manifest = json.loads(json.dumps(baseline)); mutation(manifest)
                (root / prepare.MANIFEST).write_text(json.dumps(manifest))
                return prepare.check(root)

            self.assertEqual(checked(lambda m: None), [])
            mutations = {
                'stale browser cache version': lambda m: m.update(script_revision='old'),
                'old global recipe': lambda m: m.update(recipe='old'),
                'mixed seed recipe': lambda m: m['assets']['file.js'].update(recipe='old'),
                'false original transfer size': lambda m: m['assets']['file.js'].update(bytes=1),
                'false encoded transfer size': lambda m: m['assets']['file.js']['variants']['gzip'].update(bytes=1),
                'unsafe suffix': lambda m: m['assets']['file.js']['variants']['gzip'].update(suffix='/../outside'),
            }
            for name, mutation in mutations.items():
                with self.subTest(name=name):
                    self.assertTrue(checked(mutation))
