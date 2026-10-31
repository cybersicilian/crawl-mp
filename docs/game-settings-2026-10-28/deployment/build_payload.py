"""Build a scoped overlay; production source stays on the production host."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
PAYLOAD=OUT/'payload'
PAYLOAD.mkdir(exist_ok=True)
SOURCE=ROOT/'crawl-ref/source'
BASELINE={'baseline':'/opt/dcss/releases/ui-settings-01a182e1','files':{
 'crawl':'9cee132748e0c8465414fe3b2fd7c27edd91c1e569027cdc4af3742250314660',
 'webserver/webtiles/process_handler.py':'6bef25ab25f98a3b0cc67ca0ad7ebd7d5bde9e2b345bf39df2151cf63a80af7c',
 'webserver/webtiles/ws_handler.py':'d1c85282588e8683dc789a677b61f10ddecff2898c1e2a9fa243f1f851bd5580',
 'webserver/static/scripts/client-lobby.js':'2961f09fd0c5303985cff0fcf34a9cce49312ae7b261484a43e50b84729239fc',
 'webserver/static/scripts/client.js':'3434b0508667baf428308a82d3a4f71609548e40a56d1fcca0c84a89c2f7a5e4',
 'webserver/static/scripts/rc-settings.js':'9bb22e8a7967c05587b29b73c751714d863589d3e7b5d0cf532b94e9a5bb273c',
 'webserver/static/styles/rc-settings.css':'58d10bfecd3c216c36df0b2d691cc8b08a900677c76099928dc15ba67232d1b7',
 'webserver/templates/client.html':'e4b91aa2b49fd7df4edad77bdf0593f0c1bfc8e9d4ae444e139f74fa5d800a84',
 'webserver/templates/game_links.html':'336bbaa8b292e4aff1b0139c01160d333d59c85fd59accaa6046939ea8aca3a2'}}
files=['webserver/static/game-settings.json','webserver/static/scripts/rc-settings.js',
 'webserver/static/styles/rc-settings.css','webserver/templates/game-settings.html',
 'webserver/webtiles/game_settings.py','webserver/webtiles/game_settings_model.py',
 'webserver/webtiles/game_settings_socket.py','webserver/webtiles/game_settings_test.py']
for name in files:
 target=PAYLOAD/'overlay'/name;target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copy2(SOURCE/name,target)

edits=[]
def replace(name,old,new,count=1): edits.append(dict(path=name,kind='replace',old=old,new=new,count=count))
replace('webserver/webtiles/process_handler.py','from webtiles import crash_reports\n','from webtiles import crash_reports, game_settings\n')
replace('webserver/webtiles/process_handler.py','        try:\n            self.process = TerminalRecorder(call,','        try:\n            # Native late options override legacy RC, while mode-enforced options stay last.\n            rc_path = os.path.join(self.config_path("rcfile_path"), self.username + ".rc")\n            call[1:1] = game_settings.launch_arguments(self.username, rc_path)\n            self.process = TerminalRecorder(call,')
replace('webserver/webtiles/ws_handler.py','import codecs\n','import codecs\nfrom webtiles import game_settings_socket\n')
replace('webserver/webtiles/ws_handler.py','            "get_rc": self.get_rc,','            "get_game_settings": lambda **kwargs: game_settings_socket.handle(self, **kwargs),\n            "set_game_settings": lambda **kwargs: game_settings_socket.handle(self, save=True, **kwargs),\n            "get_rc": self.get_rc,')
lobby=(SOURCE/'webserver/static/scripts/client-lobby.js').read_text()
a=lobby.index('        var editing_rc,');b=lobby.index('        var new_list',a)
edits.append(dict(path='webserver/static/scripts/client-lobby.js',kind='region',start='        var editing_rc;',end='        var new_list',new=lobby[a:b]))
replace('webserver/static/scripts/client-lobby.js','rcfile_contents: rcfile_contents,','game_settings: game_settings,')
replace('webserver/static/scripts/client-lobby.js','native RC configuration editor','categorized game preferences')
replace('webserver/static/scripts/client-lobby.js','"Edit RC Configuration ("','"Game settings ("')
replace('webserver/static/scripts/client-lobby.js','"Customize your personal init.txt / .rc options (auto-pickup, macros, tile preferences, and autopickup rules) for "','"Change travel, combat, inventory, messages and display preferences for "')
replace('webserver/static/scripts/client-lobby.js','"Config Editor | Saved to your account"','"Game settings | Saved to your account"')
replace('webserver/static/scripts/client.js','"rcfile_contents": api.rcfile_contents,','"game_settings": api.game_settings,')
edits.append(dict(path='webserver/templates/client.html',kind='region',start='      <div id="rc_edit"',end='      <div id="exit_game"',new='      {% include game-settings.html %}\n\n'))
replace('webserver/templates/game_links.html','(edit rc)','(Game settings)',2)
(PAYLOAD/'edits.json').write_text(json.dumps(edits,indent=2)+'\n')
shutil.copy2(ROOT/'docs/diagnostics/2026-10-27-session-handoff/payload/deployment_core.py',PAYLOAD/'deployment_core.py')
shutil.copy2(OUT/'deploy_settings.py',PAYLOAD/'deploy_settings.py')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=dict(BASELINE,operation='categorized-settings-01a1838c-r2',
 payload_files={str(p.relative_to(PAYLOAD)):sha(p) for p in sorted(PAYLOAD.rglob('*')) if p.is_file() and p.name!='manifest.json'})
(PAYLOAD/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'runtime_files':len(files),'edits':len(edits),'manifest_sha256':sha(PAYLOAD/'manifest.json')}))
