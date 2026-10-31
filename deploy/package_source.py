#!/usr/bin/env python3
"""Package working source without credentials, saves, or host build output."""
import pathlib
import hashlib
import json
import re
import subprocess
import sys
import tarfile

EXCLUDED_PARTS = {".git", ".venv", "node_modules", "__pycache__", ".codex", ".agents", ".claude"}
EXCLUDED_SUFFIXES = {".o", ".d", ".a", ".so", ".dylib", ".pyc", ".db3", ".db", ".sqlite", ".sqlite3", ".log", ".tmp"}
STATE_ROOTS = ("rcs/", "saves/", "morgue/", "crawl-ref/source/rcs/", "crawl-ref/source/saves/", "crawl-ref/source/morgue/", "crawl-ref/source/webserver/run/")
HUD_MANIFEST = "crawl-ref/source/webserver/static/ui-sprites/hud-sprites.json"


def include(name):
    path = pathlib.PurePosixPath(name)
    return (not EXCLUDED_PARTS.intersection(path.parts)
            and path.suffix not in EXCLUDED_SUFFIXES
            and not any(part.startswith(".env") for part in path.parts)
            and not name.startswith(STATE_ROOTS)
            and name not in {"crawl-ref/source/crawl", "crawl-ref/source/init.txt", "crawl-ref/source/webserver/config.yml", "crawl-ref/source/webserver/debug-config.yml"})


def runtime_assets(root):
    """Include the declared runtime overlay without packaging private art sources."""
    manifest = root / HUD_MANIFEST
    if not manifest.is_file():
        return []
    filename = json.loads(manifest.read_text())["file"]
    match = re.fullmatch(r"hud-sprites\.([a-f0-9]{12})\.png", filename)
    if not match:
        raise ValueError("Invalid HUD runtime atlas filename")
    asset = manifest.parent / filename
    if asset.is_symlink():
        raise ValueError("Runtime atlas must be a regular source file")
    if hashlib.sha256(asset.read_bytes()).hexdigest()[:12] != match[1]:
        raise ValueError("HUD runtime atlas content does not match its filename")
    return [asset.relative_to(root).as_posix()]


def source_names(root):
    """Select the same working source for packaging and subsequent drift checks."""
    names = subprocess.check_output(["git", "-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard"]).decode().split("\0")
    names.extend(runtime_assets(root))
    return sorted(name for name in set(filter(None, names))
                  if include(name) and (root / name).is_file())


def package(root, destination):
    count = 0
    with tarfile.open(destination, "w:gz") as archive:
        for name in source_names(root):
            path = root / name
            if path.is_symlink():
                raise ValueError("Source symlink requires explicit review: " + name)
            archive.add(path, arcname=name, recursive=False)
            count += 1
    print(f"Packaged {count} source files ({destination.stat().st_size:,} bytes).")


if __name__ == "__main__":
    package(pathlib.Path(sys.argv[1]).resolve(), pathlib.Path(sys.argv[2]))
