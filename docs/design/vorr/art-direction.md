# Vorr art and asset specification

Vorr's visual identity centers on a split drop, a collecting basin, and the circulation between wounds, ground, and worshipper. The imagery should make fresh blood look usable and spent blood look inert while preserving the dungeon's floor, actors, and targeting information.

[Design](README.md) · [Visual review](index.html) · [Asset inventory](assets.json)

## Concept assets

Four generated concept PNGs are included. They were generated with the built-in imagegen tool; the exact prompts are in [prompts](prompts/). The altar and sigil are transparent source masters. They are larger than native game tiles and require a deliberate pixel-art cleanup before atlas registration. Shrinking the concepts does not establish production quality. The current direction uses the simplified v2 basin; v1 remains as an exploratory baseline.

| Concept | File | Intended use |
| --- | --- | --- |
| Full direction board | [vorr-art-direction-v1.png](assets/vorr-art-direction-v1.png) | Review identity, altar silhouette, dungeon relationship, and rite motifs together. |
| Altar source master | [vorr-altar-concept-v1.png](assets/vorr-altar-concept-v1.png) | Reference for a compact one-cell altar and its idle frames. |
| Simplified altar study | [vorr-altar-concept-v2.png](assets/vorr-altar-concept-v2.png) | Current low-basin direction, generated against native Trog, Makhleb, and Uskayaw references. Still requires native pixel cleanup. |
| Split-drop source master | [vorr-sigil-concept-v1.png](assets/vorr-sigil-concept-v1.png) | Reference for the religion mark, passive status, and invocation family. |

The full board contains concept studies for Rupture, Blood Communion, and the Great Letting. Those panels are not independent exported icons or an animation atlas.

## Palette and material

| Role | Colour | Treatment |
| --- | --- | --- |
| Deep outline | `#151116` | Blackened plum; keep outer silhouettes distinct. |
| Basin stone | `#383238` | Heavy basalt, large cracks, few readable planes. |
| Dry stain | `#4b1721` | Matte oxblood, no glints or active contour. |
| Blood body | `#8d1d32` | Deep crimson mass. |
| Fresh highlight | `#d94950` | Short sharp reflections and outward splashes. |
| Worn rim | `#e6d9bb` | Pale mineral stone, not bones or skulls. |
| Binding iron | `#77707a` | Dull clamps that explain the basin's structure. |

Use chunky pixel clusters, black outlines, and stepped shading. Features use an upper-left light and the slightly elevated frontal perspective of the existing altars. Blood is liquid with weight, drops, and directional streaks. It must not read as red fire, smoke, or an aura covering every enemy.

## Mark and altar

The mark is one droplet opened by a narrow transparent vertical cleft, with three short outward spatters. The drop must remain recognizable without shading, at 16 pixels, and when shown in one colour. Keep the central cleft and at least two spatters visible at the smallest size. The sigil concept master needs less internal shading at that scale.

The current altar direction is a low collecting basin, a dull worn rim, two readable front channels, a simple low foot, and one suspended drop. Avoid the earlier multiple masonry steps and dense metal fittings. Keep the central drop small enough that the altar occupies one cell without hiding neighbors. The v2 concept is simpler but has more logical pixels than a final 32-pixel sprite should need.

An optional four-frame idle loop moves only the hanging drop, the inner ripple, and the channel glints. The altar's collision and visual footprint never change. Worship interaction remains the native altar interaction.

## Required native assets

| Family | Target | Count | Visual task |
| --- | --- | --- | --- |
| Religion mark | 32×32 PNG, safe 28×28 content | 1 | Simplified split drop and three spatters. |
| Altar | 32×32 RGBA PNG | 1 initial; 4 if animated | Basin, suspended drop, clipped channels. |
| Rupture invocation | 32×32 PNG, safe 28×28 content | 1 | A central drop with a short radial tear. |
| Red Passage invocation | 32×32 PNG, safe 28×28 content | 1 | Two small pools connected by one arcing red thread; a clear arrival drop. |
| Communion status | 8×8 or 10×10 overlay | 1 | A split drop returning toward a small central point; no tiny human drawing. |
| Communion detail icon | 32×32 PNG | 1 | Rivulets returning toward a small torso silhouette. |
| Great Letting invocation | 32×32 PNG, safe 28×28 content | 1 | Three short blood blades rising inward from a pool. |
| Fresh blood overlay | 32×32 RGBA PNG | 3 density variants | Sparse, normal, and rich deposits; floor remains visible. |
| Fading blood overlay | 32×32 RGBA PNG | 3 density variants | Interrupted edge and fewer highlights, readable without colour. |
| Spent stain | Existing native cosmetic blood | Reuse | No new resource or brightness implied. |
| Wound and burst | 32×32 effect frames | 4 each | Directional spray and bounded outward impact. |
| Communion effect | 32×32 effect frames | 4 | Fine returning rivulets; suppress at full HP and limit frequency. |
| Great Letting effect | 32×32 effect frames | 5 | Pools gather, blades rise, converge, strike, and collapse. |
| Red Passage effect | 32×32 effect frames | 4 at each endpoint | Sink, traverse, emerge, and short arrival spray; no persistent free blood trail. |
| Portrait faith plinth | Existing 60×68 SVG envelope | One theme; ranks 0–6, penance, unknown | Trough pedestal, split seals, red channels, compact altar setting. |
| Targeting presentation | Native overlays plus blood highlight | Reuse and extend | Selected deposits, affected cells, friendlies, and real cost. |

