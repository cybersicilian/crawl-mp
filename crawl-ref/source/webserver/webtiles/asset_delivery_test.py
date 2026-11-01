import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import struct
import zlib

import tornado.web
from tornado.testing import AsyncHTTPTestCase

from webtiles.asset_delivery import MANIFEST, digests, preferences, select, versioned_url
from webtiles.game_data_handler import GameDataHandler
from webtiles.static_assets import AssetGzipEncoding, StaticAssetHandler
from webtiles.png_optimization import SIGNATURE, chunks, optimize


def fixture(root):
    assets = {}
    for name, body in [('code.js', b'const message = "unchanged source";\n' * 100), ('image.png', b'original-image' * 100)]:
        path = root / name
        path.write_bytes(body)
        variants = {}
        encoded = {'br': ('.br', b'prebuilt-brotli'), 'gzip': ('.gz', gzip.compress(body, mtime=0))}
        if name.endswith('.png'):
            encoded = {'webp': ('.lossless.webp', b'prebuilt-lossless-webp')}
        for key, (suffix, data) in encoded.items():
            Path(str(path) + suffix).write_bytes(data)
            variants[key] = {'suffix': suffix, 'sha256': hashlib.sha256(data).hexdigest()}
        assets[name] = {'sha256': hashlib.sha256(body).hexdigest(), 'variants': variants}
    (root / MANIFEST).write_text(json.dumps({'version': 1, 'script_revision': 'group-revision', 'assets': assets}))


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        fixture(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_encoding_preferences_and_explicit_image_support(self):
        code = self.root / 'code.js'
        self.assertEqual(select(self.root, code, 'text/javascript', accept_encoding='gzip, br').encoding, 'br')
        self.assertEqual(select(self.root, code, 'text/javascript', accept_encoding='br;q=.2,gzip;q=.8').encoding, 'gzip')
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='br;q=0,gzip;q=0').encoding)
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='identity;q=1,gzip;q=.2').encoding)
        image = self.root / 'image.png'
        self.assertEqual(select(self.root, image, 'image/png', accept='image/webp,*/*;q=.5').content_type, 'image/webp')
        for accept in ('', '*/*', 'image/webp;q=0,image/png', 'image/webp;q=.2,image/png;q=1'):
            self.assertEqual(select(self.root, image, 'image/png', accept=accept).content_type, 'image/png')
        self.assertEqual(preferences('gzip;q=NaN, br;q=5, identity;q=0'), {'gzip': 0, 'br': 0, 'identity': 0})

    def test_content_versions_change_with_artwork(self):
        first = versioned_url(self.root, 'image.png', '/static/')
        self.assertEqual(first, '/static/image.png?v=' + digests(self.root / 'image.png')[0])
        (self.root / 'image.png').write_bytes(b'new artwork')
        self.assertNotEqual(first, versioned_url(self.root, 'image.png', '/static/'))
        with self.assertRaises(ValueError):
            versioned_url(self.root, '../secret.png', '/static/')

    def test_stale_source_or_representation_falls_back(self):
        code = self.root / 'code.js'
        self.assertTrue(select(self.root, code, 'text/javascript', accept_encoding='br').encoding)
        Path(str(code) + '.br').write_bytes(b'corrupt')
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='br').encoding)
        code.write_bytes(b'new source')
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='gzip').prepared)

    def test_ranges_and_missing_or_malformed_manifests_keep_source(self):
        code = self.root / 'code.js'
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='br', ranged=True).suffix)
        (self.root / MANIFEST).write_text('{bad')
        self.assertFalse(select(self.root, code, 'text/javascript', accept_encoding='br').prepared)
        (self.root / MANIFEST).unlink()
        self.assertFalse(select(self.root, code, 'text/javascript').prepared)

    def test_manifest_cannot_redirect_to_unrelated_files(self):
        manifest = json.loads((self.root / MANIFEST).read_text())
        manifest['assets']['code.js']['variants']['br']['suffix'] = '/../image.png'
        (self.root / MANIFEST).write_text(json.dumps(manifest))
        self.assertFalse(select(self.root, self.root / 'code.js', 'text/javascript', accept_encoding='br').suffix)

    def test_optimized_png_negotiation_keeps_original_for_ranges(self):
        image = self.root / 'image.png'
        compressed = Path(str(image) + '.lossless.png')
        compressed.write_bytes(b'optimized-png')
        manifest = json.loads((self.root / MANIFEST).read_text())
        manifest['assets']['image.png']['variants'] = {'png': {'suffix': '.lossless.png', 'sha256': digests(compressed)[0]}}
        (self.root / MANIFEST).write_text(json.dumps(manifest))
        self.assertEqual(select(self.root, image, 'image/png').suffix, '.lossless.png')
        self.assertEqual(select(self.root, image, 'image/png', ranged=True).suffix, '')

    def test_png_scanlines_and_metadata_survive_recompression(self):
        def chunk(tag, payload):
            return struct.pack('>I', len(payload)) + tag + payload + struct.pack('>I', zlib.crc32(tag + payload))
        scanlines = b'\x00' + bytes([120, 150, 170, 127]) * 256
        source = (SIGNATURE + chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 1, 8, 6, 0, 0, 0))
                  + chunk(b'tEXt', b'Author\x00Preserved provenance')
                  + chunk(b'IDAT', zlib.compress(scanlines, 0)) + chunk(b'IEND', b''))
        result = optimize(source)
        self.assertLess(len(result), len(source))
        self.assertEqual(zlib.decompress(b''.join(data for tag, data, _ in chunks(result) if tag == b'IDAT')), scanlines)
        self.assertEqual([raw for tag, _, raw in chunks(source) if tag != b'IDAT'],
                         [raw for tag, _, raw in chunks(result) if tag != b'IDAT'])
        with self.assertRaises(ValueError):
            optimize(source[:-1] + b'!')


