"""Build a self-contained review artifact from sourced art and explicit mappings."""
from collections import Counter
from html import escape
from pathlib import Path
import base64
import json

ROOT = Path(__file__).resolve().parent


def data_image(path, alt="", size=16):
    raw = base64.b64encode((ROOT / path).read_bytes()).decode()
    return f'<img width="{size}" height="{size}" alt="{escape(alt)}" src="data:image/png;base64,{raw}">'


def preview(row, scale=1):
    if not row["candidateFile"]:
        return '<span class="gap">GAP</span>'
    return data_image(row["candidateFile"], row["role"], 16 * scale)


def paired(row, scale=1):
    return '<span class="pair"><span class="dark">' + preview(row, scale) + '</span><span class="light">' + preview(row, scale) + '</span></span>'


def main():
    rows = json.loads((ROOT / "role-mapping.json").read_text())
    aliases = json.loads((ROOT / "aliases.json").read_text())
    by_role = {row["role"]: row for row in rows}
    from selection import GROUPS
    lines = [HEAD, INTRO]
    lines.append('<section id="semantic"><h2>Actual 16px / important semantic groups</h2><p>Left sample: current HUD button gradient. Right: folio paper. Images are exactly 16 CSS pixels at 100% browser zoom. No tinted, repainted or generated icons.</p>')
    for title, roles in GROUPS:
        lines.append(f'<h3>{escape(title)}</h3><div class="group">')
        for role in roles.split():
            row = by_role[role]
            lines.append(f'<div class="tile">{paired(row)}<code>{role}</code><small class="{row["status"]}">{row["status"]}</small></div>')
        lines.append('</div>')
    lines.append('</section>')
    lines.append('<section id="shortlist"><h2>Three published families / same roles and surfaces</h2><p>Each sample shows 16px then 32px (integer 2×). GAP means no suitable selected match in the inspected source pack, not a claim that every recolor was absent. Alternatives are compared independently; they are not blended into the primary family.</p><table class="comparison"><thead><tr><th>Role</th>')
    for family in ['Fugue', 'Kyrise v1.2', 'Shade']:
        lines.append(f'<th>{family}</th>')
    lines.append('</tr></thead><tbody>')
    for role in 'armour shield blade potion loot coin jewellery staff ammo scroll book spells inspect camera control zoom-in save intelligence'.split():
        row = by_role[role]
        lines.append(f'<tr><th><code>{role}</code></th>')
        for family in ['fugue', 'kyrise', 'shade']:
            path = row['candidateFile'] if family == 'fugue' else next((x['sample'] for x in row['alternatives'] if x['family'] == family), None)
            content = (data_image(path, role) + data_image(path, role + ' 2x', 32)) if path else '<span class="gap">GAP</span>'
            lines.append(f'<td><span class="pair"><span class="dark">{content}</span><span class="light">{content}</span></span></td>')
        lines.append('</tr>')
    lines.append('</tbody></table></section>')
    lines.append(LICENSES)
    lines.append('<section id="mapping"><h2>Complete proposed mapping / 112 canonical roles</h2><p>Direct means the object or conventional control is present. Metaphor means an interpretation that needs review, not proven recognition. Gaps have no PNG, no fallback and a transparent partial-atlas cell. Select a filter or type a role; results update immediately.</p><div class="filters"><label>Find role <input id="query" type="search" placeholder="armour, zoom, hero…"></label><label>Match <select id="status"><option value="">All matches</option><option>direct</option><option>metaphor</option><option>gap</option></select></label><output id="count"></output></div><table id="roles"><thead><tr><th>Role</th><th>16px HUD / folio</th><th>Original Fugue asset</th><th>Assessment</th></tr></thead><tbody>')
    for row in rows:
        asset = escape(row['asset'] or 'Unresolved')
        lines.append(f'<tr data-status="{row["status"]}"><th><code>{row["role"]}</code></th><td>{paired(row)}</td><td><code>{asset}</code></td><td><strong class="{row["status"]}">{row["status"]}</strong> · {escape(row["reason"])}</td></tr>')
    lines.append('</tbody></table><h3>24 existing aliases / 136 supported names in total</h3><p>Aliases reuse the canonical asset and inherit its gap or metaphor status. The present <code>will → shield</code> and <code>protection → armour</code> relationships remain visible; sourcing does not resolve that semantic overlap.</p><table><thead><tr><th>Alias</th><th>Canonical role</th><th>Inherited status</th></tr></thead><tbody>')
    for row in aliases:
        lines.append(f'<tr><th><code>{row["alias"]}</code></th><td><code>{row["canonical"]}</code></td><td class="{row["status"]}">{row["status"]}</td></tr>')
    lines.append('</tbody></table></section>')
    lines.append(PACKAGE)
    lines.append('<script>const query=document.querySelector("#query"),status=document.querySelector("#status"),rows=[...document.querySelectorAll("#roles tbody tr")];function filter(){let count=0;for(const row of rows){row.hidden=!(row.textContent.toLowerCase().includes(query.value.toLowerCase())&&(!status.value||row.dataset.status===status.value));if(!row.hidden)count++;}document.querySelector("#count").textContent=count+" / 112 roles";}query.addEventListener("input",filter);status.addEventListener("change",filter);filter();</script></main></body></html>')
    (ROOT / 'report.html').write_text('\n'.join(lines))
    assert len(lines) < 600
    print(f'Report: {len(lines)} authored/generated HTML lines; {len(rows)} canonical + {len(aliases)} aliases.')


