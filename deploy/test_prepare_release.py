"""Frozen release identity, source drift, and state isolation contracts."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

import prepare_release


class ReleaseBundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / "source"
        self.root.mkdir()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        (self.root / "engine.cc").write_text("engine source\n")
        subprocess.run(["git", "-C", str(self.root), "add", "engine.cc"], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=ReleaseQA",
                        "-c", "user.email=qa@example.invalid", "commit", "-qm", "fixture"],
                       check=True)
        self.bundle = self.base / "bundle"

    def freeze(self):
        return prepare_release.create(self.root, self.bundle, "fixture")

    def test_bundle_includes_uncommitted_source_and_excludes_state(self):
        (self.root / "new.js").write_text("const value = 1;\n")
        (self.root / "saves").mkdir()
        (self.root / "saves/hero.cs").write_bytes(b"private-save")
        (self.root / ".env.production").write_text("PRIVATE=value")
        self.freeze()
        self.assertTrue(prepare_release.verify(self.bundle, self.root)["verified"])
        self.assertEqual(set(prepare_release.archive_manifest(self.bundle / "source.tar.gz")),
                         {"engine.cc", "new.js"})

    def test_bundle_omits_records_and_keeps_native_docs_and_ignored_runtime_art(self):
        # The release worktree force-adds the git-ignored art, as production does.
        pixels = b"licensed-atlas-pixels"
        sprites = "crawl-ref/source/webserver/static/ui-sprites/"
        atlas = sprites + "hud-sprites." + hashlib.sha256(pixels).hexdigest()[:12] + ".png"
        titles = [f"crawl-ref/source/webserver/static/title_{index:03}.png"
                  for index in range(1, 42)]
        game = ["crawl-ref/docs/crawl_manual.rst", "crawl-ref/source/webserver/games.d/base.yaml",
                prepare_release.package_source.HUD_MANIFEST]
        records = ["docs/deployment.md", "art-research/concept.png",
                   ".codex-right-sidebar-proof/source-7/note.txt", "docs/untracked-evidence.png"]
        for name in game + titles + records:
            (self.root / name).parent.mkdir(parents=True, exist_ok=True)
            (self.root / name).write_text(name)
        (self.root / prepare_release.package_source.HUD_MANIFEST).write_text(
            json.dumps({"file": Path(atlas).name}))
        (self.root / atlas).write_bytes(pixels)
        (self.root / ".gitignore").write_text(
            "/crawl-ref/source/webserver/static/title_*.png\n"
            "/crawl-ref/source/webserver/static/ui-sprites/hud-sprites.*.png\n")
        subprocess.run(["git", "-C", str(self.root), "add", ".gitignore", *game, *records[:3]],
                       check=True)
        subprocess.run(["git", "-C", str(self.root), "add", "-f", *titles], check=True)
        self.freeze()
        self.assertEqual(set(prepare_release.archive_manifest(self.bundle / "source.tar.gz")),
                         {"engine.cc", ".gitignore", atlas, *game, *titles})
        self.assertEqual(len(titles), 41)
        (self.root / "docs/deployment.md").write_text("later record edit\n")
        self.assertTrue(prepare_release.verify(self.bundle, self.root)["verified"])

    def test_bundle_frozen_with_records_stays_verifiable(self):
        (self.root / "docs").mkdir()
        (self.root / "docs/proof.txt").write_text("evidence\n")
        with mock.patch.object(prepare_release.package_source, "RECORD_ROOTS", ()):
            self.freeze()
        self.assertIn("docs/proof.txt",
                      prepare_release.archive_manifest(self.bundle / "source.tar.gz"))
        self.assertTrue(prepare_release.verify(self.bundle)["verified"])

    def test_verify_detects_edits_additions_and_removals(self):
        self.freeze()
        for action in ("edit", "add", "remove"):
            with self.subTest(action=action):
                (self.root / "engine.cc").write_text("engine source\n")
                (self.root / "new.cc").unlink(missing_ok=True)
                if action == "edit":
                    (self.root / "engine.cc").write_text("edited\n")
                elif action == "add":
                    (self.root / "new.cc").write_text("added\n")
                else:
                    (self.root / "engine.cc").unlink()
                with self.assertRaisesRegex(ValueError, "changed after freeze"):
                    prepare_release.verify(self.bundle, self.root)

    def test_corrupt_archive_fails_before_extraction(self):
        self.freeze()
        with (self.bundle / "source.tar.gz").open("ab") as stream:
            stream.write(b"changed")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            prepare_release.verify(self.bundle)

    def test_concurrent_edit_rejects_and_removes_partial_bundle(self):
        package = prepare_release.package_source.package

        def mutate(root, destination):
            package(root, destination)
            (root / "engine.cc").write_text("concurrent change\n")

        with mock.patch.object(prepare_release.package_source, "package", side_effect=mutate):
            with self.assertRaisesRegex(ValueError, "changed while packaging"):
                self.freeze()
        self.assertFalse(self.bundle.exists())
        self.assertEqual(list(self.base.glob(".dcss-release-*")), [])

    def test_archive_rejects_traversal_links_duplicates_and_state(self):
        for name, kind in (("../escape", tarfile.REGTYPE), ("link", tarfile.SYMTYPE),
                           ("saves/hero.cs", tarfile.REGTYPE), ("duplicate", tarfile.REGTYPE)):
            with self.subTest(name=name):
                path = self.base / "unsafe.tar.gz"
                with tarfile.open(path, "w:gz") as archive:
                    for _ in range(2 if name == "duplicate" else 1):
                        member = tarfile.TarInfo(name)
                        member.type = kind
                        archive.addfile(member, io.BytesIO())
                with self.assertRaisesRegex(ValueError, "Unsafe or duplicate"):
                    prepare_release.archive_manifest(path)

    def test_baseline_reports_removed_files(self):
        baseline = self.base / "baseline.json"
        baseline.write_text(json.dumps({"retired.js": hashlib.sha256(b"old").hexdigest()}))
        prepare_release.create(self.root, self.bundle, "fixture", baseline, "prior-release")
        changes = json.loads((self.bundle / "changes.json").read_text())
        self.assertEqual(changes["removed"], ["retired.js"])
        self.assertEqual(changes["added"], ["engine.cc"])
        self.assertEqual(changes["baseline"], "prior-release")

    def test_deployment_dry_run_uses_frozen_bundle_and_rejects_corruption(self):
        (self.root / "deploy").mkdir()
        (self.root / "deploy/gce_startup.sh").write_text("#!/bin/sh\nexit 0\n")
        self.freeze()
        archive = self.bundle / "source.tar.gz"
        original = archive.read_bytes()
        script = Path(__file__).resolve().parent.parent / "deploy_gcloud.sh"
        command = ["bash", str(script), "--project", "fixture-project", "--bundle",
                   str(self.bundle), "--dry-run"]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        self.assertIn(str(archive), result.stdout)
        self.assertIn("dcss-fixture.tar.gz", result.stdout)
        self.assertNotIn("Package tracked and new source", result.stdout)
        self.assertEqual(archive.read_bytes(), original)
        archive.write_bytes(original + b"corruption")
        rejected = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertNotIn("[dry-run]", rejected.stdout)


if __name__ == "__main__":
    unittest.main()
