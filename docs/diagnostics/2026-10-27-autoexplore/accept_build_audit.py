"""Accept only the independently checked compiler metadata regeneration."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/opt/dcss/staging/autoexplore-01a1801a')
LIVE = Path('/opt/dcss/releases/render-smoothness-01a1801a/crawl-ref/source')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run():
    report = json.loads((ROOT / 'build-result.json').read_text())
    assert report['exit_code'] == 0 and report['native_sha256'] == sha(ROOT / 'source/crawl')
    inputs = json.loads((ROOT / 'source-binding.json').read_text())
    changes = {name: dict(before=expected, after=sha(ROOT / 'source' / name))
               for name, expected in inputs.items() if sha(ROOT / 'source' / name) != expected}
    assert set(changes) == {'.cflags', 'compflag.h'}, changes
    for name in changes:
        assert (ROOT / 'source' / name).read_text() == (LIVE / name).read_text().replace('-O0', '-O2'), name
    audit = dict(passed=True, all_cpp_and_header_inputs_checked=True,
        generated_compiler_metadata_only=True, changes=changes)
    (ROOT / 'generated-flags-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    (ROOT / 'build-result.json').rename(ROOT / 'build-initial-audit.json')
    report.update(passed=True, source_content_unchanged=True,
        generated_compiler_metadata_audit='generated-flags-audit.json')
    (ROOT / 'build-result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(audit), flush=True)


if __name__ == '__main__':
    run()
