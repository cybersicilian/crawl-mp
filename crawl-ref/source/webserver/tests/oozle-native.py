"""Inspect Oozle starts and companion ownership with a matching native build."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess

run = runpy.run_path(str(Path(__file__).with_name("native-character-preview.py")))["run"]


def inspect_slots(hero):
    profile = hero["equipment_profile"]
    for kind in ("body", "hands", "feet", "barding"):
        slot = next(slot for slot in profile["slots"] if slot["type"] == kind)
        assert slot["state"] == "unavailable", (kind, slot)
    for kind in ("head", "cloak"):
        slot = next(slot for slot in profile["slots"] if slot["type"] == kind)
        assert slot["capacity"] == 1 and slot["state"] != "unavailable", (kind, slot)
    assert len([slot for slot in profile["slots"] if slot["type"] == "ring"]) == 2
    equipped = {item["slot"] for item in hero["inventory"] if item["equipped"]}
    assert all(item["fits"] for item in profile["items"]
               if item["equipment"] and item["inv_slot"] in equipped)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, required=True)
    args = parser.parse_args()
    binary = args.binary.resolve()
    native = json.loads(subprocess.check_output([str(binary), "-playable-json"], text=True))
    species = next(entry for entry in native["species"] if entry["name"] == "Oozle")
    assert species["abbr"] == "Oz"
    assert species["modifiers"]["hp"] == -1
    assert species["recommended_jobs"] == ["Alchemist", "Monk", "Fighter", "Shapeshifter"]
    fighter = "1,Jade:Oozle/Fighter/flail/12345"
    first = run(binary, fighter)[0]
    assert first == run(binary, fighter, world_seed=987654321)[0]
    assert first["species"] == "Oozle" and first["ac"] == 2 and first["sh"] > 0
    assert first["resists"]["rPois"] == 1
    assert first["resists"]["rCorr"] == 1
    assert first["resists"]["rF"] == -1
    assert first["skills"]["Shields"] > 0
    inspect_slots(first)
    backgrounds = []
    for job in native["jobs"]:
        if "Oz" + job["abbr"] not in native["combos"]:
            continue
        hero = run(binary, f"1,Jade:Oozle/{job['name']}/unarmed/12345")[0]
        assert hero["species"] == "Oozle" and hero["hp"] > 0
        assert hero["ac"] >= 2
        inspect_slots(hero)
        backgrounds.append(job["name"])
    assert backgrounds
    companion = run(binary, "2,Host:Human/Fighter/unarmed/1,Jade:Oozle/Fighter/flail/12345")[1]
    for key in ("ac", "sh", "str", "int", "dex", "species", "resists"):
        assert companion[key] == first[key], key
    assert companion["doll"][:2] == first["doll"][:2]
    assert companion["equipment_profile"]["slots"] == first["equipment_profile"]["slots"]
    inspect_slots(companion)
    print(json.dumps({"passed": True, "species": "Oozle", "backgrounds": backgrounds,
                      "deterministic": True, "companion_doll": True}))


if __name__ == "__main__":
    main()
