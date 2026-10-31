"""Create a private fantasy-art evaluation, without modifying artwork/runtime.

Requires Pillow. All review images and licensed candidates stay in ignored
private/. Mapping metadata and this reproducible selection code contain no art.
"""
from collections import Counter
from hashlib import sha256
from html import escape
from pathlib import Path
import json
import re

from PIL import Image
from selections import RAVEN, SHIKASHI, GROUPS

ROOT = Path(__file__).resolve().parent
PRIVATE = ROOT / "private"
REPO = ROOT.parents[1]
RAVEN_ROOT = PRIVATE / "raven-free/Free - Raven Fantasy Icons/Separated Files/16x16"
SHIKASHI_ROOT = PRIVATE / "Shikashi's 600+ Icon Pack"
SHEET = Image.open(SHIKASHI_ROOT / "16x16.png").convert("RGBA")


def specs(text):
    return {p[0]: p[1:] for p in (line.split("|") for line in text.strip().splitlines())}


def json_file(path, rows):
    path.write_text("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n")


def main():
    source = (REPO / "crawl-ref/source/webserver/static/scripts/item-properties.js").read_text()
    names = re.findall(r'"([^"]+)"', re.search(r"var spriteNames = \[(.*?)\];", source, re.S)[1])
    block = re.search(r"var iconAliases = \{(.*?)\n    \};", source, re.S)[1]
    aliases = {a or b: c for a, b, c in re.findall(r'(?:"([^"]+)"|(\w+)):\s*"([^"]+)"', block)}
    assert len(names) == 112 and len(aliases) == 24
    all_specs = {"raven": specs(RAVEN), "shikashi": specs(SHIKASHI)}
    records = []
    for family, selections in all_specs.items():
        assert set(selections) <= set(names)
        (PRIVATE / "candidates" / family).mkdir(parents=True, exist_ok=True)
    for frame, role in enumerate(names):
        row = {"role": role, "frame": frame}
        for family, selections in all_specs.items():
            choice = {"status": "gap", "asset": None, "candidate": None,
                "reason": "No suitable asset verified in the inspected source files. Premium coverage not assumed."}
            if role in selections:
                location, status, reason = selections[role]
                target = PRIVATE / "candidates" / family / f"{role}.png"
                choice = {"status": "direct" if status == "D" else "metaphor", "reason": reason,
                    "candidate": str(target.relative_to(PRIVATE)), "sourcePixelsChanged": False}
                if family == "raven":
                    member = RAVEN_ROOT / f"fa{location}.png"
                    raw = member.read_bytes()
                    image = Image.open(member).convert("RGBA")
                    target.write_bytes(raw)
                    choice.update(asset=f"fa{location}.png", sourceSha256=sha256(raw).hexdigest())
                    assert target.read_bytes() == raw
                else:
                    x, y = map(int, location.split(","))
                    box = (x * 16, y * 16, x * 16 + 16, y * 16 + 16)
                    image = SHEET.crop(box)
                    image.save(target)
                    choice.update(asset="16x16.png", cell=[x, y], crop=list(box),
                        sourceSha256=sha256((SHIKASHI_ROOT / "16x16.png").read_bytes()).hexdigest())
                    assert Image.open(target).convert("RGBA").tobytes() == SHEET.crop(box).tobytes()
                assert image.size == (16, 16) and image.getbbox() is not None, (family, role, location, image.size)
                choice["candidateSha256"] = sha256(target.read_bytes()).hexdigest()
            row[family] = choice
        records.append(row)
    json_file(ROOT / "role-mapping.json", records)
    json_file(ROOT / "aliases.json", [{"alias": alias, "canonical": canonical} for alias, canonical in aliases.items()])
    summary = {family: dict(Counter(row[family]["status"] for row in records)) for family in all_specs}
    (ROOT / "coverage.json").write_text(json.dumps(summary, indent=2) + "\n")
    report(records, aliases, summary)
    json_file(ROOT / "verification.json", [{"canonical": 112, "aliases": 24,
        "allSelectedImagesNative16px": True, "ravenOriginalBytesPreserved": True,
        "shikashiCropPixelsPreserved": True, "runtimeChanged": False,
        "allLicensedArtIgnoredByGit": True, "semanticRecognitionTest": False,
        "sourceSheetSize": list(SHEET.size), "ravenSourceCount": len(list(RAVEN_ROOT.glob('*.png')))}])
    print(json.dumps(summary))


