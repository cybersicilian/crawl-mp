"""Verify Elder starting kits and seeded Sage libraries in native previews."""
import argparse
import runpy
from pathlib import Path


run = runpy.run_path(str(Path(__file__).with_name("native-character-preview.py")))["run"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    binary = parser.parse_args().binary.resolve()

    preacher = run(binary, "1,Preacher:Human/Preacher/mace/101")[0]
    assert preacher["job"] == "Preacher"
    assert any("silver" in item["name"] and "javelin" in item["name"]
               for item in preacher["inventory"])
    healer = run(binary, "1,Healer:Human/Healer/mace/102")[0]
    assert healer["job"] == "Healer"
    assert any("curing" in item["name"] for item in healer["inventory"])

    def sage(seed):
        return run(binary, f"1,Sage:Human/Sage/unarmed/{seed}")[0]

    first = sage(101)
    assert first == sage(101), "A reserved starting seed must reproduce its Sage preview"
    assert "Apportation" in first["memorized"]
    assert first["library"], "Sage starts with a random book in the spell library"
    libraries = {tuple(sorted(sage(seed)["library"])) for seed in (101, 102, 103, 104)}
    assert len(libraries) > 1, "Different starting seeds should allow different Sage books"

    party = run(binary, "2,First:Human/Sage/unarmed/101,Second:Human/Sage/unarmed/102")
    expected = set(sage(101)["library"]) | set(sage(102)["library"])
    for member in party:
        assert expected <= set(member["library"]), "Both books join the shared party library"
    print("Elder starts and seeded Sage library previews passed")


if __name__ == "__main__":
    main()
