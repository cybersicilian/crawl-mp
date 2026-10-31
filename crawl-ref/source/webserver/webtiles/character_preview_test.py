import asyncio
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys

from webtiles.character_preview import Build, PreviewService, ensure_seed
from webtiles import starting_weapons


class BuildTests(unittest.TestCase):
    def values(self, **changes):
        return {"species": "Minotaur", "job": "Fighter", "weapon": "war axe",
                "seed": "12345", "name": "Aldric", "role": "leader", **changes}

    def test_native_choices_and_input_boundaries(self):
        build = Build.parse(self.values())
        self.assertEqual(build.token(), "Aldric:Minotaur/Fighter/war axe/12345")
        for changes in ({"weapon": "not a weapon"}, {"seed": "0"}, {"seed": str(2**53)},
                        {"name": "Hero:Human/Fighter"}, {"role": "spectator"}, {"species": "Vampire"},
                        {"modifiers": "unknown"}):
            with self.assertRaises(ValueError):
                Build.parse(self.values(**changes))

    def test_alias_fixed_kit_and_felid(self):
        alias = Build.parse(self.values(species="Djinn", job="Conjurer", weapon=""))
        self.assertEqual(alias.species, "Djinni")
        felid = Build.parse(self.values(species="Felid", job="Fighter", weapon="unarmed"))
        self.assertEqual(felid.weapon, "unarmed")
        self.assertEqual(Build.parse(self.values(modifiers="shared_ladle,fast_boil,fast_boil")).modifiers,
                         ("fast_boil", "shared_ladle"))

    def test_multiplayer_mode_is_explicit_and_validated(self):
        self.assertFalse(Build.parse(self.values()).multiplayer)
        self.assertTrue(Build.parse(self.values(multiplayer="true")).multiplayer)
        self.assertFalse(Build.parse(self.values(multiplayer="false")).multiplayer)
        with self.assertRaisesRegex(ValueError, "Invalid multiplayer"):
            Build.parse(self.values(multiplayer="yes"))

    def test_trait_is_validated_and_carried_to_native_preview(self):
        entry = starting_weapons.WEAPONS["Minotaur"]["Fighter"]
        with patch.dict(entry, {"trait_restrictions": {"mummy": "", "ghost": "unavailable"}}):
            self.assertTrue(Build.parse(self.values(trait="mummy")).token().endswith("/mummy"))
            with self.assertRaisesRegex(ValueError, "unavailable"):
                Build.parse(self.values(trait="ghost"))
            with self.assertRaisesRegex(ValueError, "Unknown character trait"):
                Build.parse(self.values(trait="vampire"))

    def test_roll_is_stable_and_carried_into_launch(self):
        slot = {"hero_name": "Hero", "species": "Minotaur", "job": "Fighter", "weapon": "trident"}
        ensure_seed(slot)
        seed = slot["starting_seed"]
        slot["weapon"] = "flail"
        ensure_seed(slot)
        self.assertEqual(seed, slot["starting_seed"])
        self.assertTrue(starting_weapons.member_spec(slot).endswith("/flail/" + str(seed)))


class CacheTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.binary = root / "crawl"
        self.atlas = root / "player.png"
        self.binary.write_bytes(b"native version one")
        self.atlas.write_bytes(b"native atlas one")
        self.build = Build("Minotaur", "Fighter", "war axe", 12345, "Hero")

    async def test_concurrent_consumers_share_one_native_run(self):
        calls = []
        async def runner(build):
            calls.append(build)
            await asyncio.sleep(0.01)
            return {"hp": 19}
        service = PreviewService(self.binary, self.atlas, runner)
        first, second = await asyncio.gather(service.snapshot(self.build), service.snapshot(self.build))
        self.assertEqual(len(calls), 1)
        self.assertEqual(first, second)
        self.assertTrue(first["atlas"]["src"].startswith("/api/character-preview/atlas/"))

    async def test_mode_is_part_of_the_native_preview_cache_identity(self):
        calls = []
        async def runner(build):
            calls.append(build.multiplayer)
            return {"hp": 19}
        service = PreviewService(self.binary, self.atlas, runner)
        await service.snapshot(self.build)
        multiplayer = Build("Minotaur", "Fighter", "war axe", 12345, "Hero", multiplayer=True)
        await service.snapshot(multiplayer)
        self.assertEqual(calls, [False, True])

    async def test_failure_can_retry_and_binary_change_invalidates(self):
        calls = 0
        async def runner(build):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("temporary failure")
            return {"hp": calls}
        service = PreviewService(self.binary, self.atlas, runner)
        with self.assertRaises(RuntimeError):
            await service.snapshot(self.build)
        self.assertEqual((await service.snapshot(self.build))["hp"], 2)
        self.binary.write_bytes(b"different native executable")
        self.assertEqual((await service.snapshot(self.build))["hp"], 3)

    async def test_cancelled_reader_does_not_cancel_shared_creation(self):
        started, finish = asyncio.Event(), asyncio.Event()
        async def runner(build):
            started.set()
            await finish.wait()
            return {"hp": 19}
        service = PreviewService(self.binary, self.atlas, runner)
        reader = asyncio.create_task(service.snapshot(self.build))
        await started.wait()
        reader.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await reader
        finish.set()
        self.assertEqual((await service.snapshot(self.build))["hp"], 19)
        await asyncio.sleep(0)
        self.assertEqual(service.pending, {})

    async def test_outdated_inflight_result_is_not_cached(self):
        started, finish = asyncio.Event(), asyncio.Event()
        async def runner(build):
            started.set()
            await finish.wait()
            return {"hp": 19}
        service = PreviewService(self.binary, self.atlas, runner)
        reader = asyncio.create_task(service.snapshot(self.build))
        await started.wait()
        self.binary.write_bytes(b"native version changed while working")
        finish.set()
        with self.assertRaises(RuntimeError):
            await reader
        self.assertEqual(service.cache, {})


class NativeProcessTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_only_release_uses_disposable_scratch_and_explicit_game_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / "crawl"
            binary.write_text("#!" + sys.executable + "\n" +
                "import json,sys\nfrom pathlib import Path\n"
                "data = Path(sys.argv[sys.argv.index('-dir') + 1])\n"
                "save = sys.argv[sys.argv.index('-extra-opt-last') + 1].removeprefix('save_dir=')\n"
                "assert Path(save).resolve() == Path.cwd()\n"
                "Path('native-scratch').write_text('temporary package')\n"
                "print(json.dumps({'version': 1, 'members': [{'hp': 19, "
                "'spec': sys.argv[-1], 'scratch': str(Path.cwd()), 'asset': (data / 'game-data').read_text()}]}))\n")
            binary.chmod(0o555)
            (root / "game-data").write_text("native assets")
            root.chmod(0o555)
            try:
                service = PreviewService(binary, root / "atlas.png")
                result = await service._run(Build("Minotaur", "Fighter", "war axe", 12345, "Hero"))
                self.assertEqual(result["hp"], 19)
                self.assertEqual(result["asset"], "native assets")
                self.assertFalse((root / "native-scratch").exists())
                self.assertFalse(Path(result["scratch"]).exists())
            finally:
                root.chmod(0o700)


if __name__ == "__main__":
    unittest.main()
