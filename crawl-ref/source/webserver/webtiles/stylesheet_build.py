"""Filesystem adapter for deterministic, content-addressed CSS bundles."""
import hashlib
import json
from pathlib import Path
import posixpath
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit, urlunsplit
import tinycss2

from webtiles.css_bundle import UnsupportedStylesheet, compile_stylesheets
from webtiles.stylesheet_assets import CONFIG, DIRECTORY, INDEX, RECIPE, bundle_path, catalog, document, inputs_match, local_path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_if_changed(path, data):
    if path.exists() and path.read_bytes() == data:
        return
    temporary = Path(str(path) + '.tmp')
    temporary.write_bytes(data)
    temporary.replace(path)


def prepare_bundles(root, public_roots):
    root = Path(root).resolve()
    if not (root / CONFIG).exists():
        return
    roots = {'self': root, **{key: Path(path).resolve() for key, path in public_roots.items()}}
    previous = document(root / INDEX)
    records, skipped = {}, {}
    for name, sources in catalog(root).items():
        old = previous.get('bundles', {}).get(name, {})
        if (previous.get('recipe') == RECIPE and previous.get('parser') == tinycss2.__version__
                and old and inputs_match(old, root, public_roots)
                and (root / bundle_path(old)).is_file()
                and digest((root / bundle_path(old)).read_bytes()) == old.get('sha256')):
            records[name] = old
            continue
        inputs = {}

        def read(key):
            scope, relative = key
            path = local_path(roots[scope], relative)
            data = path.read_bytes()
            inputs[key] = {'scope': scope, 'path': relative, 'sha256': digest(data)}
            return data

        read(('self', CONFIG))

        def resolve(source, uri):
            parts = urlsplit(uri)
            if parts.scheme or parts.netloc or not parts.path:
                return None
            if parts.path.startswith('/'):
                for prefix in sorted(public_roots, key=len, reverse=True):
                    if parts.path.startswith(prefix):
                        relative = unquote(parts.path[len(prefix):])
                        local_path(roots[prefix], relative)
                        return prefix, relative
                return None
            scope, parent = source
            relative = posixpath.normpath(posixpath.join(posixpath.dirname(parent), unquote(parts.path)))
            local_path(roots[scope], relative)
            return scope, relative

        def imported(source, uri):
            target = resolve(source, uri)
            if target is None:
                raise UnsupportedStylesheet('Import is outside configured local roots')
            return target

        def resource(source, uri):
            target = resolve(source, uri)
            if target is None:
                return uri
            scope, relative = target
            parts = urlsplit(uri)
            path = local_path(roots[scope], relative)
            public = scope if scope != 'self' else next((prefix for prefix, mapped in roots.items()
                if prefix != 'self' and mapped == root), '')
            location = (public + quote(relative, safe='/')) if public else '../' + quote(relative, safe='/')
            query = parse_qsl(parts.query, keep_blank_values=True)
            if path.is_file():
                data = read(target)
                query = [(key, value) for key, value in query if key != 'v'] + [('v', digest(data))]
            else:
                inputs[target] = {'scope': scope, 'path': relative, 'missing': True}
            return urlunsplit(('', '', location, urlencode(query), quote(parts.fragment, safe='')))

        try:
            data = compile_stylesheets([('self', source) for source in sources], read, imported, resource)
            record = {'sha256': digest(data), 'bytes': len(data), 'inputs': [inputs[key] for key in sorted(inputs)]}
            if not inputs_match(record, root, public_roots):
                raise ValueError('Stylesheet inputs changed before publication')
            output = root / bundle_path(record)
            output.parent.mkdir(parents=True, exist_ok=True)
            if output.exists() and output.read_bytes() != data:
                raise ValueError('Preserving a different existing stylesheet bundle')
            write_if_changed(output, data)
            records[name] = record
        except (UnsupportedStylesheet, OSError, ValueError) as error:
            skipped[name] = str(error) if isinstance(error, UnsupportedStylesheet) else 'Local stylesheet input unavailable, unsafe, or changed'
    index = {'version': 1, 'recipe': RECIPE, 'parser': tinycss2.__version__, 'bundles': records, 'skipped': skipped}
    write_if_changed(root / INDEX, (json.dumps(index, sort_keys=True, indent=2) + '\n').encode())