class AssetHTTPTests(AsyncHTTPTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        fixture(self.root)
        GameDataHandler.add_version('abcd', str(self.root))
        super().setUp()

    def tearDown(self):
        super().tearDown()
        GameDataHandler._client_paths.pop('abcd', None)
        GameDataHandler._asset_versions.pop('abcd', None)
        GameDataHandler._client_paths.pop('beef', None)
        GameDataHandler._asset_versions.pop('beef', None)
        self.temp.cleanup()

    def get_app(self):
        class Dynamic(tornado.web.RequestHandler):
            def get(self):
                self.set_header('Content-Type', 'text/plain')
                self.write('dynamic response ' * 100)
        return tornado.web.Application([(r'/dynamic', Dynamic), (r'/gamedata/([0-9a-f]+/.*)', GameDataHandler)],
            static_path=str(self.root), static_handler_class=StaticAssetHandler, transforms=[AssetGzipEncoding])

    def test_text_encodings_mime_and_no_double_compression(self):
        for prefix in ('/static/', '/gamedata/abcd/'):
            br = self.fetch(prefix + 'code.js', headers={'Accept-Encoding': 'br,gzip'}, decompress_response=False)
            self.assertEqual(br.code, 200)
            self.assertEqual(br.body, b'prebuilt-brotli')
            self.assertEqual(br.headers['Content-Encoding'], 'br')
            self.assertIn('javascript', br.headers['Content-Type'])
            self.assertIn('Accept-Encoding', br.headers['Vary'])
            gz = self.fetch(prefix + 'code.js', headers={'Accept-Encoding': 'gzip'}, decompress_response=False)
            self.assertEqual(gzip.decompress(gz.body), (self.root / 'code.js').read_bytes())

    def test_quality_zero_identity_and_dynamic_gzip(self):
        result = self.fetch('/static/code.js', headers={'Accept-Encoding': 'gzip;q=0,br;q=0'}, decompress_response=False)
        self.assertNotIn('Content-Encoding', result.headers)
        self.assertEqual(result.body, (self.root / 'code.js').read_bytes())
        dynamic = self.fetch('/dynamic', headers={'Accept-Encoding': 'gzip'}, decompress_response=False)
        self.assertEqual(dynamic.headers['Content-Encoding'], 'gzip')
        self.assertEqual(gzip.decompress(dynamic.body), b'dynamic response ' * 100)
        refused = self.fetch('/static/image.png', headers={'Accept-Encoding': 'identity;q=0'}, decompress_response=False)
        self.assertEqual(refused.code, 406)

    def test_image_negotiation_and_fallback(self):
        webp = self.fetch('/static/image.png', headers={'Accept': 'image/webp,image/*;q=.8'})
        self.assertEqual(webp.headers['Content-Type'], 'image/webp')
        self.assertEqual(webp.body, b'prebuilt-lossless-webp')
        self.assertIn('Accept', webp.headers['Vary'])
        png = self.fetch('/static/image.png', headers={'Accept': 'image/png'})
        self.assertEqual(png.headers['Content-Type'], 'image/png')
        self.assertEqual(png.body, (self.root / 'image.png').read_bytes())

    def test_etags_are_representation_specific_and_conditional(self):
        first = self.fetch('/static/code.js', headers={'Accept-Encoding': 'br'}, decompress_response=False)
        headers = {'Accept-Encoding': 'br', 'If-None-Match': first.headers['ETag']}
        cached = self.fetch('/static/code.js', headers=headers, decompress_response=False)
        self.assertEqual(cached.code, 304)
        self.assertEqual(cached.body, b'')
        changed = self.fetch('/static/code.js', headers={**headers, 'Accept-Encoding': 'gzip'}, decompress_response=False)
        self.assertEqual(changed.code, 200)
        self.assertNotEqual(first.headers['ETag'], changed.headers['ETag'])

    def test_head_and_range_use_correct_lengths(self):
        head = self.fetch('/static/code.js', method='HEAD', headers={'Accept-Encoding': 'br'}, decompress_response=False)
        self.assertEqual(head.body, b'')
        self.assertEqual(int(head.headers['Content-Length']), len(b'prebuilt-brotli'))
        partial = self.fetch('/static/code.js', headers={'Accept-Encoding': 'br,gzip', 'Range': 'bytes=0-4'}, decompress_response=False)
        self.assertEqual(partial.code, 206)
        self.assertNotIn('Content-Encoding', partial.headers)
        self.assertEqual(partial.body, (self.root / 'code.js').read_bytes()[:5])

    def test_immutable_only_for_verified_versions(self):
        for version in (digests(self.root / 'code.js')[0], digests(self.root / 'code.js')[1], 'group-revision'):
            result = self.fetch('/static/code.js?v=' + version)
            self.assertIn('immutable', result.headers.get('Cache-Control', ''))
        for url in ('/static/code.js', '/static/code.js?v=incorrect'):
            self.assertEqual(self.fetch(url).headers.get('Cache-Control'), 'no-cache')

    def test_registered_content_paths_cache_code_independently_of_lobby_query(self):
        GameDataHandler.add_version('beef', str(self.root), 'group-revision')
        for suffix in ('', '?v=unrelated-lobby-version'):
            result = self.fetch('/gamedata/beef/code.js' + suffix)
            self.assertEqual(result.code, 200)
            self.assertIn('immutable', result.headers.get('Cache-Control', ''))
        image = self.fetch('/gamedata/beef/image.png')
        self.assertNotIn('immutable', image.headers.get('Cache-Control', ''), 'Script identity does not claim to version pixels')
        self.assertNotIn('immutable', self.fetch('/gamedata/abcd/code.js').headers.get('Cache-Control', ''))
        GameDataHandler.add_version('beef', str(self.root), 'wrong-root-version')
        self.assertNotIn('immutable', self.fetch('/gamedata/beef/code.js').headers.get('Cache-Control', ''))
        GameDataHandler.add_version('beef', str(self.root), 'group-revision')
        (self.root / 'code.js').write_bytes(b'changed source')
        self.assertNotIn('immutable', self.fetch('/gamedata/beef/code.js').headers.get('Cache-Control', ''))

    def test_unknown_game_versions_and_traversal_fail(self):
        self.assertEqual(self.fetch('/gamedata/bad/code.js').code, 404)
        self.assertEqual(self.fetch('/static/%2e%2e/secret.txt').code, 403)
        self.assertEqual(self.fetch('/gamedata/abcd/%2e%2e/secret.txt').code, 403)


if __name__ == '__main__':
    unittest.main()