HEAD = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DCSS / published 16px icon sourcing</title>
<style>
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#29251e;background:#f8f2e4}*{box-sizing:border-box}body{margin:0}main{max-width:1080px;margin:auto;padding:32px 24px}h1{font-size:30px;line-height:1.15;margin:10px 0}h2{font-size:23px;margin:0 0 12px}h3{font-size:16px;margin:20px 0 10px}p,li{line-height:1.55;max-width:92ch}section{padding:28px 0;border-top:1px solid #cfc0a1}a{color:#28596e}code{font:11px ui-monospace,monospace}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:10px 8px;border-bottom:1px solid #d9cbb0;text-align:left;vertical-align:middle}thead{background:#ede0c4}th{font-weight:600}.direct{color:#2f663f}.metaphor{color:#8c5619}.gap{color:#a82e24;font:600 10px ui-monospace,monospace}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.summary span{border:1px solid #cfc0a1;background:#fffdf7;padding:12px 18px;border-radius:5px}.pair{display:inline-flex;gap:3px;vertical-align:middle}.dark,.light{display:inline-flex;gap:9px;align-items:center;justify-content:center;min-width:34px;min-height:34px;padding:5px;border:1px solid #6e5c40;border-radius:3px}.dark{background:linear-gradient(160deg,#343535,#24282b 48%,#1b1f23);box-shadow:inset 0 1px 0 #f3dba218,inset 0 -2px 3px #0008}.dark .gap{color:#ffb58f}.light{background:#f8f2e4;border-color:#cfc0a1}img{image-rendering:pixelated;flex:none;display:inline-block;object-fit:contain}.group{display:flex;flex-wrap:wrap;gap:10px}.tile{width:128px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:8px;background:#fffdf78a;border:1px solid #cfc0a1;border-radius:4px}.tile small{font-size:10px}.filters{display:flex;gap:16px;align-items:end;flex-wrap:wrap;margin:14px 0}label{display:flex;flex-direction:column;gap:5px;font-size:13px}input,select{font:inherit;padding:8px;background:#fffdf7;color:#29251e;border:1px solid #a78f68;border-radius:3px}output{font-size:12px;padding:10px}nav{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin:22px 0}.callout{border-left:4px solid #943824;background:#fffdf7;padding:14px 18px}.comparison .dark,.comparison .light{min-width:78px;min-height:44px}.comparison td{padding:7px 4px}.muted{color:#665c49;font-size:12px}.bundle{font-size:16px}tr[hidden]{display:none}@media(max-width:740px){main{padding:20px 12px}table{display:block;overflow-x:auto}.tile{width:113px}.comparison .pair{flex-direction:column}}
</style></head><body><main>'''

INTRO = '''<p class="muted">DCSS artwork sourcing · verified 17 October 2026 · no runtime changes or purchases</p>
<h1>Published icon families, evaluated at 16px</h1>
<p class="bundle"><strong>Recommendation: Fugue 3.5.6 for the added web control family.</strong> It has the strongest verified coverage of inspect/camera/control, zoom, layout, save/exit, party controls and action slots. Its style is polished desktop pixel illustration, with native shading and antialiasing; it is a visual compromise beside fantasy game art. I do not recommend treating it as a complete 112-role replacement.</p>
<div class="summary"><span><strong>53</strong> direct matches</span><span><strong>37</strong> proposed metaphors</span><span><strong>22</strong> explicit gaps</span><span><strong>136</strong> names accounted for</span></div>
<p>For a strictly fantasy sprite family, Shade has the best clean licensing and strong equipment silhouettes, while Kyrise supplies readable outlined weapons, scrolls and accessories. Both lack most interface controls and several core statistics. No inspected family met the entire role inventory with convincing meanings. Keep one chosen primary style; do not silently patch it with unrelated packs or drawings.</p>
<p class="callout"><strong>Full-swap blockers:</strong> armour and strength, quiver, directional stairs, several equipment/property symbols and independently rotating compass layers. The download is an import-ready <em>candidate subset</em> with explicit gaps, not a deployable complete replacement.</p>
<nav><a href="#semantic">16px groups</a><a href="#shortlist">Three-family comparison</a><a href="#licenses">Creators and licenses</a><a href="#mapping">All 136 mappings</a><a href="#package">Files and verification</a></nav>
<section><h2>What the artwork actually resolves</h2><p>The Fugue zoom trio uses plus, minus and equals inside the magnifier. Inspect is a plain magnifier, camera is a camera and control is a hand, so those controls have distinct objects. Framed plus/cross/question symbols separate the three action-slot states. Brain and skull are distinct, but strength and quiver are missing rather than forced into lookalike hands or bottles.</p><p>Weak areas remain: footsteps and chain are dark on the HUD, the snowflake and ring are faint on paper, and the three flag variants have small secondary marks. “Abilities = bulb,” “skills = gavel,” “pickup = download tray,” and ownership arrows are metaphors, not self-evident fantasy actions. They need the existing labels/tooltips and recognition review. The compass cannot be replaced with Fugue's assembled compass because its needle must rotate independently. No source image was redrawn, recolored, synthesized or built by overlaying symbols.</p><p>These are isolated surface comparisons, not live-game screenshots. The HTML uses the actual <code>--hud-button</code> gradient from <code>hud-polish.css</code> and folio <code>#f8f2e4</code> from <code>tokens.css</code>. The supplementary Pillow PNGs use a flat HUD midtone; the browser-rendered PNGs use the current gradient. Native item, spell, ability, deity and rune artwork remains separate.</p></section>'''

