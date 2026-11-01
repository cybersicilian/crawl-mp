"""Content versions for independently released browser code and styles."""
from functools import lru_cache
from hashlib import sha1, sha256
from pathlib import Path
from dataclasses import dataclass
from webtiles.stylesheet_assets import DIRECTORY, INDEX


@lru_cache(maxsize=8)
def _digest(signature):
    digest = sha256()
    for filename, relative, *_ in signature:
        path = Path(filename)
        name, data = relative.encode(), path.read_bytes()
        digest.update(len(name).to_bytes(8, 'big'))
        digest.update(name)
        digest.update(len(data).to_bytes(8, 'big'))
        digest.update(data)
    return digest.hexdigest()[:20]


def revision(root):
    """Reuse hashes until a source changes; include new and removed files."""
    signature = []
    for path in sorted(Path(root).rglob("*")):
        if DIRECTORY in path.relative_to(root).parts:
            continue
        if path.is_file() and (path.suffix in {".js", ".css"} or path == Path(root) / INDEX):
            stat = path.stat()
            signature.append((str(path), path.relative_to(root).as_posix(), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
    return _digest(tuple(signature))


@dataclass(frozen=True)
class AssetVersions:
    base: str
    content: str
    scripts: str


def versions(identity: bytes, root) -> AssetVersions:
    """Keep stable media URLs while scripts/styles get their own content identity."""
    scripts = revision(root)
    # Preserve the existing build identity for independently hashed media URLs.
    base = sha1(identity).hexdigest()
    content = sha256(b'web-assets\0' + len(identity).to_bytes(8, 'big') + identity + scripts.encode()).hexdigest()[:40]
    return AssetVersions(base, content, scripts)
