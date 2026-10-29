"""Verify Tortle creation and companion inspection with the real native engine."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess

run = runpy.run_path(str(Path(__file__).with_name("native-character-preview.py")))["run"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, required=True)
    args = parser.parse_args()
    binary = args.binary.resolve()
    native = json.loads(subprocess.check_output([str(binary), "-playable-json"], text=True))
    species = next(entry for entry in native["species"] if entry["name"] == "Tortle")
    assert species["abbr"] == "To"
    assert species["modifiers"]["hp"] == 1
    assert species["recommended_jobs"] == ["Fighter", "Gladiator", "Berserker", "Monk"]
    fighter = "1,Shell:Tortle/Fighter/war axe/12345"
    first = run(binary, fighter)[0]
    assert first == run(binary, fighter, world_seed=987654321)[0]
    assert first["species"] == "Tortle" and first["ac"] >= 6 and first["sh"] > 0
    assert first["resists"]["rC"] == 0
    assert all(item["description"].strip() for item in first["inventory"])
    equipped = [item["name"] for item in first["inventory"] if item["equipped"]]
    assert any("robe" in name for name in equipped), equipped
    assert not any("mail" in name or "plate armour" in name for name in equipped)
    slots = first["equipment_profile"]["slots"]
    for kind in ("hands", "feet"):
        assert next(slot for slot in slots if slot["type"] == kind)["state"] == "unavailable"
    inspected = []
    for job in native["jobs"]:
        if "To" + job["abbr"] not in native["combos"]:
            continue
        hero = run(binary, f"1,Shell:Tortle/{job['name']}/unarmed/12345")[0]
        assert hero["species"] == "Tortle" and hero["hp"] > 0
        assert hero["ac"] >= 6
        equipped_slots = {item["slot"] for item in hero["inventory"] if item["equipped"]}
        equipment = hero["equipment_profile"]["items"]
        assert all(item["fits"] for item in equipment
                   if item["equipment"] and item["inv_slot"] in equipped_slots), job["name"]
        inspected.append(job["name"])
    companion = run(binary, "2,Host:Human/Fighter/unarmed/1,Shell:Tortle/Fighter/war axe/12345")[1]
    # Native packing starts with the shadow and species base. Cosmetic armour
    # and shield variants can differ between a lead hero and a companion.
    assert companion["doll"][:2] == first["doll"][:2]
    for key in ("ac", "sh", "str", "int", "dex", "species"):
        assert companion[key] == first[key], key
    assert companion["equipment_profile"]["slots"] == first["equipment_profile"]["slots"]
    print(json.dumps({"passed": True, "species": "Tortle", "backgrounds": inspected,
                      "deterministic": True, "companion_doll": True,
                      "starting_equipment": equipped, "ac": first["ac"], "sh": first["sh"]}))


if __name__ == "__main__":
    main()