LICENSES = '''<section id="licenses"><h2>Creators, availability and licensing</h2>
<table><thead><tr><th>Family and creator</th><th>Verified availability</th><th>Redistribution and credit</th><th>Fit</th></tr></thead><tbody>
<tr><th><a href="https://p.yusukekamiyamane.com/?lang=en">Fugue 3.5.6</a><br>Yusuke Kamiyamane</th><td>Free; 3,570 native 16×16 PNGs plus bonus assets. Author archive obtained.</td><td><a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>: copying, modification and commercial redistribution allowed with credit, source/license link and change notice. Original archive has separately licensed exceptions; none are selected. Preserve original notice.</td><td>Best control coverage; weaker fantasy specificity. 90 proposed roles, including 37 metaphors.</td></tr>
<tr><th><a href="https://kyrise.itch.io/kyrises-free-16x16-rpg-icon-pack">Kyrise's Free 16x16 RPG Icon Pack</a><br>Kyrise / Gabie Nory</th><td>Free / optional donation. Current listing: 350+ sprites, 70+ unique designs, v1.3. Compared actual v1.2 files from the <a href="https://opengameart.org/content/kyrises-free-16x16-rpg-icon-pack">author's OGA upload</a>; v1.3 was not obtained after itch returned a rate limit.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>: share, modify and redistribute commercially; credit Kyrise, link license/source, indicate changes, retain notices and add no downstream restrictions.</td><td>Clear outlines; good weapons, scrolls and accessories. Source version lacks newer armour/boots additions. No modern UI controls.</td></tr>
<tr><th><a href="https://merchant-shade.itch.io/16x16-mixed-rpg-icons">16x16 Assorted RPG Icons</a><br>Shade</th><td>Free; author archive obtained from <a href="https://opengameart.org/content/16x16-assorted-rpg-icons">OGA</a>. Packs equipment, books, chests, potions and supplies; current itch page also lists newer themed extras, not included in this inspected archive.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a>: copy, crop, modify and redistribute, including commercially. No attribution obligation; provenance credit supplied voluntarily.</td><td>Strong fantasy alternative; much greater equipment variety than UI control coverage. Native 16px sheets cropped exactly.</td></tr>
</tbody></table>
<h3>Relationship to DCSS's project license</h3><p>The repository's <code>LICENSE</code> identifies the program as GPL-2.0-or-later, most native tiles as CC0, and CC0 as the default for new artwork submissions. Keep candidate art as independently licensed PNG assets with its notices; do not relabel CC BY artwork as GPL or CC0. This recommendation is to distribute independent artwork alongside the GPL program, not to merge its terms into source-code licensing. <a href="https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software">CC explicitly permits separate game-art licensing</a>; CC BY 3.0 sections 1(b) and 4(a) preserve a collection's separate licensing. <a href="https://www.gnu.org/licenses/license-list.html#ccby">GNU also lists CC BY 4.0 as GPL-compatible</a>. Shade/CC0 best fits the stated default new-art policy; Fugue/Kyrise would need an explicit upstream policy exception if submitted upstream.</p>
<p>Distribution credits must name the artwork and author, link the source and exact license version, preserve notices and identify arrangement/cropping changes. The provided <a href="ATTRIBUTION.txt">ATTRIBUTION.txt</a> and <a href="licenses/fugue-original-notice.txt">original Fugue notice</a> cover the local candidates. No attribution requirement was waived and no paid license was purchased.</p>
<h3>Paid packs investigated</h3><ul>
<li><a href="https://shikashipx.itch.io/shikashis-600-icon-pack">Shikashi's 600+ Icon Pack — Matt Firth (shikashipx)</a>: <strong>£2.00 GBP minimum</strong>, verified on the creator page. 607 icons in native 16×16 and 32×32, including strength, brain, armour, conditions and a magnifier. Strongest paid fantasy lead. The page permits project use/editing with credit but supplies no explicit raw-source redistribution grant or standard license; open-repository redistribution remains unresolved. No paid files obtained or used in comparisons. The older free pack is 32×32 and CC BY 4.0; do not transfer that license to the paid pack or downsample it as a native-16 substitute.</li>
<li><a href="https://cyangmou.itch.io/pixel-rpg-icons-adventure-1616">Pixel RPG Icons Adventure 16×16 — Thomas Feichtmeir (Cyangmou)</a>: <strong>$4.99 USD minimum</strong>. Creator permits free/commercial projects and edits but prohibits asset redistribution/resale. Excluded from this open-source import package; a purchase alone would not resolve repository rights. No purchase or files obtained.</li>
<li><a href="https://7soul.itch.io/7souls-rpg-graphics-pack-1-icons">7Soul's RPG Graphics — Icons</a>: <strong>$15.00 USD minimum</strong>; 1,700+ native 16px assets. Creator listing specifies <strong>CC BY-ND 4.0</strong>. The no-derivatives restriction is unsuitable for an unrestricted reusable art pipeline; not selected. Do not rely on conflicting third-party CC0 labels for older 7Soul icons.</li>
</ul><p>Also screened: <a href="https://kenney.nl/assets/roguelike-rpg-pack">Kenney's Roguelike/RPG pack</a>, free CC0, 1,700 16px tiles. Obtained and inspected, but its terrain/building emphasis and sparse relevant symbols made it weaker than the three finalists. AI-generated/code-rendered packs and monochrome vector families were excluded from this shortlist.</p></section>'''

