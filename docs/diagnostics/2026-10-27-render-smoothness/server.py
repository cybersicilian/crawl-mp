"""Disposable localhost server; all account and native state lives in QA_WORK."""
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path('/private/tmp/dcss-prompt-ownership-01a17b3b/source')
WEB = ROOT / 'crawl-ref/source/webserver'
WORK = Path(os.environ['QA_WORK'])
sys.path.insert(0, str(WEB))
import config
import yaml
import webtiles.config
import webtiles.server
from webtiles.process_handler import CrawlProcessHandlerBase

original_call = CrawlProcessHandlerBase._base_call
def traced_call(self):
    call = original_call(self)
    print('QA_NATIVE_CALL', repr(call), flush=True)
    return call
CrawlProcessHandlerBase._base_call = traced_call

for name in ['rcs', 'rcs/running', 'rcs/ttyrecs', 'saves', 'run']:
    (WORK / name).mkdir(parents=True, exist_ok=True)
os.chdir(WORK)
os.environ['CRAWL_LIBRARY_DIR'] = str(WORK / 'library')
os.environ['CRAWL_DIR'] = str(SOURCE)
os.environ['CRAWL_SAVE_DIR'] = str(WORK / 'saves')
os.environ['CRAWL_RECORD_PATH'] = str(WORK / 'records.json')
data = yaml.safe_load((WEB / 'games.d/base.yaml').read_text())
base = dict(data['templates'][0])
base.pop('id')
base.update(crawl_binary=str(SOURCE / 'crawl'), rcfile_path=str(WORK / 'rcs'),
            macro_path=str(WORK / 'rcs'), morgue_path=str(WORK / 'rcs/%n'),
            socket_path=str(WORK / 'rcs'), dir_path=str(SOURCE),
            inprogress_path=str(WORK / 'rcs/running'),
            ttyrec_path=str(WORK / 'rcs/ttyrecs/%n'),
            client_path=str(WEB / 'game_data'),
            pre_options=['-seed', '112358'])
config.games = {entry['id']: dict(base, version='trunk', **{
    key: value for key, value in entry.items() if key not in ['id', 'template']
}) for entry in data['games']}
config.use_game_yaml = False
config.templates = {}
config.password_db = str(WORK / 'accounts.db3')
config.settings_db = str(WORK / 'settings.db3')
config.dgl_status_file = str(WORK / 'rcs/status')
config.static_path = str(WEB / 'static')
config.template_path = str(WEB / 'templates')
config.bind_address = '127.0.0.1'
config.bind_port = 19028
config.server_socket_path = str(WORK / 'run')
config.logging_config = {'level': 'WARNING'}
initializer = WORK / 'init-player.sh'
initializer.write_text('#!/bin/sh\nmkdir -p "$QA_WORK/rcs/ttyrecs/$1" "$QA_WORK/rcs/$1"\n')
initializer.chmod(0o700)
config.init_player_program = str(initializer)
webtiles.config.init_config_from_module(config)
sys.argv = [str(__file__), '--live-debug', '-p', '19028']
webtiles.server.run()
