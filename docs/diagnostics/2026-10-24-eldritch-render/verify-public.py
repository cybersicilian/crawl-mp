"""Read-only public byte and health verification for the scoped browser release."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request

HERE = Path(__file__).resolve().parent
BASE = 'https://dcss.iancaltabiano.com'
with urllib.request.urlopen(BASE + '/', timeout=30) as response:
    html = response.read().decode()
revision = re.search(r'var client_asset_version\s*=\s*"([a-f0-9]+)"', html).group(1)
manifest = json.loads((HERE / 'patch-manifest.json').read_text())
result = {'revision': revision, 'files': {}}
for name, row in manifest.items():
    url = BASE + '/static/scripts/' + name + '?v=' + revision
    with urllib.request.urlopen(url, timeout=30) as response:
        digest = hashlib.sha256(response.read()).hexdigest()
    assert digest == row['after'], name
    result['files'][name] = digest
with urllib.request.urlopen(BASE + '/status/version/', timeout=30) as response:
    result['health'] = json.load(response)
assert result['health']['python_supported']
result['passed'] = True
(HERE / 'public-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