def sample(choice, large=False):
    if not choice["candidate"]:
        return '<span class="gap">GAP</span>'
    sizes = [16, 32] if large else [16]
    return ''.join(f'<img src="{choice["candidate"]}" width="{size}" height="{size}" alt="{escape(choice["asset"])}">' for size in sizes)


def pair(choice, large=False):
    content = sample(choice, large)
    return f'<span class="pair"><span class="dark">{content}</span><span class="light">{content}</span></span>'


def report(records, aliases, summary):
    by_role = {row['role']: row for row in records}
    lines = [HEAD, INTRO]
    lines.append('<div class="summary">')
    for family, counts in summary.items():
        lines.append(f'<div><strong>{family.capitalize()}</strong> · {counts.get("direct",0)} direct / {counts.get("metaphor",0)} metaphors / {counts.get("gap",0)} gaps</div>')
    lines.append('</div><section id="comparison"><h2>Actual 16px + integer 2× / same dark HUD and light folio</h2><p>Each cell: dark 16/32px, then light 16/32px. These are actual downloaded PNGs or exact native 16px crops. No repainted, generated or reconstructed artwork. Raven examples come from the 2,192-icon free evaluation archive, not an unseen premium ZIP.</p><table><thead><tr><th>Role</th><th>Raven Fantasy</th><th>Your Shikashi pack</th></tr></thead><tbody>')
    for role in 'armour evasion shield strength intelligence dexterity blade helmet boots gloves cloak inventory spells poison reflection inspect save exit'.split():
        row = by_role[role]
        lines.append(f'<tr><th><code>{role}</code></th><td>{pair(row["raven"], True)}</td><td>{pair(row["shikashi"], True)}</td></tr>')
    lines.append('</tbody></table></section>')
    lines.append('<section id="groups"><h2>Workflow coverage at 16px</h2><p>Each role has Raven above Shikashi. Each pair shows the HUD and folio. Labels remain necessary for the proposed metaphors.</p>')
    for title, roles in GROUPS:
        lines.append(f'<h3>{title}</h3><div class="group">')
        for role in roles.split():
            row = by_role[role]
            content = ''.join(f'<div>{pair(row[family])}<small>{family.capitalize()} · <span class="{row[family]["status"]}">{row[family]["status"]}</span></small></div>' for family in ['raven', 'shikashi'])
            lines.append(f'<div class="tile"><code>{role}</code>{content}</div>')
        lines.append('</div>')
    lines.append('</section>')
    lines.append(LICENSES)
    lines.append('<section id="mapping"><h2>All 112 roles + 24 aliases</h2><p>These assessments concern actual inspected source assets. Direct means the object/control exists, not that an unlabelled icon passed user recognition testing. Reused assets and arrow-only stairs are identified explicitly.</p><label>Filter role or meaning <input type="search" id="query" placeholder="zoom, hero, armour…"></label><table id="mapping-table"><thead><tr><th>Role</th><th>Raven asset and assessment</th><th>Shikashi cell and assessment</th></tr></thead><tbody>')
    for row in records:
        lines.append(f'<tr><th><code>{row["role"]}</code></th>')
        for family in ['raven', 'shikashi']:
            c = row[family]
            cell = ' / cell ' + str(c['cell']) if c.get('cell') else ''
            lines.append(f'<td>{pair(c)} <code>{escape(c["asset"] or "Unverified")}{cell}</code><p><strong class="{c["status"]}">{c["status"]}</strong> · {escape(c["reason"])}</p></td>')
        lines.append('</tr>')
    lines.append('</tbody></table><h3>Existing aliases</h3><p>Aliases inherit the canonical selection and any gap. The runtime alias relationships remain unchanged.</p><div class="aliases">')
    for alias, canonical in aliases.items():
        lines.append(f'<code>{alias} → {canonical}</code>')
    lines.append('</div></section>')
    lines.append('<section><h2>Files and provenance</h2><p>The ignored <code>private/candidates/</code> folders contain exact native-size evaluation assets for both families. <a href="../role-mapping.json">role-mapping.json</a> records original Raven filenames, exact Shikashi crop rectangles, status and source hashes. <a href="../aliases.json">aliases.json</a> covers all existing aliases. <a href="../verification.json">verification.json</a> records source pixel checks. No paid pack was bought by this chat. Your original Shikashi ZIP remains untouched.</p><p>These pages are an isolated art review, not a running-game rendering. The dark samples use the current HUD button gradient and the folio samples use <code>#f8f2e4</code>. Current game icons, interactions, labels, accessibility, values, native art, runtime implementation and deployment were not changed.</p></section>')
    lines.append('<script>const input=document.querySelector("#query");input.addEventListener("input",()=>{for(const row of document.querySelectorAll("#mapping-table tbody tr"))row.hidden=!row.textContent.toLowerCase().includes(input.value.toLowerCase());});</script></main></body></html>')
    (PRIVATE / 'report.html').write_text('\n'.join(lines))
    assert len((PRIVATE / 'report.html').read_text().splitlines()) <= 600


