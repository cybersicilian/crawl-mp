"""Real client-payload construction without starting a game or touching saves."""
from html.parser import HTMLParser
from pathlib import Path
import shutil
import json
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from webtiles.game_data_handler import GameDataHandler
from webtiles.process_handler import CrawlProcessHandlerBase


class Sources(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.images = {}
        self.styles = []
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'img' and 'id' in attrs:
            self.images[attrs['id']] = attrs.get('src', attrs.get('data-src'))
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.styles.append(attrs['href'])


class ClientAssetVersionTests(unittest.TestCase):
    def test_real_payload_rotates_browser_modules_but_reuses_unchanged_atlases(self):
        original_paths = dict(GameDataHandler._client_paths)
        original_versions = dict(GameDataHandler._asset_versions)
        try:
            with tempfile.TemporaryDirectory() as directory:
                client = Path(directory) / 'client'
                static = client / 'static'; static.mkdir(parents=True)
                templates = Path(__file__).resolve().parents[1] / 'game_data/templates'
                shutil.copytree(templates, client / 'templates')
                script = static / 'feature.js'; script.write_text('first')
                style = static / 'style.css'; style.write_text('body { color: red; }')
                (static / 'stylesheet-bundles.json').write_text(json.dumps({'version': 1, 'entries': {'game': ['style.css']}}))
                (static / 'floor.png').write_bytes(b'unchanged atlas fixture')
                process = SimpleNamespace(client_path=str(client), crawl_version='fixed-native-build', presentation='overhead')

                def payload():
                    watcher = SimpleNamespace(last_party_snapshot='old snapshot', send_message=Mock())
                    with patch('webtiles.process_handler.config.get', return_value=str(static)):
                        CrawlProcessHandlerBase._send_client(process, watcher)
                    self.assertIsNone(watcher.last_party_snapshot)
                    call = watcher.send_message.call_args_list[0]
                    self.assertEqual(call.args, ('game_client',))
                    return call.kwargs, Sources(call.kwargs['content'])

                first, before = payload()
                self.assertTrue(GameDataHandler._asset_versions[first['version']])
                self.assertTrue(any(url.startswith('/gamedata/' + first['version'] + '/style.css?v=') for url in before.styles))
                self.assertIn('"/gamedata/' + first['version'] + '"', first['content'])
                script.write_text('changed browser behavior')
                second, after = payload()
                self.assertNotEqual(first['version'], second['version'])
                self.assertEqual(before.images['floor'], after.images['floor'])
                self.assertTrue(any(url.startswith('/gamedata/' + second['version'] + '/style.css?v=') for url in after.styles))
                self.assertNotEqual(GameDataHandler._asset_versions[first['version']], GameDataHandler._asset_versions[second['version']])
                (static / 'floor.png').write_bytes(b'new atlas pixels')
                third, changed_media = payload()
                self.assertEqual(second['version'], third['version'])
                self.assertNotEqual(after.images['floor'], changed_media.images['floor'])
                style.write_text('body { color: blue; }')
                fourth, _ = payload()
                self.assertNotEqual(third['version'], fourth['version'])
        finally:
            GameDataHandler._client_paths.clear(); GameDataHandler._client_paths.update(original_paths)
            GameDataHandler._asset_versions.clear(); GameDataHandler._asset_versions.update(original_versions)
