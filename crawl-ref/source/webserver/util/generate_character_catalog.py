"""Build the selection guide from the same local data used by Crawl.

Run from any directory with the project's Python environment. The executable
provides authoritative aptitude/recommendation metadata; YAML and native
descriptions supply character creation facts. This does not start a game.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

import yaml
from character_tiles import publish_tiles


SOURCE = Path(__file__).resolve().parents[2]


def descriptions(path):
    result = {}
    for block in path.read_text().split("%%%%"):
        lines = [line for line in block.strip().splitlines()
                 if not line.startswith("#")]
        if len(lines) > 1:
            result[lines[0].strip()] = " ".join(" ".join(lines[1:]).split())
    return result


def definitions(folder):
    result = {}
    paths = sorted(folder.glob("*.yaml"),
                   key=lambda path: (path.name.startswith("deprecated-"), path.name))
    for path in paths:
        data = yaml.safe_load(path.read_text())
        if data and data.get("name"):
            result.setdefault(data["name"].casefold(), data)
    return result


def unquote(text):
    try:
        return json.loads('"' + text + '"')
    except ValueError:
        return text


def mutation_text():
    # The native table's first text array is the three levels shown on A.
    pattern = r'\{\s*(MUT_\w+),[^{}]*?"(?:\\.|[^"\\])*",\s*\{(.*?)\}'
    result = {}
    for key, array in re.findall(pattern, (SOURCE / "mutation-data.h").read_text(), re.S):
        entries, current = [], ""
        for token in re.findall(r'"(?:\\.|[^"\\])*"|,', array):
            if token == ",":
                entries.append(current)
                current = ""
            else:
                current += unquote(token[1:-1])
        entries.append(current)
        result[key] = entries
    return result


def clean(text):
    return re.sub(r"</?[^>]+>", "", text).strip()


def species_traits(definition, mutations):
    traits = []
    for level, gains in definition.get("mutations", {}).items():
        for key, rank in gains.items():
            options = mutations.get(key, [])
            value = options[min(int(rank), len(options)) - 1] if options else ""
            if not value:
                value = key.removeprefix("MUT_").replace("_", " ").capitalize()
            prefix = "" if int(level) == 1 else f"At XL {level}: "
            traits.append(prefix + clean(value))
    traits.extend(clean(trait["long"]) for trait in definition.get("fake_mutations", [])
                  if trait.get("long"))
    return traits


def equipment_name(spec):
    # Retain game spec qualifiers as readable facts rather than hiding them.
    spec = re.sub(r"\bq:(\d+)\b", r"×\1", str(spec))
    return re.sub(r"\bplus:([+-]?\d+)\b", r"enchantment \1", spec)


def generate(binary):
    native = json.loads(subprocess.check_output([str(binary), "-playable-json"], text=True))
    species_data = definitions(SOURCE / "dat/species")
    job_data = definitions(SOURCE / "dat/jobs")
    tiles = publish_tiles(SOURCE, species_data)
    species_descriptions = descriptions(SOURCE / "dat/descript/species.txt")
    job_descriptions = descriptions(SOURCE / "dat/descript/backgrounds.txt")
    mutations = mutation_text()
    spells = dict(re.findall(r'(SPELL_\w+),\s*"([^"]+)"',
                             (SOURCE / "spl-data.h").read_text()))
    result = {"species": {}, "jobs": {}}
    for item in native["species"]:
        name = item["name"]
        definition = species_data.get(name.casefold(), {})
        fallback = item.get("derives", "")
        description = species_descriptions.get(name, species_descriptions.get(fallback, ""))
        if not description:
            raise ValueError(f"Missing native species description: {name}")
        result["species"][name] = {
            "name": name, "abbr": item["abbr"], "description": description,
            "tile": tiles.get(name.casefold(), tiles.get(fallback.casefold())),
            "selectable": name in native["starting_weapons"],
            "allowed_jobs": [job["name"] for job in native["jobs"]
                             if item["abbr"] + job["abbr"] in native["combos"]],
            "aptitudes": item["apts"], "modifiers": item["modifiers"],
            "trait_restrictions": {
                job: entry.get("trait_restrictions", {})
                for job, entry in native["starting_weapons"].get(name, {}).items()
            },
            "stats": {key: definition[key] for key in ("str", "int", "dex")
                      if key in definition},
            "traits": species_traits(definition, mutations),
            "recommended": item["recommended_jobs"],
        }
    # The staging UI historically called Djinni 'Djinn'. Keep that contract.
    result["species"]["Djinn"] = result["species"]["Djinni"]
    for item in native["jobs"]:
        name = item["name"]
        definition = job_data.get(name.casefold(), {})
        if name not in job_descriptions or not definition:
            raise ValueError(f"Missing native background data: {name}")
        result["jobs"][name] = {
            "name": name, "abbr": item["abbr"], "description": job_descriptions[name],
            "category": definition.get("category", ""),
            "stats": {key: definition[key] for key in ("str", "int", "dex")
                      if key in definition},
            "equipment": [equipment_name(value) for value in definition.get("equipment", [])],
            "spells": [spells.get(value, value.removeprefix("SPELL_").replace("_", " ").title())
                       for value in definition.get("spells", [])],
            "skills": definition.get("skills", {}),
            "recommended": item["recommended_species"],
        }
    return result, native["starting_weapons"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=Path, default=SOURCE / "crawl")
    parser.add_argument("--output", type=Path,
                        default=SOURCE / "webserver/static/scripts/character-catalog.js")
    parser.add_argument("--weapons-output", type=Path,
                        default=SOURCE / "webserver/static/starting-weapons.json")
    args = parser.parse_args()
    catalog, weapons = generate(args.binary.resolve())
    lines = ["/* Generated from native descriptions, YAML and -playable-json.",
             " * Regenerate with webserver/util/generate_character_catalog.py. */",
             "define(function () {", '    "use strict";', "    return {"]
    groups = list(catalog.items())
    for group_index, (group, entries) in enumerate(groups):
        lines.append(f"        {group}: {{")
        for index, (key, value) in enumerate(entries.items()):
            comma = "," if index < len(entries) - 1 else ""
            lines.append("            " + json.dumps(key) + ": "
                         + json.dumps(value, ensure_ascii=False) + comma)
        lines.append("        }" + ("," if group_index < len(groups) - 1 else ""))
    lines.extend(["    };", "});", ""])
    args.output.write_text("\n".join(lines))
    # One species per line keeps this generated lookup easy to compare and bounded.
    args.weapons_output.write_text("{\n" + ",\n".join(
        "  " + json.dumps(key) + ": " + json.dumps(value)
        for key, value in weapons.items()) + "\n}\n")
    print(f"Generated {len(catalog['species'])} race entries and {len(catalog['jobs'])} classes")


if __name__ == "__main__":
    main()
