"""Copy one test package through the existing library adapter; never start a server."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--candidate-sha256', required=True)
args = parser.parse_args()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
runtime = args.runtime
assert runtime.is_absolute() and runtime.parent == Path('/tmp')
assert runtime.name.startswith('dcss-pk') and not runtime.is_symlink()
base = runtime / 'library'
candidate = args.candidate_sha256
assert len(candidate) == 64 and all(c in '0123456789abcdef' for c in candidate)
assert not args.output.exists()
assert args.output.resolve().is_relative_to(runtime.resolve())
assert args.fixture.resolve().is_relative_to(Path('/tmp').resolve())
assert not args.fixture.is_symlink()
info = json.loads((runtime / 'run-info.json').read_text())
assert info['binary_sha256'] == candidate
binary = Path(info['build']) / 'crawl'
assert sha(binary) == candidate
assert args.source.resolve() == Path(info['source']).resolve()
fixture = json.loads((args.fixture / 'fixture.json').read_text())
assert fixture['schema'] == 1 and fixture['wizardFixture'] is True
assert fixture['saveVersion'] == '34.345'
assert fixture['sourceBinarySha256'] == 'e8922833696f19e5e03d88572decf1889732923fdf976e3cd15880dae750d17b'
save = args.fixture / fixture['saveFile']
assert save.resolve().is_relative_to(args.fixture.resolve()) and not save.is_symlink()
assert sha(save) == fixture['saveSha256']
defaults = info['native_discovery_defaults']
assert all(Path(p).resolve().is_relative_to(runtime.resolve()) for p in defaults.values())
assert not Path(defaults['CRAWL_RC']).read_bytes()
os.environ.update(defaults)
os.environ['CRAWL_LIBRARY_DIR'] = str(base)
version = subprocess.check_output([str(binary), '-save-version', str(save)], text=True, timeout=10)
assert version.rstrip().endswith(' is 34.345')
metadata = json.loads(subprocess.check_output([str(binary), '-save-json', str(save)], text=True, timeout=10))
assert any(row['loadable'] and row['name'] == fixture['username'] for row in metadata.values())
assert sha(save) == fixture['saveSha256']
sys.path.insert(0, str(args.source / 'webserver'))
from webtiles import game_library
assert game_library.latest_game(fixture['username'], fixture['mode'], base_dir=str(base)) is None
record = game_library.import_legacy(fixture['username'], fixture['mode'], str(args.fixture), base_dir=str(base))
assert record is not None
game_library.update_party(record['id'], fixture['party'], base_dir=str(base))
copies = game_library.save_files(record)
assert len(copies) == 1
imported = Path(copies[0])
assert imported.resolve().is_relative_to((base / 'saves').resolve())
assert sha(imported) == fixture['saveSha256']
imported.chmod(0o600)  # Native saving changes only this disposable imported copy.
manifest = {**fixture, 'runtime': str(runtime), 'importerBase': str(base),
            'candidateBinarySha256': candidate, 'recordId': record['id'],
            'sourceSavePath': str(save), 'importedSavePath': str(imported),
            'candidateNativeMetadata': metadata, 'candidateSaveVersion': version,
            'runtimeInfoSha256': sha(runtime / 'run-info.json'),
            'fixtureManifestSha256': sha(args.fixture / 'fixture.json')}
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('x') as stream:
    json.dump(manifest, stream, indent=2)
    stream.write('\n')
print(json.dumps({'manifest': str(args.output), 'sha256': sha(args.output),
                  'recordId': record['id'], 'wizardFixtureRetained': True}))
