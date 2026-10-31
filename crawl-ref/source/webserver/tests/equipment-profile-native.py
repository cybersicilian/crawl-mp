"""Authoritative anatomy snapshots through the native no-save preview path."""
import argparse
import json
from pathlib import Path
import runpy
import subprocess

run = runpy.run_path(str(Path(__file__).with_name("native-character-preview.py")))["run"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--all-species", action="store_true",
                        help="Use the native playable catalogue instead of the representative set")
    args = parser.parse_args()
    result = {}
    species = ["Human", "Minotaur", "Octopode", "Naga", "Coglin", "Poltergeist",
               "Draconian", "Felid", "Troll", "Spriggan"]
    if args.all_species:
        catalog = subprocess.run([str(args.binary.resolve()), "-playable-json"],
                                 cwd=args.binary.resolve().parent, capture_output=True,
                                 text=True, check=True, timeout=30)
        # Derived draconian colours are valid species, but cannot be created by
        # the starting-character preview. The native matrix covers those.
        species = [entry["name"] for entry in json.loads(catalog.stdout)["species"]
                   if entry["recommended_jobs"]]
    for name in species:
        party = f"1,Hero:{name}/Fighter/unarmed/12345"
        try:
            hero = run(args.binary.resolve(), party)[0]
        except AssertionError as error:
            raise AssertionError(f"{name}: {error}") from error
        profile = hero["equipment_profile"]
        assert profile["version"] == 1
        assert profile["portrait"]["layers"], name
        assert len({slot["key"] for slot in profile["slots"]}) == len(profile["slots"])
        assert all(item["art"]["layers"] for item in profile["items"])
        assert all("reason" in item for item in profile["items"] if item["equipment"])
        assert all("slot" in item for item in hero["inventory"])
        assert hero == run(args.binary.resolve(), party, world_seed=987654321)[0], name
        result[name] = hero

    def slots(name, kind):
        return [slot for slot in result[name]["equipment_profile"]["slots"] if slot["type"] == kind]

    assert slots("Octopode", "ring")[0]["capacity"] == 8
    assert slots("Octopode", "body")[0]["state"] == "unavailable"
    assert slots("Naga", "barding")[0]["capacity"] == 1
    assert slots("Naga", "feet")[0]["state"] == "unavailable"
    assert slots("Coglin", "weapon_offhand")[0]["capacity"] == 1
    assert slots("Coglin", "ring")[0]["state"] == "unavailable"
    assert slots("Poltergeist", "haunted_armour")[0]["capacity"] == 6
    assert slots("Draconian", "body")[0]["state"] == "unavailable"
    assert slots("Felid", "weapon")[0]["state"] == "unavailable"
    assert slots("Troll", "hands")[0]["state"] == "unavailable"
    assert slots("Spriggan", "hands")[0]["state"] == "unavailable"
    restrictions = result["Minotaur"]["equipment_profile"]["restrictions"]
    assert any("horns" in entry["reason"] for entry in restrictions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2))
    print(json.dumps({"passed": True, "species": species, "deterministic": True,
                      "no_saves": True, "output": str(args.output)}))


if __name__ == "__main__":
    main()
