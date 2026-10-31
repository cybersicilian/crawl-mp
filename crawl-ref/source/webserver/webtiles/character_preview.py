"""Bounded, read-only inspection of real native character creation."""
import asyncio
from collections import OrderedDict
from dataclasses import dataclass
from hashlib import sha256
import json
import os
from pathlib import Path
import secrets
import tempfile

from webtiles import starting_weapons


def ensure_seed(slot):
    if type(slot.get("starting_seed")) is not int or not 0 < slot["starting_seed"] < 2**53:
        slot["starting_seed"] = secrets.randbelow(2**53 - 1) + 1


@dataclass(frozen=True)
class Build:
    species: str
    job: str
    weapon: str
    seed: int
    name: str
    companion: bool = False
    modifiers: tuple = ()
    multiplayer: bool = False
    trait: str = "none"

    @classmethod
    def parse(cls, values):
        species = values.get("species", "")
        if species == "Djinn":
            species = "Djinni"
        job = values.get("job", "")
        entry = starting_weapons.WEAPONS.get(species, {}).get(job)
        if entry is None:
            raise ValueError("Unknown starting species or background")
        weapon = values.get("weapon", "")
        if weapon not in entry["choices"] and (weapon or entry["choices"]):
            raise ValueError("Unavailable starting weapon")
        seed_text = str(values.get("seed", ""))
        if not seed_text.isascii() or not seed_text.isdigit() or not 0 < int(seed_text) < 2**53:
            raise ValueError("Invalid starting roll")
        name = values.get("name", "Hero")
        if not isinstance(name, str) or not name.strip() or len(name) > 20 or any(c in name for c in ",:/\r\n\t"):
            raise ValueError("Invalid hero name")
        role = values.get("role", "leader")
        if role not in ("leader", "companion"):
            raise ValueError("Invalid party role")
        modifiers = tuple(sorted(set(filter(None, values.get("modifiers", "").split(",")))))
        if any(value not in ("fast_boil", "shared_ladle", "heavy_pebbles") for value in modifiers):
            raise ValueError("Unknown run modifier")
        mode = values.get("multiplayer", "false")
        if mode not in ("true", "false"):
            raise ValueError("Invalid multiplayer mode")
        trait = values.get("trait", "none")
        error = starting_weapons.trait_error({"species": species, "job": job, "trait": trait})
        if error:
            raise ValueError(error)
        return cls(species, job, weapon, int(seed_text), name, role == "companion", modifiers,
                   multiplayer=mode == "true", trait=trait)

    def token(self):
        token = "%s:%s/%s/%s/%d" % (self.name, self.species, self.job, self.weapon or "unarmed", self.seed)
        return token if self.trait == "none" else token + "/" + self.trait


class PreviewService:
    def __init__(self, binary, atlas, runner=None):
        self.binary = Path(binary).resolve()
        self.atlas = Path(atlas).resolve()
        self.runner = runner or self._run
        self.cache = OrderedDict()
        self.pending = {}
        self.limit = asyncio.Semaphore(2)
        self.atlases = OrderedDict()

    def signature(self):
        def stamp(path):
            stat = path.stat()
            return (stat.st_mtime_ns, stat.st_size)
        return stamp(self.binary), stamp(self.atlas)

    def atlas_asset(self):
        data = self.atlas.read_bytes()
        digest = sha256(data).hexdigest()[:24]
        self.atlases[digest] = data
        while len(self.atlases) > 4:
            self.atlases.popitem(last=False)
        return {"src": "/api/character-preview/atlas/" + digest + ".png"}

    async def _run(self, build):
        token = build.token()
        tokens = [str(2 if build.companion else 1)] + ["seasoning=" + value for value in build.modifiers]
        if build.multiplayer:
            tokens.append("mp=on")
        if build.companion:
            tokens.append("PreviewHost:Human/Fighter/unarmed/1")
        spec = ",".join(tokens + [token])
        # The engine's no-save package uses an unlinked scratch file in its CWD.
        # Installed releases stay read-only; game data still uses explicit -dir.
        with tempfile.TemporaryDirectory(prefix="dcss-character-preview-") as scratch:
            process = await asyncio.create_subprocess_exec(
                str(self.binary), "-dir", str(self.binary.parent), "-rc", os.devnull,
                "-extra-opt-last", "save_dir=" + scratch, "-character-preview-json", spec,
                cwd=scratch, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "LC_ALL": "en_US.UTF-8"})
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=20)
            except BaseException:
                if process.returncode is None:
                    process.kill()
                await process.communicate()
                raise
        if process.returncode or len(stdout) > 1_000_000:
            raise RuntimeError("Native character preview could not be created")
        try:
            payload = json.loads(stdout)
        except (ValueError, UnicodeError) as error:
            raise RuntimeError("Invalid native character preview") from error
        if payload.get("version") != 1:
            raise RuntimeError("Unsupported native character preview")
        members = payload.get("members", [])
        slot = 1 if build.companion else 0
        if len(members) <= slot:
            raise RuntimeError("Incomplete native character preview")
        return members[slot]

    async def snapshot(self, build):
        key = (self.signature(), build)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        if key in self.pending:
            return await asyncio.shield(self.pending[key])
        if len(self.pending) >= 32:
            raise RuntimeError("Character preview is busy")

        async def create():
            async with self.limit:
                result = dict(await self.runner(build))
                if self.signature() != key[0]:
                    raise RuntimeError("Native preview version changed; retry")
                result["atlas"] = self.atlas_asset()
                self.cache[key] = result
                while len(self.cache) > 128:
                    self.cache.popitem(last=False)
                return result
        task = asyncio.create_task(create())
        self.pending[key] = task
        def completed(done):
            self.pending.pop(key, None)
            if not done.cancelled():
                done.exception()
        task.add_done_callback(completed)
        try:
            return await asyncio.shield(task)
        finally:
            if task.done():
                self.pending.pop(key, None)


services = {}


def configured_service(game_id):
    from webtiles import config
    game = config.games.get(game_id)
    if game is None:
        raise ValueError("Unknown game mode")
    binary = Path(game.get("crawl_binary")).resolve()
    atlas = Path(game.get("client_path")) / "static/player.png"
    key = (str(binary), str(atlas.resolve()))
    if key not in services:
        services[key] = PreviewService(binary, atlas)
    return services[key]
