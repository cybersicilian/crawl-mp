"""Publish unchanged player-base PNGs using the native species tile mapping."""
from hashlib import sha256
import re
import shutil


def publish_tiles(source, species_data):
    manifest = source / "rltiles/dc-player.txt"
    sprites, category, directory = {}, "", ""
    for raw in manifest.read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if line.startswith("%parts_ctg "):
            category = line.split()[1]
        elif line.startswith("%sdir "):
            directory = line.split()[1]
        elif line and not line.startswith("%"):
            parts = line.split()
            for symbol in parts[1:]:
                sprites["TILEP_" + category + "_" + symbol] = source / "rltiles" / directory / (parts[0] + ".png")

    native = (source / "tilepick-p.cc").read_text()
    native = native.split("tileidx_t tilep_species_to_base_tile", 1)[1].split("void tilep_draconian_init", 1)[0]
    native = re.sub(r"^#.*$", "", native, flags=re.M)
    mapping = {}
    for cases, tile in re.findall(r"((?:\s*case SP_\w+:)+)\s*return (TILEP_BASE_\w+)", native):
        for species in re.findall(r"case (SP_\w+):", cases):
            mapping[species] = tile
    destination = source / "webserver/static/player-tiles"
    destination.mkdir(exist_ok=True)
    result = {}
    for name, definition in species_data.items():
        tile = mapping.get(definition["enum"], "TILEP_BASE_HUMAN")
        path = sprites[tile]
        filename = path.stem + "-" + sha256(path.read_bytes()).hexdigest()[:12] + ".png"
        shutil.copyfile(path, destination / filename)
        result[name] = {"src": "/static/player-tiles/" + filename, "native": tile}
    return result
