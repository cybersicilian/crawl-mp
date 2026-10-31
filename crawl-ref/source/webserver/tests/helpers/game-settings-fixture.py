"""Isolated browser fixture using real settings socket handlers and SQLite."""
import argparse
import asyncio
import json
from pathlib import Path
import tempfile
from unittest.mock import patch

import tornado.web
import tornado.websocket
from webtiles import config, game_settings, game_settings_socket, userdb

ROOT = Path(__file__).resolve().parents[2]
PAGE = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<link rel="stylesheet" href="/static/style.css">
<style>body{margin:0;background:#222b27}#rc_edit{display:block}.fixture{padding:2rem;color:#eee}</style>
</head><body><div class="fixture"><h1>Saved expeditions</h1></div>MENU
<script src="/static/scripts/contrib/require.js"></script><script>
require.config({baseUrl:'/static/scripts',paths:{jquery:'contrib/jquery'}});
window.sent=[];var receiver;var socket=new WebSocket(location.origin.replace('http','ws')+'/ws');
define('comm',[],function(){return {send_message:function(msg,data){window.sent.push({msg:msg,...data});socket.send(JSON.stringify({msg:msg,...data}));}};});
define('lobby-modes',[],function(){return function(){};});
define('chat',[],function(){return {reset_visibility:function(){}};});
define('expedition-url',[],function(){return {};});define('mode-catalogue',[],function(){return {};});
require(['client-lobby','jquery','client-dialogs'],function(create,$,dialogs){
 var state={current_user:'Aster'},api={};Object.assign(api,dialogs(api,state));
 window.app=create(api,state);
 window.addEventListener('resize',function(){$('.floating_dialog:visible').each(function(){api.center_element($(this));});});
 $('#rc_edit_form').on('submit',window.app.send_rc);$('.hide_dialog').on('click',function(){$('#rc_edit').hide();});
 socket.onmessage=function(event){window.app.game_settings(JSON.parse(event.data));};
 window.start=function(){window.app.edit_rc('solo');window.ready=true;};
 if(socket.readyState===1)window.start();else socket.onopen=window.start;
});</script></body></html>'''


class Page(tornado.web.RequestHandler):
    def get(self):
        self.write(PAGE.replace('MENU', (ROOT/'templates/game-settings.html').read_text()))


class Socket(tornado.websocket.WebSocketHandler):
    def open(self):
        self.username = 'Aster'
        import logging
        self.logger = logging.getLogger('fixture')
        self.fail_next = False

    def reset_lobby_timeout(self): pass
    def rcfile_path(self, game_id): return str(self.application.settings['rc_path'])
    def send_message(self, msg, **data): self.write_message(dict(msg=msg, **data))

    async def on_message(self, raw):
        data = json.loads(raw); msg = data.pop('msg')
        if msg == 'fixture_fail_next': self.fail_next = True; return
        if msg not in ('get_game_settings', 'set_game_settings'): return
        save = msg == 'set_game_settings'
        if save: await asyncio.sleep(.1)
        if save and self.fail_next:
            self.fail_next = False
            with patch.object(game_settings, 'update', side_effect=OSError('fixture')):
                game_settings_socket.handle(self, save=True, **data)
        else: game_settings_socket.handle(self, save=save, **data)


class State(tornado.web.RequestHandler):
    def get(self):
        rc = self.application.settings['rc_path']
        self.write(dict(original=rc.read_text(), save=(rc.parent/'untouched.cs').read_text(),
            arguments=game_settings.launch_arguments('Aster', rc)))


async def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port-file',required=True)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='dcss-game-settings-') as scratch:
        directory=Path(scratch);rc=directory/'Aster.rc'
        rc.write_text('# Existing custom settings\ntravel_delay = 75\ndefault_autopickup = false\nunknown_extension = retained\n')
        (directory/'untouched.cs').write_text('A save this fixture must not touch.')
        userdb.settings_db=userdb.crawl_db(str(directory/'settings.sqlite'))
        config.games={'solo':config.GameConfig(dict(id='solo',crawl_binary='crawl',rcfile_path=scratch,
            macro_path=scratch,morgue_path=scratch,options=['-extra-opt-first','explore_delay=0']),use_template=False)}
        application=tornado.web.Application([(r'/',Page),(r'/ws',Socket),(r'/state',State),
            (r'/static/(.*)',tornado.web.StaticFileHandler,{'path':str(ROOT/'static')})],rc_path=rc)
        server=application.listen(0,address='127.0.0.1')
        port=next(iter(server._sockets.values())).getsockname()[1]
        Path(args.port_file).write_text(str(port))
        await asyncio.Event().wait()

if __name__=='__main__': asyncio.run(main())