Production assets should live under the established `rltiles/dngn/altars`, `rltiles/gui/invocations`, and relevant effect/overlay directories. This design package deliberately keeps its high-resolution concepts outside those atlas inputs.

## Visual sequences

**Rupture:** a brief inward pull toward an existing wound, a narrow pale-red impact, then a short radial spray if the target dies. A survivor gets a small outward tear rather than a full-body explosion. Bloodless targets receive only the targeting rejection and no animation.

**Communion:** one or two thin rivulets return from a genuinely wounded blood-bearing enemy toward the worshipper's chest. Regeneration on a puddle uses a restrained underfoot pulse. Do not cover the player doll, health information, or equipment silhouette. At full health, keep only the ordinary fresh blood presentation.

**Red Passage:** blood folds around the worshipper's feet at the origin, the silhouette disappears, a matching fold opens at the chosen endpoint, then a short outward spray resolves. Preview both endpoints and the arrival radius. The motion does not paint new fuel along the path, reveal hidden terrain, or make bloodless bystanders bleed.

**Great Letting:** selected pools briefly pull inward, rise as distinct blades, strike simultaneously, and collapse. New death spray follows the strike. When a bloodless enemy is struck, show incoming external blades, an ordinary physical impact, and dry stone or bone fragments. Never show red discharge originating from its body.

Animation time is presentation only. It does not add a channeling turn or delay input after the normal action resolves. Reduced-motion mode uses a single impact frame and the final deposits. Any future audio is short and wet, with a dull stone-basin resonance for the large rite; no audio assets are supplied in this pass.

## Review at game scale

Compare each asset at native size and at integer zoom against ordinary stone, dark stone, and a visually busy floor. Test invocations with their native border and disabled state. Review occupied blood tiles with a small enemy, a large enemy, the player, and target overlays.

Freshness must be conveyed by edge shape and highlights as well as hue. Cosmetic wall blood is allowed but cannot resemble a selectable fuel source. A dry golem standing in someone else's puddle remains visibly dry. The scene must still read with all animation disabled.

Do not approve the large source masters as game sprites. The next art deliverable is a native 32-pixel altar and the three invocation icons, followed by density overlays and effects once the gameplay preview exposes their actual footprints.

## Portrait faith plinths

The plinth is the fork's faith treatment under and around each hero portrait, separate from the dungeon altar's low stone base. Its existing renderer uses a 60×68 SVG envelope around the 42×50 portrait, with a pedestal, arch, carved seals, fittings, side motifs, crown, inner sanctuary, and high-favor details. Use that vector system for the frame and a native transparent altar sprite for the inset; a generated plinth bitmap would discard the existing states and scale behavior.

Vorr's proposed pedestal is a shallow collecting trough with a narrow central spillway. The arch has a squared upper rim and inward notches. Split-drop seals flank the inset altar; fine red grooves run down the side ornaments toward the trough. The high-favor treatment adds restrained inner channels and drop-shaped jewels rather than large flames, horns, or a screen-filling blood aura.

The [plinth study](index.html#plinths) uses source-matched SVG classes, material definitions, dimensions, and layer thresholds with a declarative [theme record](plinth-theme.json). It is a design-only adapter and does not register Vorr in the live game. Its inset is the reduced v2 concept as a placeholder; the final inset needs real native pixels.

Nine static SVG frame exports are recorded in the [asset inventory](assets.json), including [favor five](assets/vorr-plinth-5.svg), [penance](assets/vorr-plinth-penance.svg), and [unavailable favor](assets/vorr-plinth-unknown.svg). They contain the frame and pedestal without a hero or inset sprite. Their material styles and internal gradients are self-contained, so the proposed frame can be inspected at its native 60×68 size.

| State | Treatment | Meaning |
| --- | --- | --- |
| Favor 0 | Bare dark arch, trough base, shallow seals | Worship established; no extra feature inferred. |
| Favor 1 | Split-drop carving | Rupture milestone in the rules. |
| Favor 2 | Small fittings | Favor presentation only. |
| Favor 3 | Red side channels | Communion and Red Passage milestone. |
| Favor 4 | Restrained crown carving | Favor presentation only. |
| Favor 5 | Inner channels | Great Letting milestone. |
| Favor 6 | Two small drop jewels and outer accent | Favor presentation only. |
| Penance | Dim inlays, fractured pedestal, warning | Existing penalty status; no invented blood resource state. |
| Unavailable favor | Dashed uncertain arch, no invented tier or motes | The server has not provided favor. |

Keep compass and name clear. Decorative paths never capture pointer input. Preserve the badge's accessible name, tooltip, keyboard activation, and one-step route to faith and abilities. Reduced motion removes motes while leaving carvings readable. Blood supply and Communion activity use their own indicators and never repaint favor rank.
