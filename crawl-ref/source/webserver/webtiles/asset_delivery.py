"""Select verified, prebuilt asset representations without request-time encoding."""
from dataclasses import dataclass
from functools import lru_cache
import hashlib
import json
from pathlib import Path
from urllib.parse import quote

MANIFEST = 'asset-delivery.json'
SUFFIXES = {'webp': '.lossless.webp', 'png': '.lossless.png', 'br': '.br', 'gzip': '.gz'}


def preferences(header):
    result = {}
    for item in (header or '').lower().split(','):
        parts = [part.strip() for part in item.split(';')]
        if not parts[0]:
            continue
        quality = 1.0
        for parameter in parts[1:]:
            if parameter.startswith('q='):
                try:
                    quality = float(parameter[2:])
                    if not 0 <= quality <= 1:
                        quality = 0
                except ValueError:
                    quality = 0
        result[parts[0]] = min(result.get(parts[0], 1), quality)
    return result


def coding_quality(values, name):
    if name == 'identity':
        return values.get(name, 0 if values.get('*') == 0 else 1)
    return values.get(name, values.get('*', 0))


def media_quality(values, name):
    if not values:
        return 1
    return values.get(name, values.get(name.split('/')[0] + '/*', values.get('*/*', 0)))


def signature(path):
    stat = Path(path).stat()
    return str(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns


@lru_cache(maxsize=2048)
def _digests(filename, size, modified, changed):
    sha256, sha512 = hashlib.sha256(), hashlib.sha512()
    with open(filename, 'rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            sha256.update(chunk)
            sha512.update(chunk)
    return sha256.hexdigest(), sha512.hexdigest()


def digests(path):
    return _digests(*signature(Path(path)))


def versioned_url(root, relative, prefix):
    """Bind a public URL to its source bytes without exposing filesystem paths."""
    root = Path(root).resolve()
    path = (root / relative).resolve()
    path.relative_to(root)
    url = prefix.rstrip('/') + '/' + quote(relative, safe='/')
    try:
        return url + '?v=' + digests(path)[0]
    except OSError:
        return url


@lru_cache(maxsize=8)
def _manifest(filename, size, modified, changed):
    try:
        value = json.loads(Path(filename).read_text())
        if value.get('version') == 1 and isinstance(value.get('assets'), dict):
            return value
    except (OSError, ValueError, AttributeError):
        pass
    return {}


def read_manifest(root):
    try:
        return _manifest(*signature(Path(root) / MANIFEST))
    except OSError:
        return {}


@dataclass(frozen=True)
class Delivery:
    suffix: str = ''
    content_type: str = ''
    encoding: str = ''
    prepared: bool = False
    script_revision: str = ''


def select(root, source, mime, accept='', accept_encoding='', ranged=False):
    """Original URLs stay valid; manifests and variants fail safely to source."""
    root, source = Path(root).resolve(), Path(source).resolve()
    try:
        relative = source.relative_to(root).as_posix()
        manifest = _manifest(*signature(root / MANIFEST))
        record = manifest.get('assets', {}).get(relative, {})
        if not isinstance(record, dict) or record.get('sha256') != digests(source)[0]:
            return Delivery(content_type=mime)
    except (OSError, ValueError):
        return Delivery(content_type=mime)
    variants = record.get('variants', {})
    if not isinstance(variants, dict):
        variants = {}

    def available(name):
        variant = variants.get(name, {})
        if not isinstance(variant, dict) or variant.get('suffix') != SUFFIXES[name]:
            return False
        path = Path(str(source) + SUFFIXES[name])
        try:
            return (path.resolve().parent == source.parent and path.stat().st_size < source.stat().st_size
                    and variant.get('sha256') == digests(path)[0])
        except OSError:
            return False

    result = Delivery(content_type=mime, prepared=True,
                      script_revision=manifest.get('script_revision', ''))
    if ranged:
        return result
    media = preferences(accept)
    if (mime == 'image/png' and media.get('image/webp', 0) > 0
            and media['image/webp'] >= media_quality(media, mime) and available('webp')):
        return Delivery(SUFFIXES['webp'], 'image/webp', '', True, result.script_revision)
    if mime == 'image/png' and available('png'):
        return Delivery(SUFFIXES['png'], mime, '', True, result.script_revision)
    codings = preferences(accept_encoding)
    candidates = [(coding_quality(codings, name), -index, name)
                  for index, name in enumerate(('br', 'gzip'))
                  if coding_quality(codings, name) > 0 and available(name)]
    if candidates:
        quality, _, name = max(candidates)
        if codings.get('identity', 0) <= quality:
            return Delivery(SUFFIXES[name], mime, name, True, result.script_revision)
    return result
