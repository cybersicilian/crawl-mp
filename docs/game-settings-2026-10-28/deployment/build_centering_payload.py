"""Two-file centering correction, retaining the deployed settings release."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile

OUT=Path(__file__).resolve().parent
PAYLOAD=OUT/'centering/payload';PAYLOAD.mkdir(parents=True,exist_ok=True)
base=json.loads((OUT/'activation.json').read_text())
edits=[dict(path='webserver/static/scripts/client.js',kind='replace',count=1,
 old='        $(window).resize(function (ev) {\n            do_layout();\n        });',
 new='        $(window).resize(function (ev) {\n            do_layout();\n            $(".floating_dialog:visible").each(function () { api.center_element($(this)); });\n        });'),
 dict(path='webserver/static/scripts/client-lobby.js',kind='replace',count=1,
 old='            rcSettings.load(data);',
 new='            rcSettings.load(data);\n            api.center_element($("#rc_edit"));')]
(PAYLOAD/'edits.json').write_text(json.dumps(edits,indent=2)+'\n')
(PAYLOAD/'overlay').mkdir(exist_ok=True)
shutil.copy2(OUT/'payload/deployment_core.py',PAYLOAD/'deployment_core.py')
s=(OUT/'deploy_settings.py').read_text()
s=s.replace("rows=sorted(repr(tuple(row)) for row in db.execute('SELECT * FROM '+quoted))", "query=('SELECT username,scope,settings FROM '+quoted) if table=='account_game_settings' else ('SELECT * FROM '+quoted)\n                rows=sorted(repr(tuple(row)) for row in db.execute(query))")
(PAYLOAD/'deploy_settings.py').write_text(s)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={'baseline':base['release'],'files':dict(base['runtime_files'],crawl=base['native_sha256']),
 'operation':'categorized-settings-01a1838c-r3','payload_files':{str(p.relative_to(PAYLOAD)):sha(p) for p in PAYLOAD.rglob('*') if p.is_file() and p.name!='manifest.json'}}
(PAYLOAD/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=OUT/'centering/centering-payload.tar.gz'
with tarfile.open(archive,'w:gz') as tar:tar.add(PAYLOAD,arcname='dcss-settings-centering-01a1838c')
print(json.dumps({'archive_sha256':sha(archive),'manifest_sha256':sha(PAYLOAD/'manifest.json')}))
