"""Reproduce provenance, exact-pixel candidates and comparison sheets offline.

Requires Pillow. Run from any directory. This does not read/write runtime art.
It copies source PNGs and crops published 16px cells; it never draws an icon.
"""
from collections import Counter
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json
import re
import shutil
import zipfile

from PIL import Image, ImageDraw, ImageFont
from selection import FUGUE, KYRISE, SHADE, GROUPS

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
SOURCES = ROOT / "sources"
DATE = "2026-10-17"
FAMILIES = {
    "fugue": {"creator": "Yusuke Kamiyamane", "version": "3.5.6",
        "page": "https://p.yusukekamiyamane.com/?lang=en",
        "download": "https://p.yusukekamiyamane.com/icon/downloads/fugue-icons-3.5.6.zip",
        "archive": "fugue-icons-3.5.6.zip", "license": "CC-BY-3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "price": "Free with attribution"},
    "kyrise": {"creator": "Kyrise (Gabie Nory)", "version": "1.2 (author OGA download)",
        "page": "https://kyrise.itch.io/kyrises-free-16x16-rpg-icon-pack",
        "download": "https://opengameart.org/sites/default/files/Kyrises_16x16_RPG_Icon_Pack_V1.2.zip",
        "archive": "kyrise-v1.2.zip", "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/", "price": "Free / optional donation"},
    "shade": {"creator": "Shade", "version": "Author OGA assorted archive, checked 2026-10-17",
        "page": "https://merchant-shade.itch.io/16x16-mixed-rpg-icons",
        "download": "https://opengameart.org/sites/default/files/16x16_assorted_rpg_icons.zip",
        "archive": "shade-assorted.zip", "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/", "price": "Free"},
}
PACKS = {key: zipfile.ZipFile(SOURCES / value["archive"]) for key, value in FAMILIES.items()}
KYRISE_PREFIX = "Kyrise's 16x16 RPG Icon Pack - V1.2/"
SHADE_PREFIX = "16x16 Assorted RPG Icons/"


def digest(data):
    return sha256(data).hexdigest()


def write_json(name, data):
    # One record per line makes this generated data easy to review.
    target = ROOT / name
    if isinstance(data, list):
        target.write_text("[\n" + ",\n".join(json.dumps(x, ensure_ascii=False) for x in data) + "\n]\n")
    else:
        target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def png_bytes(image):
    stream = BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()


def load_icon(family, member, box=None):
    raw = PACKS[family].read(member)
    image = Image.open(BytesIO(raw)).convert("RGBA")
    if box:
        image = image.crop(box)
    assert image.size == (16, 16), (family, member, image.size)
    return image, raw


def main():
    candidates = ROOT / "import-candidates"
    originals = candidates / "originals"
    roles_dir = candidates / "roles"
    licenses = ROOT / "licenses"
    samples = ROOT / "comparison-assets"
    for directory in [originals, roles_dir, licenses, samples]:
        directory.mkdir(parents=True, exist_ok=True)
    inventory = REPO / "crawl-ref/source/webserver/static/scripts/item-properties.js"
    source = inventory.read_text()
    names = re.findall(r'"([^"]+)"', re.search(r"var spriteNames = \[(.*?)\];", source, re.S)[1])
    alias_block = re.search(r"var iconAliases = \{(.*?)\n    \};", source, re.S)[1]
    aliases = {a or b: c for a, b, c in re.findall(r'(?:"([^"]+)"|(\w+)):\s*"([^"]+)"', alias_block)}
    selections = {row[0]: row[1:] for row in (line.split("|") for line in FUGUE.strip().splitlines())}
    assert len(names) == len(selections) == 112
    assert set(names) == set(selections)
    assert len(aliases) == 24 and all(target in selections for target in aliases.values())
    images, records = {}, []
    for frame, role in enumerate(names):
        asset, confidence, reason = selections[role]
        row = {"role": role, "frame": frame, "status": confidence, "reason": reason,
            "family": "fugue" if asset else None, "asset": f"icons/{asset}.png" if asset else None,
            "license": "CC-BY-3.0" if asset else None, "sourceSha256": None,
            "candidateFile": None, "alternatives": []}
        if asset:
            member = f"icons/{asset}.png"
            image, raw = load_icon("fugue", member)
            (originals / f"{asset}.png").write_bytes(raw)
            (roles_dir / f"{role}.png").write_bytes(raw)
            images[("fugue", role)] = image
            row.update(sourceSha256=digest(raw), candidateFile=f"import-candidates/roles/{role}.png")
        if role in KYRISE:
            member = KYRISE_PREFIX + f"icons/16x16/{KYRISE[role]}.png"
            image, raw = load_icon("kyrise", member)
            target = samples / f"kyrise-{role}.png"
            target.write_bytes(raw)
            images[("kyrise", role)] = image
            row["alternatives"].append({"family": "kyrise", "asset": member,
                "sourceSha256": digest(raw), "sample": str(target.relative_to(ROOT)), "license": "CC-BY-4.0"})
        if role in SHADE:
            sheet, x, y = SHADE[role]
            member = SHADE_PREFIX + sheet
            box = (x * 16, y * 16, x * 16 + 16, y * 16 + 16)
            image, raw = load_icon("shade", member, box)
            cropped = png_bytes(image)
            target = samples / f"shade-{role}.png"
            target.write_bytes(cropped)
            images[("shade", role)] = image
            row["alternatives"].append({"family": "shade", "asset": member, "crop": list(box),
                "sourceSha256": digest(raw), "sampleSha256": digest(cropped),
                "sample": str(target.relative_to(ROOT)), "license": "CC0-1.0"})
        records.append(row)
    counts = dict(Counter(row["status"] for row in records))
    write_json("role-mapping.json", records)
    write_json("aliases.json", [{"alias": key, "canonical": value,
        "status": selections[value][1], "asset": selections[value][0] or None} for key, value in aliases.items()])
    atlas = Image.new("RGBA", (256, 112))
    for frame, name in enumerate(names):
        if ("fugue", name) in images:
            atlas.paste(images[("fugue", name)], ((frame % 16) * 16, (frame // 16) * 16))
    atlas.save(candidates / "fugue-partial-16px.png")
    write_json("import-candidates/manifest.json", {"complete": False, "runtimeInstalled": False,
        "intendedUse": "Review candidates only. Do not install partial atlas as a complete replacement.",
        "family": "Fugue 3.5.6", "license": "CC-BY-3.0", "counts": counts,
        "size": 16, "columns": 16, "width": 256, "height": 112,
        "atlas": "fugue-partial-16px.png", "mapping": "../role-mapping.json",
        "gaps": [row["role"] for row in records if row["status"] == "gap"],
        "metaphorsRequireReview": [row["role"] for row in records if row["status"] == "metaphor"],
        "fallback": None, "sourcePixelsChanged": False})
    for key, member in [("fugue", "README.txt"), ("kyrise", KYRISE_PREFIX + "read me.txt")]:
        (licenses / f"{key}-original-notice.txt").write_bytes(PACKS[key].read(member))
    for filename in SOURCES.glob("*-*.txt"):
        shutil.copyfile(filename, licenses / filename.name)
    provenance = []
    for key, family in FAMILIES.items():
        provenance.append({"family": key, "verifiedOn": DATE, **family,
            "archiveSha256": digest((SOURCES / family["archive"]).read_bytes()),
            "modifications": "PNG bytes unchanged for Fugue/Kyrise; exact 16px cell crops for Shade; nearest-neighbor display scaling only."})
    write_json("provenance.json", provenance)
    typography = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 10)
    titlefont = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 17)
    # Each pair is one 16px image and its integer 2x duplicate, on both surfaces.
    compare_roles = "armour shield blade potion loot coin jewellery staff ammo scroll book spells inspect camera control zoom-in save intelligence".split()
    width, row_height, top = 760, 57, 112
    compare = Image.new("RGB", (width, top + len(compare_roles) * row_height + 62), "#f8f2e4")
    draw = ImageDraw.Draw(compare)
    draw.text((15, 12), "Published artwork / native 16px + integer 2x", font=titlefont, fill="#29251e")
    draw.text((15, 39), "HUD middle tone #24282b  |  light folio #f8f2e4  |  no icon pixels changed", font=typography, fill="#665c49")
    for col, family in enumerate(FAMILIES):
        x = 160 + col * 198
        draw.text((x, 66), family.capitalize(), font=titlefont, fill="#29251e")
        draw.text((x, 90), "16 / 32        16 / 32", font=typography, fill="#665c49")
        for i, role in enumerate(compare_roles):
            y = top + i * row_height
            if col == 0:
                draw.text((15, y + 19), role, font=typography, fill="#29251e")
            draw.rectangle((x, y, x + 91, y + 51), fill="#24282b")
            draw.rectangle((x + 94, y, x + 186, y + 51), fill="#f8f2e4", outline="#cfc0a1")
            image = images.get((family, role))
            if image:
                for dx in [0, 94]:
                    compare.paste(image, (x + dx + 9, y + 18), image)
                    large = image.resize((32, 32), Image.Resampling.NEAREST)
                    compare.paste(large, (x + dx + 41, y + 10), large)
            else:
                draw.text((x + 18, y + 19), "GAP", font=typography, fill="#ffb58f")
                draw.text((x + 112, y + 19), "GAP", font=typography, fill="#943824")
    draw.text((15, compare.height - 48), "Fugue: Yusuke Kamiyamane / CC BY 3.0. Kyrise: CC BY 4.0. Shade: CC0.", font=typography, fill="#665c49")
    draw.text((15, compare.height - 28), "GAP = no selected suitable asset; never an invented replacement.", font=typography, fill="#665c49")
    compare.save(ROOT / "shortlist-16px.png")
    group_sheet(images, typography, titlefont)
    verify(records, aliases, atlas)
    print(json.dumps({"canonical": len(records), "aliases": len(aliases), "coverage": counts,
        "uniqueFugueAssets": len(list(originals.glob('*.png'))), "verification": "passed"}))


def group_sheet(images, font, titlefont):
    height = 70 + len(GROUPS) * 107 + 55
    out = Image.new("RGB", (760, height), "#f8f2e4")
    draw = ImageDraw.Draw(out)
    draw.text((15, 14), "Fugue / actual 16px semantic checks", font=titlefont, fill="#29251e")
    draw.text((15, 42), "Each role: dark HUD, then light folio. GAP means unresolved.", font=font, fill="#665c49")
    for group, (title, roles) in enumerate(GROUPS):
        y = 70 + group * 107
        draw.text((15, y), title, font=titlefont, fill="#29251e")
        for i, role in enumerate(roles.split()):
            x = 15 + i * 104
            draw.rectangle((x, y + 30, x + 42, y + 67), fill="#24282b")
            draw.rectangle((x + 44, y + 30, x + 86, y + 67), fill="#fffdf7", outline="#cfc0a1")
            image = images.get(("fugue", role))
            if image:
                out.paste(image, (x + 13, y + 41), image)
                out.paste(image, (x + 57, y + 41), image)
            else:
                draw.text((x + 6, y + 43), "GAP", font=font, fill="#ffb58f")
                draw.text((x + 50, y + 43), "GAP", font=font, fill="#943824")
            draw.text((x, y + 74), role, font=font, fill="#29251e")
    draw.text((15, height - 35), "Fugue Icons (c) 2013 Yusuke Kamiyamane / CC BY 3.0", font=font, fill="#665c49")
    out.save(ROOT / "fugue-semantic-16px.png")


def verify(records, aliases, atlas):
    for row in records:
        if row["status"] == "gap":
            assert row["candidateFile"] is None and row["asset"] is None
            x, y = row["frame"] % 16 * 16, row["frame"] // 16 * 16
            assert atlas.crop((x, y, x + 16, y + 16)).getbbox() is None
            continue
        raw = (ROOT / row["candidateFile"]).read_bytes()
        assert digest(raw) == row["sourceSha256"]
        icon = Image.open(BytesIO(raw)).convert("RGBA")
        assert icon.size == (16, 16) and icon.getchannel("A").getextrema()[0] < 255
        x, y = row["frame"] % 16 * 16, row["frame"] // 16 * 16
        assert atlas.crop((x, y, x + 16, y + 16)).tobytes() == icon.tobytes()
    write_json("verification.json", {"verifiedOn": DATE, "canonicalCount": len(records),
        "aliasCount": len(aliases), "allMappingsAccountedFor": True, "sourcePngHashMatches": True,
        "allSelectedIconsNative16px": True, "atlasPixelsMatchSources": True,
        "gapFramesTransparentAndExplicit": True, "runtimeInstalled": False,
        "semanticAssessment": "Reviewer judgment, not user recognition testing.",
        "liveHudProof": False, "comparisonSurfaces": ["#24282b", "#f8f2e4", "#fffdf7"]})


if __name__ == "__main__":
    main()
