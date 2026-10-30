"""Deployment boundaries and recovery from an open SQLite WAL database."""
import contextlib
import importlib.util
import io
import hashlib
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import tarfile
import unittest
from unittest import mock
import uuid


def module(name):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name(name + ".py"))
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


class DeploymentTests(unittest.TestCase):
    def test_existing_save_alias_is_normalized_without_moving_packages(self):
        migrate = module("migrate_library_paths").migrate
        with tempfile.TemporaryDirectory() as location:
            base = pathlib.Path(location)
            root = base / "state/rcs/library"
            identifier = str(uuid.uuid4())
            saved = root / "saves" / identifier
            saved.mkdir(parents=True)
            (saved / "hero.cs").write_bytes(b"native-package")
            release = base / "old-release"
            release.mkdir()
            (release / "rcs").symlink_to(base / "state/rcs", target_is_directory=True)
            previous = release / "rcs/library/saves" / identifier
            with contextlib.closing(sqlite3.connect(root / "index.sqlite")) as database:
                database.execute("CREATE TABLE games(id TEXT, save_dir TEXT)")
                database.execute("INSERT INTO games VALUES (?,?)", (identifier, str(previous)))
                database.commit()
            self.assertEqual(migrate(root), 1)
            self.assertEqual(migrate(root), 0)
            self.assertEqual((saved / "hero.cs").read_bytes(), b"native-package")
            with contextlib.closing(sqlite3.connect(root / "index.sqlite")) as database:
                self.assertEqual(database.execute("SELECT save_dir FROM games").fetchone(), (str(saved.resolve()),))

    def test_library_paths_can_be_independent_of_application_release(self):
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location) / "persistent/library"
            webserver = pathlib.Path(__file__).resolve().parent.parent / "crawl-ref/source/webserver"
            code = "import sys,json; sys.path.insert(0,sys.argv[1]); from webtiles import game_library; print(json.dumps(game_library.create_game('DeploymentQA','solo')))"
            environment = dict(os.environ, CRAWL_LIBRARY_DIR=str(root))
            game = json.loads(subprocess.check_output([sys.executable, "-c", code, str(webserver)], env=environment))
            self.assertEqual(pathlib.Path(game["save_dir"]), root / "saves" / game["id"])
            self.assertTrue((root / "index.sqlite").is_file())

    def test_source_keeps_new_code_and_excludes_local_state(self):
        include = module("package_source").include
        for source in ("crawl-ref/source/party.cc", "crawl-ref/source/webserver/games.d/base.yaml",
                       "crawl-ref/source/webserver/static/tabletop/assets/book.png"):
            self.assertTrue(include(source), source)
        for local in (".env.production", ".claude/settings.local.json", ".git/config",
                      "rcs/status", "saves/db/descriptions.lk", "saves/hero.cs",
                      "morgue/hero.txt", "crawl-ref/source/rcs/library/index.sqlite",
                      "crawl-ref/source/saves/hero.cs", "crawl-ref/source/party.o",
                      "crawl-ref/source/crawl", "crawl-ref/source/init.txt",
                      "crawl-ref/source/webserver/passwd.db3",
                      "crawl-ref/source/webserver/config.yml"):
            self.assertFalse(include(local), local)

    def test_package_includes_ignored_runtime_atlas_without_private_sources(self):
        package = module("package_source")
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location)
            manifest = root / package.HUD_MANIFEST
            manifest.parent.mkdir(parents=True)
            pixels = b"runtime-atlas-pixels"
            filename = "hud-sprites." + hashlib.sha256(pixels).hexdigest()[:12] + ".png"
            manifest.write_text(json.dumps({"file": filename}))
            (manifest.parent / filename).write_bytes(pixels)
            (root / "private-purchased-pack.zip").write_bytes(b"private-source")
            destination = root / "release.tar.gz"
            with mock.patch.object(package.subprocess, "check_output", return_value=(package.HUD_MANIFEST + "\0").encode()):
                with contextlib.redirect_stdout(io.StringIO()):
                    package.package(root, destination)
            with tarfile.open(destination) as archive:
                self.assertEqual(set(archive.getnames()), {package.HUD_MANIFEST, str(pathlib.PurePosixPath(package.HUD_MANIFEST).parent / filename)})

    def test_runtime_atlas_rejects_missing_changed_and_escaping_files(self):
        package = module("package_source")
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location)
            manifest = root / package.HUD_MANIFEST
            manifest.parent.mkdir(parents=True)
            for filename in ("../private.png", "hud-sprites.000000000000.png"):
                manifest.write_text(json.dumps({"file": filename}))
                with self.assertRaises((ValueError, FileNotFoundError)):
                    package.runtime_assets(root)
            (manifest.parent / filename).write_bytes(b"changed-pixels")
            with self.assertRaisesRegex(ValueError, "content"):
                package.runtime_assets(root)

    def test_package_includes_catalog_images_even_when_git_ignores_them(self):
        package = module("package_source")
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location)
            catalog = root / package.CHARACTER_CATALOG
            catalog.parent.mkdir(parents=True)
            pixels = b"\x89PNG\r\n\x1a\nplayer-pixels"
            filename = "protean-" + hashlib.sha256(pixels).hexdigest()[:12] + ".png"
            url = "/static/player-tiles/" + filename
            catalog.write_text('define(function () { return {"tile": {"src": "' + url + '"}}; });')
            image = root / "crawl-ref/source/webserver" / url.lstrip("/")
            image.parent.mkdir(parents=True)
            image.write_bytes(pixels)
            destination = root / "release.tar.gz"
            with mock.patch.object(package.subprocess, "check_output", return_value=(package.CHARACTER_CATALOG + "\0").encode()):
                with contextlib.redirect_stdout(io.StringIO()):
                    package.package(root, destination)
            with tarfile.open(destination) as archive:
                self.assertEqual(set(archive.getnames()),
                                 {package.CHARACTER_CATALOG, image.relative_to(root).as_posix()})
            image.unlink()
            with self.assertRaises(FileNotFoundError):
                package.runtime_assets(root)
            image.write_bytes(pixels + b"changed")
            with self.assertRaisesRegex(ValueError, "content does not match"):
                package.character_assets(root)

    def test_catalog_images_reject_escaping_urls_symlinks_and_non_png_data(self):
        package = module("package_source")
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location)
            catalog = root / package.CHARACTER_CATALOG
            catalog.parent.mkdir(parents=True)
            for url in ("/static/player-tiles/../secret.png", "/static/player-tiles/bad.png"):
                catalog.write_text(json.dumps({"src": url}))
                with self.assertRaisesRegex(ValueError, "Invalid player image URL"):
                    package.character_assets(root)
            data = b"not-an-image"
            url = "/static/player-tiles/hero-" + hashlib.sha256(data).hexdigest()[:12] + ".png"
            catalog.write_text(json.dumps({"src": url}))
            image = root / "crawl-ref/source/webserver" / url.lstrip("/")
            image.parent.mkdir(parents=True)
            image.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "not a PNG"):
                package.character_assets(root)
            image.unlink()
            image.symlink_to(catalog)
            with self.assertRaisesRegex(ValueError, "regular source file"):
                package.character_assets(root)

    def test_recovery_preserves_committed_wal_rows_and_nested_library(self):
        recovery = module("recovery_copy")
        with tempfile.TemporaryDirectory() as location:
            root = pathlib.Path(location)
            library = root / "rcs/library"
            library.mkdir(parents=True)
            with contextlib.closing(sqlite3.connect(root / "accounts.db3")) as account:
                account.execute("PRAGMA journal_mode=WAL")
                account.execute("CREATE TABLE proof(value TEXT)")
                account.execute("INSERT INTO proof VALUES ('saved')")
                account.commit()
                with contextlib.closing(sqlite3.connect(library / "index.sqlite")) as index:
                    index.execute("CREATE TABLE expeditions(id TEXT)")
                    index.execute("INSERT INTO expeditions VALUES ('stable-id')")
                    index.commit()
                with contextlib.redirect_stdout(io.StringIO()):
                    recovery.copy_databases(root)
                    recovery.copy_databases(root)
            manifest = json.loads((root / "recovery/manifest.json").read_text())
            self.assertEqual(manifest["databases"], ["accounts.db3", "rcs/library/index.sqlite"])
            for relative, table, expected in (("accounts.db3", "proof", "saved"),
                                              ("rcs/library/index.sqlite", "expeditions", "stable-id")):
                with contextlib.closing(sqlite3.connect(root / "recovery/sqlite" / relative)) as restored:
                    self.assertEqual(restored.execute("PRAGMA integrity_check").fetchone(), ("ok",))
                    self.assertEqual(restored.execute("SELECT * FROM " + table).fetchone(), (expected,))


if __name__ == "__main__":
    unittest.main()
