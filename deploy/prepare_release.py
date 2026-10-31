#!/usr/bin/env python3
"""Freeze working source into a verifiable bundle without deploying it."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile

import package_source


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def source_manifest(root):
    root = root.resolve()
    result = {}
    for name in package_source.source_names(root):
        path = root / name
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise ValueError("Source symlink requires explicit review: " + name)
        result[name] = digest(path)
    return result


def archive_manifest(path):
    result = {}
    with tarfile.open(path, "r|gz") as archive:
        for member in archive:
            name = PurePosixPath(member.name)
            if (not member.isfile() or name.is_absolute() or ".." in name.parts
                    or member.name in result or not package_source.include(member.name)):
                raise ValueError("Unsafe or duplicate archive member: " + member.name)
            with archive.extractfile(member) as stream:
                result[member.name] = hashlib.file_digest(stream, "sha256").hexdigest()
    return result


def difference(previous, current):
    return {
        "added": sorted(set(current) - set(previous)),
        "changed": sorted(name for name in set(previous) & set(current)
                          if previous[name] != current[name]),
        "removed": sorted(set(previous) - set(current)),
    }


def verify(bundle, source=None):
    metadata = json.loads((bundle / "release.json").read_text())
    if metadata["format_version"] != 1:
        raise ValueError("Unsupported bundle format")
    for name in ("source.tar.gz", "manifest.json", "changes.json"):
        if digest(bundle / name) != metadata["sha256"][name]:
            raise ValueError("Bundle checksum mismatch: " + name)
    manifest = json.loads((bundle / "manifest.json").read_text())
    if archive_manifest(bundle / "source.tar.gz") != manifest:
        raise ValueError("Archive does not match the source manifest")
    if source:
        drift = difference(manifest, source_manifest(source))
        if any(drift.values()):
            raise ValueError("Working source changed after freeze: " + json.dumps(drift))
    return {"release_id": metadata["release_id"], "files": len(manifest),
            "archive_sha256": metadata["sha256"]["source.tar.gz"],
            "working_source_checked": source is not None, "verified": True}


def create(root, destination, release_id, baseline=None, baseline_label=None):
    root, destination = root.resolve(), destination.resolve()
    if destination.exists():
        raise ValueError("Bundle destination already exists")
    if destination.is_relative_to(root):
        raise ValueError("Place release bundles outside the source tree")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".dcss-release-", dir=destination.parent))
    try:
        before = source_manifest(root)
        package_source.package(root, temporary / "source.tar.gz")
        frozen = archive_manifest(temporary / "source.tar.gz")
        if before != frozen or frozen != source_manifest(root):
            raise ValueError("Working source changed while packaging; retry after edits finish")
        write_json(temporary / "manifest.json", frozen)
        previous = json.loads(baseline.read_text()) if baseline else {}
        changes = {"baseline": baseline_label, "baseline_manifest_sha256":
                   digest(baseline) if baseline else None, **difference(previous, frozen)}
        write_json(temporary / "changes.json", changes)
        (temporary / "working-tree.txt").write_bytes(subprocess.check_output(
            ["git", "-C", str(root), "status", "--short", "--untracked-files=all"]))
        metadata = {
            "format_version": 1, "release_id": release_id,
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "source_commit": subprocess.check_output(
                ["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(),
            "source_files": len(frozen), "deployed": False,
            "validation": "See validation.json; Linux build and activation are separate.",
            "sha256": {name: digest(temporary / name)
                       for name in ("source.tar.gz", "manifest.json", "changes.json")},
        }
        write_json(temporary / "release.json", metadata)
        (temporary / "SHA256SUMS").write_text("".join(
            f"{digest(temporary / name)}  {name}\n"
            for name in ("source.tar.gz", "manifest.json", "changes.json", "release.json")))
        verify(temporary, root)
        temporary.rename(destination)
        return metadata
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    freeze = commands.add_parser("create", help="Freeze tracked and new source")
    freeze.add_argument("source", type=Path)
    freeze.add_argument("bundle", type=Path)
    freeze.add_argument("--release-id", default=datetime.now(timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ-webview"))
    freeze.add_argument("--baseline-manifest", type=Path)
    freeze.add_argument("--baseline-label")
    check = commands.add_parser("verify", help="Verify archive, hashes, and optional source drift")
    check.add_argument("bundle", type=Path)
    check.add_argument("--source", type=Path)
    args = parser.parse_args()
    if args.command == "create":
        result = create(args.source.resolve(), args.bundle.resolve(), args.release_id,
                        args.baseline_manifest, args.baseline_label)
    else:
        result = verify(args.bundle.resolve(), args.source.resolve() if args.source else None)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
