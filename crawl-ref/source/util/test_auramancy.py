"""Lightweight cross-file contracts; native combat tests live in test_paladin.cc."""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

SOURCE = Path(__file__).resolve().parents[1]


def entries(path):
    result = {}
    for block in path.read_text().split("%%%%"):
        lines = block.strip().splitlines()
        if lines:
            result[lines[0]] = "\n".join(lines[1:]).strip()
    return result


def catalog():
    result = {}
    group = None
    for line in (SOURCE / "webserver/static/scripts/character-catalog.js").read_text().splitlines():
        if line.strip() in ("species: {", "jobs: {"):
            group = line.strip().split(":")[0]
            result[group] = {}
        elif line.startswith('            "'):
            key, value = line.strip().rstrip(",").split(": ", 1)
            result[group][json.loads(key)] = json.loads(value)
    return result


class AuramancyContracts(unittest.TestCase):
    def test_every_live_aura_has_the_school_a_description_and_original_lore(self):
        source = (SOURCE / "spl-data.h").read_text()
        spells = re.findall(r'(SPELL_AURA_OF_\w+), "([^"]+)",\n\s*([^\n]+)', source)
        self.assertEqual(len(spells), 7)
        descriptions = entries(SOURCE / "dat/descript/spells.txt")
        quotes = entries(SOURCE / "dat/descript/quotes.txt")
        for symbol, name, schools in spells:
            with self.subTest(spell=name):
                self.assertIn("spschool::auramancy", schools)
                self.assertIn(symbol, (SOURCE / "auras.cc").read_text())
                self.assertIn("Auramancy", descriptions[name + " spell"])
                self.assertGreater(len(descriptions[name + " spell"]), 350)
                self.assertGreater(len(quotes[name + " spell"]), 50)

    def test_web_selection_and_server_weapon_tables_agree_on_the_holy_class(self):
        guide = catalog()
        weapons = json.loads((SOURCE / "webserver/static/starting-weapons.json").read_text())
        self.assertNotIn("Priest", guide["jobs"])
        self.assertIn("Paladin", guide["jobs"])
        for name in ("Demigod", "Demonspawn", "Mummy", "Revenant"):
            self.assertNotIn("Paladin", guide["species"][name]["allowed_jobs"])
            self.assertNotIn("Paladin", weapons.get(name, {}))
        for name in ("Human", "Minotaur", "Gargoyle"):
            self.assertIn("Paladin", guide["species"][name]["allowed_jobs"])
            self.assertIn("Paladin", weapons[name])
            self.assertNotIn("war axe", weapons[name]["Paladin"]["choices"])
        for item in guide["species"].values():
            self.assertNotIn("Priest", item["allowed_jobs"])
            self.assertNotIn("Priest", item["recommended"])
            self.assertIn("Auramancy", item["aptitudes"])
        for path in (SOURCE / "dat/species").glob("*.yaml"):
            definition = yaml.safe_load(path.read_text())
            self.assertNotIn("priest", definition.get("recommended_jobs", []), path.name)
        for jobs in weapons.values():
            self.assertNotIn("Priest", jobs)

    def test_paladin_guide_matches_its_canonical_starting_kit(self):
        spec = yaml.safe_load((SOURCE / "dat/jobs/paladin.yaml").read_text())
        guide = catalog()["jobs"]["Paladin"]
        self.assertEqual(guide["skills"], spec["skills"])
        self.assertEqual(guide["equipment"], spec["equipment"])
        self.assertEqual(spec["skills"]["auramancy"], 2)
        self.assertEqual(spec["weapon_choice"], "plain")
        self.assertEqual(len(guide["spells"]), 5)
        self.assertNotIn("JOB_PRIEST", (SOURCE / "job-groups.h").read_text())
        self.assertIn('"Pr", "Priest"', (SOURCE / "job-data.h").read_text())

    def test_generators_reproduce_the_native_headers(self):
        generators = (
            ("job", ["job-data.h", "job-groups.h", "job-type.h"]),
            ("species", ["species-data.h", "aptitudes.h", "species-groups.h", "species-type.h"]),
        )
        with tempfile.TemporaryDirectory() as temporary:
            for kind, names in generators:
                outputs = [Path(temporary) / name for name in names]
                subprocess.run([sys.executable, str(SOURCE / f"util/{kind}-gen.py"),
                                str(SOURCE / f"dat/{'jobs' if kind == 'job' else 'species'}"),
                                str(SOURCE / f"util/{kind}-gen"),
                                *map(str, outputs)], check=True, capture_output=True)
                for output in outputs:
                    with self.subTest(header=output.name):
                        self.assertEqual(output.read_text(), (SOURCE / output.name).read_text())


if __name__ == "__main__":
    unittest.main()
