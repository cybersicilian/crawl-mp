"""Loopback-only account graphics fixture; never starts a native game."""
import argparse
import json
from pathlib import Path
import tempfile
from unittest.mock import Mock

import tornado.ioloop
import tornado.netutil
import tornado.web

from webtiles import auth, profile_graphics, userdb
from webtiles.graphics_http import GraphicsAPIHandler, GraphicsPageHandler
from webtiles.profile_http import ProfilePageHandler, AppearanceAPIHandler, signed_in_user


class Login(tornado.web.RequestHandler):
    def get(self, name):
        if name not in ['Aster', 'Rowan']:
            raise tornado.web.HTTPError(400)
        self.set_cookie('login', auth.log_in_as_user(Mock(), name))
        self.write('Isolated graphics fixture account')


class Probe(tornado.web.RequestHandler):
    def get(self):
        username = signed_in_user(self)
        initial = json.dumps(profile_graphics.state(username)).replace('<', '\\u003c')
        self.write('''<!doctype html><html><head><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/game-static/style.css">
<link rel="stylesheet" href="/game-static/styles/party-inspector.css">
<link rel="stylesheet" href="/static/tabletop/character-folio.css">
<link rel="stylesheet" href="/game-static/styles/equipment-paperdoll.css"></head>
<body>
<button id="graphics_probe_open">Graphics settings</button><div id="dungeon" tabindex="0"></div>
''' + (Path(__file__).parent / 'fixtures/ui-theme-surfaces.html').read_text() + '''
<script src="/static/scripts/contrib/require.js"></script><script>
require.config({baseUrl:'/static/scripts',paths:{jquery:'/static/scripts/contrib/jquery'},shim:{'contrib/jquery.json':['jquery']}});
require(['graphics-preferences','visual-presentation','graphics-dialog'],function(prefs,visual,dialog){
prefs.bindUser(''' + json.dumps(username) + ',' + initial + ''');
window.graphicsProbe={prefs:prefs,visual:visual};window.nativeKeys=0;
document.addEventListener('keydown',function(){window.nativeKeys++;});
document.getElementById('graphics_probe_open').onclick=function(){dialog.open();};
});</script></body></html>''')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--ready', required=True); args = parser.parse_args()
    root = Path(__file__).parents[1]
    with tempfile.TemporaryDirectory(prefix='dcss-graphics-db-') as directory:
        userdb.settings_db = userdb.crawl_db(str(Path(directory) / 'settings.sqlite'))
        app = tornado.web.Application([
            (r'/fixture-login/(Aster|Rowan)', Login), (r'/profile', ProfilePageHandler),
            (r'/settings/graphics', GraphicsPageHandler),
            (r'/probe', Probe), (r'/api/profile/graphics', GraphicsAPIHandler),
            (r'/api/profile/appearance', AppearanceAPIHandler),
            (r'/game-static/(.*)', tornado.web.StaticFileHandler, {'path': str(root / 'game_data/static')}),
            (r'/static/(.*)', tornado.web.StaticFileHandler, {'path': str(root / 'static')})
        ], template_path=str(root / 'templates'))
        sockets = tornado.netutil.bind_sockets(0, '127.0.0.1')
        import tornado.httpserver
        server = tornado.httpserver.HTTPServer(app); server.add_sockets(sockets)
        Path(args.ready).write_text(json.dumps({'url': 'http://127.0.0.1:' + str(sockets[0].getsockname()[1])}))
        tornado.ioloop.IOLoop.current().start()
