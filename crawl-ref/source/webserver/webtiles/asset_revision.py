"""Content versions for independently released browser code and styles."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path


@lru_cache(maxsize=2)
def _digest(signature):
    digest = sha256()
    for filename, relative, _, _ in signature:
        path = Path(filename)
        digest.update(relative.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:20]


def revision(root):
    """Reuse hashes until a source changes; include new and removed files."""
    signature = []
    for path in sorted(Path(root).rglob("*")):
        if path.is_file() and path.suffix in {".js", ".css"}:
            stat = path.stat()
            signature.append((str(path), str(path.relative_to(root)), stat.st_size, stat.st_mtime_ns))
    return _digest(tuple(signature))
