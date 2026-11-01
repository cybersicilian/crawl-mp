#!/usr/bin/env python3
"""Build smaller lossless representations; originals and public URLs stay intact."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from webtiles.asset_delivery import MANIFEST, SUFFIXES
from webtiles.asset_revision import revision
from webtiles.png_optimization import optimize as optimize_png
from webtiles.stylesheet_assets import CONFIG, DIRECTORY, INDEX, RECIPE as STYLE_RECIPE, active_bundles, catalog, inputs_match, document

TEXT = {'.js', '.css', '.json', '.svg', '.html', '.txt', '.xml', '.map', '.webmanifest'}
PREVIOUS_RECIPE = 'opaque-binary-webp-exact-png-deflate9-br11-gzip9-v2'
RECIPE = 'opaque-binary-webp-exact-png-deflate9-br11-gzip9-v3'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, sort_keys=True, indent=2) + '\n')
    temporary.replace(path)


def source_files(root):
    bundles = active_bundles(root)
    for path in sorted(root.rglob('*')):
        if DIRECTORY in path.relative_to(root).parts and path.relative_to(root).as_posix() not in bundles:
            continue
        if (not path.is_file() or path.is_symlink() or '__pycache__' in path.parts
                or path.name == MANIFEST or path.name.endswith(('.gz', '.br', '.lossless.webp', '.lossless.png', '.tmp'))):
            continue
        yield path


def run(command, deadline, **kwargs):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Asset compression deadline reached')
    return subprocess.run(command, check=True, timeout=min(120, remaining), **kwargs)


def webp(source, target, deadline):
    from PIL import Image
    with Image.open(source) as original:
        header = source.read_bytes()[:26]
        if original.is_animated or header[24] > 8 or max(original.size) > 16383:
            return None
        before = original.convert('RGBA').tobytes()
        # Browser decoders can round premultiplication differently for partial
        # alpha despite identical straight RGBA. Retain PNG for these images.
        if sum(original.convert('RGBA').getchannel('A').histogram()[1:255]):
            return None
        dimensions = original.size
        icc = original.info.get('icc_profile')
        orientation = original.getexif().get(274, 1)
        if not icc and 'srgb' not in original.info and ('gamma' in original.info or 'chromaticity' in original.info):
            return None
    run(['cwebp', '-quiet', '-lossless', '-z', '9', '-m', '6', '-exact',
         '-metadata', 'icc,exif', str(source), '-o', str(target)], deadline,
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with Image.open(target) as result:
        if (result.size != dimensions or result.convert('RGBA').tobytes() != before
                or result.info.get('icc_profile') != icc or result.getexif().get(274, 1) != orientation):
            raise ValueError('Lossless pixel/alpha/profile verification failed: ' + str(source))
    return {'pixel_sha256': digest(before), 'dimensions': list(dimensions), 'rgba_exact': True}


def png_representation(data, temporary):
    target = temporary / 'image.png'
    target.write_bytes(optimize_png(data))
    return ('png', target, {'scanlines_exact': True, 'ancillary_chunks_exact': True})


def required_saving(kind, source_bytes):
    absolute = 1024 if kind in ('webp', 'png') else 32
    relative = source_bytes * .05
    # Same-format PNG recompression adds no alternate image decoder. Keep a
    # meaningful 64 KiB saving even when a large source falls below five percent.
    return max(absolute, min(relative, 64 * 1024) if kind == 'png' else relative)


def encode(source, data, temporary, deadline):
    if source.suffix.lower() == '.png':
        png = png_representation(data, temporary)
        target = temporary / 'image.webp'
        proof = webp(source, target, deadline)
        return [png] + ([('webp', target, proof)] if proof else [])
    if source.suffix.lower() in TEXT and len(data) >= 128:
        gz = temporary / 'text.gz'
        gz.write_bytes(gzip.compress(data, compresslevel=9, mtime=0))
        br = temporary / 'text.br'
        run(['brotli', '-q', '11', '--no-copy-stat', '-f', '-o', str(br), str(source)], deadline,
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if gzip.decompress(gz.read_bytes()) != data:
            raise ValueError('Gzip verification failed')
        decoded = run(['brotli', '-d', '-c', str(br)], deadline, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
        if decoded != data:
            raise ValueError('Brotli verification failed')
        return [('br', br, {'bytes_exact': True}), ('gzip', gz, {'bytes_exact': True})]
    return []


def check(root, public_roots=None):
    manifest = json.loads((root / MANIFEST).read_text())
    sources = {p.relative_to(root).as_posix(): p for p in source_files(root)}
    errors = []
    style_index = document(root / INDEX)
    if (root / CONFIG).exists():
        if style_index.get('version') != 1 or style_index.get('recipe') != STYLE_RECIPE:
            errors.append('Stylesheet bundle preparation differs')
        expected = set(catalog(root))
        if expected != set(style_index.get('bundles', {})) | set(style_index.get('skipped', {})):
            errors.append('Stylesheet source catalog differs from prepared index')
    for name, record in style_index.get('bundles', {}).items():
        if not inputs_match(record, root, public_roots or {}):
            errors.append('Stylesheet bundle inputs differ: ' + name)
    if manifest.get('version') != 1 or manifest.get('recipe') != RECIPE:
        errors.append('Asset preparation recipe differs')
    if manifest.get('script_revision') != revision(root):
        errors.append('Script/style content revision differs')
    if set(sources) != set(manifest['assets']):
        errors.append('Asset inventory differs from prepared manifest')
    for name, path in sources.items():
        record = manifest['assets'].get(name, {})
        data = path.read_bytes()
        if digest(data) != record.get('sha256'):
            errors.append('Changed source: ' + name)
        if len(data) != record.get('bytes'):
            errors.append('Source size differs: ' + name)
        if record.get('recipe', manifest.get('recipe')) != RECIPE:
            errors.append('Source preparation recipe differs: ' + name)
        for kind, variant in record.get('variants', {}).items():
            if kind not in SUFFIXES or variant.get('suffix') != SUFFIXES[kind]:
                errors.append('Unsupported representation: ' + name)
                continue
            target = Path(str(path) + variant['suffix'])
            if not target.is_file() or target.is_symlink():
                errors.append('Missing/changed representation: ' + str(target))
                continue
            encoded = target.read_bytes()
            if digest(encoded) != variant.get('sha256') or len(encoded) != variant.get('bytes'):
                errors.append('Missing/changed representation: ' + str(target))
    return errors


def prepare(root, deadline, progress=None, public_roots=None):
    from webtiles.stylesheet_build import prepare_bundles
    prepare_bundles(root, public_roots or {})
    previous = json.loads((root / MANIFEST).read_text()) if (root / MANIFEST).exists() else {'assets': {}}
    records, pending = {}, []
    paths = list(source_files(root))
    with tempfile.TemporaryDirectory(prefix='asset-encode-') as directory:
        temporary = Path(directory)
        for index, path in enumerate(paths):
            data = path.read_bytes()
            name = path.relative_to(root).as_posix()
            record = {'bytes': len(data), 'sha256': digest(data), 'recipe': RECIPE, 'variants': {}}
            old = previous.get('assets', {}).get(name, {})
            old_recipe = old.get('recipe', previous.get('recipe'))
            reusable = (old_recipe in (RECIPE, PREVIOUS_RECIPE) and old.get('sha256') == record['sha256']
                        and all(Path(str(path) + v['suffix']).is_file()
                                and digest(Path(str(path) + v['suffix']).read_bytes()) == v['sha256']
                                for v in old.get('variants', {}).values()))
            if reusable:
                record = {**old, 'recipe': RECIPE, 'variants': dict(old.get('variants', {}))}
                # The codecs are unchanged. Reuse verified v2 encodings, but
                # revisit PNGs previously rejected by the stricter threshold.
                if old_recipe == RECIPE or path.suffix.lower() != '.png' or 'png' in record['variants']:
                    records[name] = record
                    continue
                candidates = [png_representation(data, temporary)]
            else:
                candidates = encode(path, data, temporary, deadline)
            for kind, candidate, proof in candidates:
                encoded = candidate.read_bytes()
                if len(data) - len(encoded) < required_saving(kind, len(data)):
                    continue
                suffix = SUFFIXES[kind]
                target = Path(str(path) + suffix)
                existing = previous.get('assets', {}).get(name, {}).get('variants', {}).get(kind, {})
                if target.exists() and digest(target.read_bytes()) not in (existing.get('sha256'), digest(encoded)):
                    raise ValueError('Refusing to replace an unowned asset representation: ' + str(target))
                if digest(path.read_bytes()) != record['sha256']:
                    raise ValueError('Source changed during compression: ' + name)
                staging = temporary / ('pending-' + str(len(pending)))
                staging.write_bytes(encoded)
                pending.append((staging, target))
                record['variants'][kind] = {'suffix': suffix, 'bytes': len(encoded), 'sha256': digest(encoded), **proof}
            records[name] = record
            if progress and (index % 10 == 0 or index + 1 == len(paths)):
                atomic_json(progress, {'root': str(root), 'completed': index + 1, 'total': len(paths),
                                       'source_bytes_processed': sum(r['bytes'] for r in records.values())})
        if (set(source_files(root)) != set(paths)
                or any(digest(path.read_bytes()) != records[path.relative_to(root).as_posix()]['sha256'] for path in paths)):
            raise ValueError('Source drift before manifest publication')
        for staging, target in pending:
            adjacent = target.with_name(target.name + '.tmp')
            shutil.copyfile(staging, adjacent)
            adjacent.replace(target)
    manifest = {'version': 1, 'recipe': RECIPE, 'script_revision': revision(root), 'assets': records,
                'policy': {'image': 'PNG exact scanlines/chunks; opaque/binary-alpha WebP exact RGBA, ICC and orientation', 'text': 'Brotli 11 and gzip 9',
                           'minimum_saving_ratio': .05, 'png_maximum_required_saving_bytes': 64 * 1024,
                           'encoding': 'build-time only'}}
    atomic_json(root / MANIFEST, manifest)
    return manifest


def summary(root, manifest):
    records = list(manifest['assets'].values())
    total = sum(r['bytes'] for r in records)
    best = sum(min([r['bytes']] + [v['bytes'] for v in r['variants'].values()]) for r in records)
    return {'root': str(root), 'assets': len(records), 'original_bytes': total, 'best_transfer_bytes': best,
            'saved_bytes': total - best, 'saving_percent': round((total - best) / max(total, 1) * 100, 2),
            'representations': {kind: sum(kind in r['variants'] for r in records) for kind in SUFFIXES}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('roots', nargs='+', type=Path)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--deadline-seconds', type=int, default=900)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--progress', type=Path)
    parser.add_argument('--public-root', action='append', default=[], metavar='URL_PREFIX=PATH')
    args = parser.parse_args()
    deadline = time.monotonic() + args.deadline_seconds
    public_roots = {'/static/': Path(__file__).resolve().parents[1] / 'static'}
    for mapping in args.public_root:
        prefix, folder = mapping.split('=', 1)
        if not prefix.startswith('/') or not prefix.endswith('/'):
            parser.error('Public root prefixes must start and end with /')
        public_roots[prefix] = Path(folder).resolve()
    reports = []
    for root in args.roots:
        root = root.resolve()
        if args.check:
            errors = check(root, public_roots)
            reports.append({'root': str(root), 'passed': not errors, 'errors': errors})
        else:
            if not shutil.which('cwebp') or not shutil.which('brotli'):
                parser.error('cwebp and brotli are required to prepare assets; runtime does not need these tools')
            reports.append(summary(root, prepare(root, deadline, args.progress, public_roots)))
    result = {'reports': reports}
    if args.report:
        atomic_json(args.report, result)
    print(json.dumps(result))
    if args.check and any(not r['passed'] for r in reports):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