HEAD = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fantasy icon families / DCSS 16px review</title><style>
:root{font-family:system-ui,sans-serif;color:#29251e;background:#f8f2e4;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1040px;margin:auto;padding:28px 24px}h1{font-size:31px;line-height:1.15}h2{font-size:22px}h3{font-size:16px}p,li{line-height:1.5;max-width:94ch}section{border-top:1px solid #cfc0a1;padding:20px 0}a{color:#28596e}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:7px;border-bottom:1px solid #d9cbb0;text-align:left;vertical-align:middle}thead{background:#ede0c4}code{font:11px ui-monospace,monospace}img{image-rendering:pixelated;object-fit:contain;flex:none}.pair{display:inline-flex;gap:4px;vertical-align:middle}.dark,.light{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-width:31px;min-height:31px;padding:5px;border:1px solid #6e5c40;border-radius:3px}.dark{background:linear-gradient(160deg,#343535,#24282b 48%,#1b1f23);box-shadow:inset 0 1px 0 #f3dba218,inset 0 -2px 3px #0008}.light{background:#f8f2e4;border-color:#cfc0a1}.gap{font:600 10px ui-monospace,monospace;color:#a82e24}.dark .gap{color:#ffb58f}.direct{color:#2f663f}.metaphor{color:#8c5619}.summary{display:flex;gap:12px;flex-wrap:wrap;padding:14px 0}.summary div,.callout{padding:12px;background:#fffdf7;border:1px solid #cfc0a1}.callout{border-left:4px solid #943824}.group{display:flex;gap:10px;flex-wrap:wrap}.tile{width:148px;padding:8px;border:1px solid #cfc0a1;background:#fffdf780}.tile>div{margin-top:10px}.tile small{display:block;font-size:10px;margin-top:4px}.aliases{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.muted{color:#665c49;font-size:12px}label{display:block;font-size:13px;margin:12px 0}input{padding:8px;border:1px solid #a78f68;background:#fffdf7;color:#29251e}tr[hidden]{display:none}#comparison .dark,#comparison .light{min-width:78px;min-height:44px}#mapping-table td p{margin:5px 0 0;font-size:11px}@media(max-width:700px){main{padding:16px 10px}table{display:block;overflow:auto}.aliases{grid-template-columns:1fr 1fr}}
</style></head><body><main>'''

INTRO = '''<p class="muted">DCSS · revised fantasy-only sourcing · 17 October 2026 · local evaluation</p><h1>Raven Fantasy is the stronger coherent family</h1>
<p><strong>Recommendation: use <a href="https://clockworkraven.itch.io/raven-fantasy-icons">Raven Fantasy Icons by Clockwork Raven</a> as the primary family if you want broader fantasy coverage.</strong> Its equipment, body statistics, status symbols, grimoire, flags, direction arrows, save and door controls share one outlined native 16px style. The current premium tier is <strong>$35 USD</strong>; the creator's Full Collection is listed from that pack page at <strong>$35.50 USD</strong>. No purchase has been made here.</p>
<p><strong>Your Shikashi pack is a good smaller alternative.</strong> I inspected the supplied ZIP directly. Its native 16px sheet has an attractive warm palette, distinct muscle/brain/armour/shield art, a real knapsack, magnifier, mirror, runestone and equipment. It lacks more of the general control vocabulary. Use either as one primary family; combining the two is not the recommendation.</p>
<p>For Raven I obtained and inspected the creator's <strong>2,192-icon free evaluation archive</strong>. The premium pack advertises 8,000+ icons and additional themed expansions, but uninspected premium files are not counted as verified matches. “Free” is the evaluation/personal-use tier, not an unrestricted art license. The current native-16 family is the product linked above; the separate <em>HD</em> line was not downsampled into this comparison.</p>
<p class="callout"><strong>Remaining gaps:</strong> neither inspected set provides verified zoom +/−/reset, camera/control ownership controls, panel move/resize/layout or a matched compass rose and independent needle. Up/down arrows are metaphors for stairs, not actual staircase icons. Raven still lacks a verified quiver and some equipment/property symbols in the free archive. Exact gaps appear below rather than being filled with generated art.</p>
<p>Coverage counts include the existing 112-role inventory, including redundant roles. Some related roles deliberately reuse one stock symbol; the mapping calls those out. A bigger icon count alone does not prove more useful coverage. This comparison prioritizes fantasy appearance and recognizable stats/equipment over desktop UI metaphors.</p>
<p><a href="#comparison">16px comparison</a> · <a href="#groups">Workflow groups</a> · <a href="#license">Price and license</a> · <a href="#mapping">All 136 names</a></p>'''

LICENSES = '''<section id="license"><h2>Paid options, licenses and project use</h2><table><thead><tr><th>Family</th><th>Verified price / source</th><th>Terms and limitation</th></tr></thead><tbody>
<tr><th>Raven Fantasy<br>Clockwork Raven / Caio</th><td><a href="https://clockworkraven.itch.io/raven-fantasy-icons">$35 premium</a>; free personal-use/evaluation tier obtained. Pack page also lists the full collection at $35.50.</td><td>The <a href="https://drive.google.com/file/d/126AltXMSr2suWyDWGpm4i7G90Zth3qtz/view">creator-linked license v1.2</a> permits project use, edits and unlimited projects, allows team access while working with the license holder, and makes attribution optional. It prohibits separate asset redistribution and restricts downstream reuse in mods. This is not an open-art/GPL-compatible asset license. The creator states paid acquisition is needed for commercial use. A purchase alone does not grant public source-asset redistribution.</td></tr>
<tr><th>Shikashi's 600+ Icon Pack<br>Matt Firth / shikashipx</th><td><a href="https://shikashipx.itch.io/shikashis-600-icon-pack">£2 GBP</a>; supplied by you. Actual archive inspected, 607 advertised icons including recolors.</td><td>Included text permits use and editing for commercial games/projects with credit to Matt Firth (shikashipx). It does not state a standard open license or an explicit grant to redistribute raw assets. Do not borrow CC BY terms from the different older free 32px pack. Public repository redistribution remains unverified.</td></tr>
<tr><th>1000+ Fantasy RPG Icons<br>finalbossblues</th><td><a href="https://finalbossblues.itch.io/icons">$6 USD</a></td><td>Broader low-cost fantasy alternative covering UI, skills/statuses, equipment and items, with full-color and muted Time Fantasy variants. Creator permits commercial use and edits but excludes direct redistribution; no credit required. Publisher previews reviewed; paid source files were not obtained. Not counted in the exact per-role coverage or native-source proof here.</td></tr>
<tr><th>Cyangmou 16px series<br>Thomas Feichtmeir</th><td><a href="https://cyangmou.itch.io/pixel-fantasy-rpg-icons-skills-status-1616">Skills &amp; Status: $4.99 USD</a>; linked Ultra Bundle $54.99.</td><td>Coherent professionally painted fantasy series with dedicated skills/status and equipment packs. Project use and edits allowed; raw asset redistribution prohibited. Artwork is richer and softer than Raven/Shikashi; no paid sources obtained. It does not demonstrate a complete match for DCSS's specialized web controls.</td></tr>
</tbody></table><p><strong>Integration boundary:</strong> DCSS code is GPL-2.0-or-later and the repository normally accepts new art as CC0. The restricted packs are not a grant to relicense artwork under GPL or CC0. Their source files, derived candidates and embedded review stay in ignored <code>private/</code>; this sourcing task performs no runtime import or publication. Public raw-asset distribution would need compatible permission. Normal licensed project use and open artwork redistribution are distinct.</p><p>Suggested credits: “Raven Fantasy Icons — Clockwork Raven (Caio), project license” and, for Shikashi use, “UI icons — Matt Firth (shikashipx), Shikashi's 600+ Icon Pack.” No icons were trained on, generated, redrawn, recolored or composited from invented parts.</p></section>'''


if __name__ == '__main__':
    main()
