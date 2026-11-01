"""Runtime selection of prepared stylesheets; no CSS parser or compiler required."""
from functools import lru_cache
import json
import os.path
from pathlib import Path
import re

from webtiles.asset_delivery import digests, read_manifest, signature, versioned_url

CONFIG = 'stylesheet-bundles.json'
INDEX = 'stylesheet-bundle-index.json'
DIRECTORY = '.css-bundles'
RECIPE = 'ordered-css-imports-compact-v3'


@lru_cache(maxsize=16)
def _json(filename, size, modified, changed):
    try:
        value = json.loads(Path(filename).read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def document(path):
    try:
        return _json(*signature(path))
    except OSError:
        return {}


def local_path(root, relative):
    root = Path(root).resolve()
    path = Path(os.path.abspath(root / relative))
    path.relative_to(root)
    if path.resolve() != path:
        raise ValueError('Stylesheet inputs cannot traverse symlinks')
    return path


def catalog(root):
    value = document(Path(root) / CONFIG)
    entries = value.get('entries')
    if value.get('version') != 1 or not isinstance(entries, dict):
        raise ValueError('Missing or invalid stylesheet source catalog: ' + str(root))
    for sources in entries.values():
        if not isinstance(sources, list) or not sources:
            raise ValueError('Empty stylesheet entry')
        for source in sources:
            if not isinstance(source, str) or not source.endswith('.css') or Path(source).is_absolute():
                raise ValueError('Invalid stylesheet source')
            (Path(root).resolve() / source).resolve().relative_to(Path(root).resolve())
    return entries


def bundle_path(record):
    token = record.get('sha256', '') if isinstance(record, dict) else ''
    if not isinstance(token, str) or not re.fullmatch('[0-9a-f]{64}', token):
        raise ValueError('Invalid stylesheet bundle hash')
    return DIRECTORY + '/' + token + '.css'


def inputs_match(record, root, public_roots):
    inputs = record.get('inputs', [])
    if not isinstance(inputs, list) or not inputs:
        return False
    try:
        for item in inputs:
            scope = Path(root) if item['scope'] == 'self' else public_roots[item['scope']]
            path = local_path(scope, item['path'])
            if item.get('missing'):
                if path.exists():
                    return False
                continue
            if digests(path)[0] != item['sha256']:
                return False
    except (KeyError, OSError, ValueError, TypeError):
        return False
    return True


def prepared_bundle(root, name, public_roots):
    index = document(Path(root) / INDEX)
    if index.get('recipe') != RECIPE:
        return None
    bundles = index.get('bundles', {})
    record = bundles.get(name) if isinstance(bundles, dict) else None
    if not isinstance(record, dict) or not inputs_match(record, root, public_roots):
        return None
    try:
        relative = bundle_path(record)
        path = local_path(root, relative)
        prepared = read_manifest(root).get('assets', {}).get(relative, {})
        if not isinstance(prepared, dict) or prepared.get('sha256') != record['sha256'] or digests(path)[0] != record['sha256']:
            return None
        if path.stat().st_size != record['bytes']:
            return None
        return relative
    except (OSError, KeyError, ValueError):
        return None


def stylesheet_urls(root, name, prefix, public_roots, allow_bundle=True, bundle_prefix=None):
    sources = catalog(root)[name]
    prepared = prepared_bundle(root, name, public_roots) if allow_bundle else None
    if prepared:
        return [versioned_url(root, prepared, bundle_prefix or prefix)]
    return [versioned_url(root, path, prefix) for path in sources]


def active_bundles(root):
    result = set()
    bundles = document(Path(root) / INDEX).get('bundles', {})
    for record in (bundles.values() if isinstance(bundles, dict) else []):
        try:
            result.add(bundle_path(record))
        except ValueError:
            pass
    return result