PACKAGE = '''<section id="package"><h2>Review and import package</h2><p><a href="IMPORT.txt">Import notes</a> · <a href="role-mapping.json">112-role mapping</a> · <a href="aliases.json">24 aliases</a> · <a href="provenance.json">Archive URLs and SHA-256 provenance</a> · <a href="verification.json">Verification result</a> · <a href="import-candidates/manifest.json">Partial-atlas manifest</a></p><p>The candidate folder contains 90 original-name PNGs and 90 role-name copies, plus a 256×112 atlas matching the existing 16-column canonical order. Every selected Fugue PNG is hash-identical to the author's file. All selected images are 16×16; atlas pixel comparisons pass; 22 transparent gap frames are explicitly declared. Alternatives are kept in their own comparison directory. Source archives and original licenses are retained.</p><p>37 metaphors require meaning review. The package sets <code>complete=false</code> and <code>fallback=null</code>; it must not silently replace the runtime atlas. A later integration can reuse the current frame order, alias table and icon wrapper while preserving tooltips, accessibility labels, exact stat values, compact layouts and native game artwork. No control behavior, deployment or runtime implementation was modified by this sourcing work.</p><p>Reproduce with <code>python3 prepare.py</code> (Pillow required), then <code>python3 build_report.py</code>. Art identity and coverage checks are bounded evidence. This is not a live-game render, accessibility certification or measured recognition study.</p></section>'''


if __name__ == '__main__':
    main()
