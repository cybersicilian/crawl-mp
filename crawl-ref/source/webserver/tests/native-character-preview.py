"""Native creation determinism, restrictions, equipment and inspection isolation."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile


def run(binary, party, world_seed=123):
    with tempfile.TemporaryDirectory(prefix="dcss-character-inspection-") as directory:
        call = [str(binary), "-dir", str(binary.parent), "-rc", "/dev/null",
                "-extra-opt-last", "save_dir=" + directory,
                "-seed", str(world_seed), "-character-preview-json", party]
        # No-save packages need a writable scratch CWD; -dir supplies game data.
        result = subprocess.run(call, cwd=directory, capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise AssertionError(result.stderr[-6000:])
        payload = json.loads(result.stdout)
        assert not list(Path(directory).rglob("*.cs")), "Inspection wrote a native save"
        return payload["members"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    args = parser.parse_args()
    binary = args.binary.resolve()
    fighter = "1,Aldric:Minotaur/Fighter/war axe/12345"
    first = run(binary, fighter)
    assert first == run(binary, fighter, world_seed=987654321), "World seed changed the reserved starting roll"
    hero = first[0]
    assert hero["hp"] > 0 and hero["ac"] > 0 and hero["sh"] > 0
    assert all(hero[key] >= 0 for key in ("mp", "ev", "str", "int", "dex"))
    assert any("war axe" in item["name"] and item["equipped"] for item in hero["inventory"])
    other = run(binary, fighter.replace("war axe", "trident"))[0]
    assert all(item["description"].strip() for item in hero["inventory"])
    assert all(detail["description"].strip() for detail in hero["skill_details"].values())
    assert "current stats and equipment" in hero["skill_details"]["Armour"]["description"]
    assert hero["doll"] != other["doll"], "Chosen weapon did not change the equipped paperdoll"
    felid = run(binary, "1,Cat:Felid/Fighter/unarmed/12345")[0]
    assert felid["sh"] == 0
    assert not any(item["equipped"] for item in felid["inventory"])
    wizard = run(binary, "1,Lyra:Deep Elf/Conjurer/unarmed/12345")[0]
    assert wizard["mp"] > 0 and "Magic Dart" in wizard["memorized"]
    assert "Fulminant Prism" not in wizard["memorized"]
    assert set(wizard["library"]) | set(wizard["memorized"]) == set(wizard["spell_details"])
    dart = wizard["spell_details"]["Magic Dart"]
    assert dart["level"] == 1 and dart["mp_cost"] == 1 and dart["description"].strip()
    assert dart["casting_cost"] == {"resource": "mp", "amount": 1}
    djinni = run(binary, "1,Ember:Djinni/Conjurer/unarmed/12345")[0]
    assert djinni["mp"] == 0 and djinni["spell_resource"] == "hp"
    assert djinni["memorized"], "Djinni starts with spells despite having no mana"
    for name in djinni["memorized"]:
        detail = djinni["spell_details"][name]
        assert detail["casting_cost"] == {"resource": "hp", "amount": detail["mp_cost"]}
    mixed = run(binary, "2,Ember:Djinni/Conjurer/unarmed/12345,Lyra:Deep Elf/Conjurer/unarmed/12345")
    assert mixed[0]["spell_resource"] == "hp" and mixed[1]["spell_resource"] == "mp"
    assert mixed[1]["spell_details"]["Magic Dart"]["casting_cost"]["resource"] == "mp"
    assert dart["schools"] == "Conjuration" and dart["fail"] and dart["range"]
    novice = run(binary, "1,Novice:Minotaur/Conjurer/unarmed/12345")[0]["spell_details"]["Magic Dart"]
    assert novice["description"] == dart["description"]
    assert novice["fail"] != dart["fail"], "Spell tooltip did not use this hero's starting skill"
    party = run(binary, "3,Host:Human/Fighter/unarmed/1,Cat:Felid/Fighter/unarmed/12345,Lyra:Deep Elf/Conjurer/unarmed/12345")
    assert party[1]["doll"] == felid["doll"], "Companion portrait inherited the active hero's equipment"
    companion_wizard = run(binary, "2,Host:Human/Fighter/unarmed/1,Lyra:Deep Elf/Conjurer/unarmed/12345")[1]
    assert party[2]["doll"] == companion_wizard["doll"], "Companion portrait inherited the active hero's species"
    random_build = "1,Roamer:Human/Wanderer/unarmed/12345"
    wanderer = run(binary, random_build)
    assert wanderer == run(binary, random_build), "Random starts rerolled between inspections"
    assert wanderer != run(binary, random_build.replace("12345", "54321"))
    companion = "2,Host:Human/Fighter/unarmed/1,Roamer:Human/Wanderer/unarmed/12345"
    compacted = "3,Host:Human/Fighter/unarmed/1,Other:Deep Elf/Conjurer/unarmed/6789,Roamer:Human/Wanderer/unarmed/12345"
    second = run(binary, companion)[1]
    third = run(binary, compacted)[2]
    second.pop("slot"); third.pop("slot")
    # The party's shared library legitimately grows when another caster joins.
    second.pop("library"); third.pop("library")
    second.pop("spell_details"); third.pop("spell_details")
    assert second == third, "Party compaction changed a companion's reserved starting build"
    print(json.dumps({"passed": True, "checks": ["native stats", "world-seed isolation", "equipped doll", "companion portraits",
          "native entry descriptions", "hero-specific spell details", "species restrictions", "memorized spells", "Wanderer determinism", "party compaction", "no native saves"]}))


if __name__ == "__main__":
    main()
