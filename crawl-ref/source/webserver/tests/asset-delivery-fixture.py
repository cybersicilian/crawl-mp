"""Loopback-only asset delivery fixture; no accounts, engine or saved data."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import signal
import sys

import tornado.httpserver
import tornado.ioloop
import tornado.netutil
import tornado.web
import tornado.template

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--web-root', type=Path, default=ROOT)
parser.add_argument('--cache-root', type=Path)
args = parser.parse_args()
args.web_root = args.web_root.resolve()
sys.path.insert(0, str(args.web_root))
from webtiles import config
from webtiles.game_data_handler import GameDataHandler
from webtiles.static_assets import AssetGzipEncoding, StaticAssetHandler
from webtiles.asset_delivery import versioned_url
from webtiles.asset_revision import versions
from webtiles.stylesheet_assets import stylesheet_urls

counts = Counter()
request_log = []


def record_response(handler):
    request_headers = ['Accept', 'Accept-Encoding', 'Cache-Control', 'Pragma', 'If-None-Match', 'If-Modified-Since']
    response_headers = ['Cache-Control', 'ETag', 'Vary', 'Content-Encoding', 'Content-Type', 'Expires', 'Last-Modified']
    request_log.append({'url': handler.request.uri, 'status': handler.get_status(),
        'request': {name: handler.request.headers.get(name) for name in request_headers},
        'response': {name: handler._headers.get(name) for name in response_headers}})


class CountedStatic(StaticAssetHandler):
    def on_finish(self):
        record_response(self)

    async def get(self, path, include_body=True):
        counts[self.request.uri] += 1
        await super().get(path, include_body=include_body)


class CountedGame(GameDataHandler):
    def on_finish(self):
        record_response(self)

    async def get(self, path, include_body=True):
        counts[self.request.uri] += 1
        await super().get(path, include_body=include_body)


class Page(tornado.web.RequestHandler):
    def get(self):
        self.set_header('Content-Type', 'text/html; charset=UTF-8')
        self.write('<!doctype html><title>Lossless asset delivery verification</title><body></body>')


class Metrics(tornado.web.RequestHandler):
    def get(self):
        self.set_header('Cache-Control', 'no-store')
        self.write(dict(counts))


class RequestLog(tornado.web.RequestHandler):
    def get(self):
        self.set_header('Cache-Control', 'no-store')
        self.write({'requests': request_log})


class GameFragment(tornado.web.RequestHandler):
    def get(self):
        client_root = args.web_root / 'game_data/static'
        variant = self.get_query_argument('cache', '')
        if variant:
            if variant not in ('one', 'two') or args.cache_root is None:
                raise tornado.web.HTTPError(400)
            client_root = args.cache_root / variant
        assets = versions(b'asset-delivery-fixture', client_root)
        GameDataHandler.add_version(assets.base, str(client_root))
        GameDataHandler.add_version(assets.content, str(client_root), assets.scripts)
        def image_url(filename, lobby=False):
            root = args.web_root / 'static' if lobby else client_root
            return versioned_url(root, filename, '/static/' if lobby else '/gamedata/' + assets.base + '/')
        def stylesheets(name):
            return stylesheet_urls(client_root, name, '/gamedata/' + assets.content + '/',
                {'/static/': args.web_root / 'static'}, allow_bundle=self.get_query_argument('styles', '') != 'raw',
                bundle_prefix='/gamedata/' + assets.base + '/')
        template = tornado.template.Loader(str(args.web_root / 'game_data/templates')).load('game.html')
        self.set_header('Content-Type', 'text/html')
        self.write(template.generate(version=assets.content, image_url=image_url, stylesheets=stylesheets))


class LobbyFragment(tornado.web.RequestHandler):
    def get(self):
        def stylesheets(name):
            return stylesheet_urls(args.web_root / 'static', name, '/static/', {'/static/': args.web_root / 'static'},
                allow_bundle=self.get_query_argument('styles', '') != 'raw')
        self.set_header('Content-Type', 'text/html')
        self.write(self.render_string('client.html', socket_server='ws://127.0.0.1/unconnected', game_version='fixture',
            client_asset_revision='', stylesheets=stylesheets, username=None, config=config,
            reset_token=None, reset_token_error=None))


if __name__ == '__main__':
    GameDataHandler.add_version('c0ffee', str(args.web_root / 'game_data/static'))
    app = tornado.web.Application([(r'/', Page), (r'/metrics', Metrics), (r'/request-log', RequestLog), (r'/game-fragment', GameFragment), (r'/lobby-fragment', LobbyFragment),
        (r'/gamedata/([0-9a-f]+/.*)', CountedGame)],
        static_path=str(args.web_root / 'static'), static_handler_class=CountedStatic,
        template_path=str(args.web_root / 'templates'),
        transforms=[AssetGzipEncoding])
    sockets = tornado.netutil.bind_sockets(0, address='127.0.0.1')
    server = tornado.httpserver.HTTPServer(app)
    server.add_sockets(sockets)
    loop = tornado.ioloop.IOLoop.current()
    async def close():
        server.stop()
        await server.close_all_connections()
        loop.stop()
    signal.signal(signal.SIGTERM, lambda *_: loop.add_callback(close))
    runtime = {}
    for name in ['asset_delivery', 'asset_revision', 'static_assets', 'game_data_handler', 'stylesheet_assets']:
        source = Path(sys.modules['webtiles.' + name].__file__).resolve()
        assert source.is_relative_to(args.web_root), 'Fixture imported checkout runtime: ' + str(source)
        runtime[name] = {'path': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
    print(json.dumps({'url': 'http://127.0.0.1:' + str(sockets[0].getsockname()[1]),
                      'webRoot': str(args.web_root), 'runtime': runtime,
                      'fixturePolicy': {'game_data_no_cache': bool(config.get('game_data_no_cache')),
                                        'use_gzip': bool(config.get('use_gzip'))}}), flush=True)
    loop.start()
