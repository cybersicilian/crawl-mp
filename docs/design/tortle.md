# Tortle species

Tortles are large, cold-blooded melee fighters whose growing shell compensates
for limited equipment. Their movement takes 13 aut on ordinary ground and in
water; other actions retain their ordinary timing. They can swim in deep water
without swimming speed or evasion bonuses.

The shell grants `6 + floor(12 * (XL - 1) / 26)` AC: +6 at XL1 and +18 at XL27.
It is an anatomy mutation, so body-changing forms suppress both its armour and
its movement penalty through the existing mutation rules. Cold-bloodedness uses
the existing cold-exposure behaviour, including protection from positive cold
resistance.

The species uses standard large-body equipment rules without a small-torso
exception. Robes, skins, troll leather, dragon scales, hats, cloaks, and suitable
shields remain available. Conventional fitted body armour, gloves, boots, and
ordinary helmets do not fit. Large weapons and large rocks follow native size
rules. The initial HP modifier is +10%; stats and aptitudes live in
`crawl-ref/source/dat/species/tortle.yaml`.

## Shell retraction and dash

`Retract into Shell` is available from XL1. It spends one ordinary action,
increases the shell's own AC contribution by 50%, and halves evasion and movement
speed. Movement directions take ordinary single steps at twice the normal
movement delay (26 aut instead of 13 for an unmodified Tortle). `Shell Dash`
is an explicit targeted action in the native ability menu and quickbar.
Retraction becomes `Emerge from Shell` while active. Emerging takes an action;
other physical commands and other abilities emerge automatically.

A dash follows one of the eight compass directions without a range cap,
stopping before solid terrain, closed doors, impassable/unsafe habitat, or a
creature. Impacts count as friendly fire: friends and neutral creatures can be
damaged after the native attack confirmation; co-op heroes use the party's
friendly fire setting, with confirmation when damage is enabled.
The first creature receives an automatically hitting, armour-reduced physical
impact; even a killing hit ends the dash. Damage is
`2d(3 + floor(XL/2) + floor(Unarmed Combat) + 2*distance)`, where distance is
the actual number of tiles crossed plus the final impact. Weapons do not
contribute. A dash takes one ordinary action, irrespective of distance, and
automatically brings the Tortle out of its shell. An adjacent wall with no
movement costs no turn and leaves the shell retracted.

A successful dash has five standard turns (50 aut) of recovery after its own
action resolves. The native `-Dash` status shows the remaining recovery, and
the ability and quickbar expose the same blocked reason. Retraction and
emergence do not reset the cooldown. Ordinary movement remains available during
recovery, with the shell stance's movement penalty applying if retracted again.
There is no additional post-dash slow effect. Blocked or cancelled attempts that never
move or strike a creature cost no HP, time, or recovery.

Each successful roll also causes nonlethal recoil damage:
`min(5, 1 + floor(tiles_crossed / 4) + creature_impact)`, with `creature_impact`
equal to one for a collision and zero otherwise. Recoil ignores armour and
cannot reduce the rolling player's HP below one. It never charges a companion.

The ability menu and quickbar use native targeting reticles to preview a
compass ray, highlighting the last visible traversable square or first visible
creature. Off-axis targeting is rejected. Unknown terrain, invisible creatures
and trap outcomes are not disclosed by the preview; rolls can still continue
beyond sight. Movement keys remain ordinary movement commands.

WebTiles shows a short pixel-dust trail and a wider burst on creature impact.
The native engine publishes actual path cells separately for each hero's
visibility and floor. The bounded `traversal-effects.js` renderer follows camera
and zoom changes, respects reduced motion, captures no input, and clears effects
on cleanup or floor changes. Animation adds no gameplay delay. Console and local
tiles use the existing native overlay animation contract.

`shell-animation.js` replaces a visibly retracted hero's dungeon doll with a
dedicated shell sprite, compresses the standing doll into the shell, and animates
its emergence. Idle shell motion and spinning along the native dash path use no
game turns. Reduced motion keeps the still shell pose and suppresses transitions.
The source sprite is `webserver/game_data/static/sprites/tortle-shell.png`.

Native movement warnings, clouds, traps, barbs, fear/mesmerisation and location
effects remain in force. Teleports, shafts and newly acquired restraints stop
the dash. Cancelling a warning after travelling spends the dash's action.
Nets, constriction, immobility and confusion prevent a directed dash. Changing
form clears retraction; losing shell anatomy suppresses its effects.

Additional resistances and breathing timers remain outside this version.
Balance still needs ordinary campaign play, especially long-corridor escapes,
cold-using enemies, repeated rolls, and late dragon-armour stacking.

## Snapping retaliation

From XL1, `MUT_RETALIATORY_BITE` grants a one-in-three chance to bite a visible,
adjacent hostile creature after it lands a melee hit. A given enemy can trigger
at most one bite per player action, using the native reprisal tracker. Misses
and shield blocks do not qualify; armour absorbing all damage still counts as
a hit. The Tortle must survive the attack and remain able to act, unconfused,
and outside its shell. Body-changing forms suppress the anatomy mutation.

The bite spends no action and uses the native physical auxiliary attack path,
including Strength, Fighting, slaying, and target AC. Its base damage is
`6 + floor(XL / 2) + floor(Unarmed Combat / 2)`. It gains no weapon brand and
does not grant extra bites during the Tortle's ordinary attacks. Friendly and
neutral creatures and co-op players never provoke it. Existing Tortles gain
the innate mutation on loading; existing mutation and auxiliary IDs stay fixed.
The mutation can be granted independently to other species.

## Reuse and compatibility

`MUT_ARMOURED_SHELL` is independent of the species: its AC and movement effects
use mutation queries rather than Tortle-specific combat branches. Water access,
cold-bloodedness, equipment fitting, backgrounds, and catalogues use existing
contracts. Species and mutation enums are appended to preserve existing IDs.

`shell.cc` owns retraction, impact scaling and collision traversal, using the
existing movement and combat contracts. It depends on `MUT_ARMOURED_SHELL`, not
the Tortle species ID, so another consumer with that anatomy gains the same
capability. Retraction is a native per-player saved property, preserving
independent co-op state without adding or reordering save enums. New ability
IDs are appended, preserving older ability bindings. Shell and dash icons reuse
existing native tiles.

Dash recovery appends `DUR_SHELL_DASH_COOLDOWN` to the existing duration enum.
The native length-prefixed duration serialization preserves prior IDs and
defaults the new duration to zero when loading older saves. Cooldown ticking,
status descriptions and save persistence reuse the standard duration system;
the path-particle transport and renderer are independent of species identity.

The species menu and player doll use the same transparent 32x32 base sprite,
`crawl-ref/source/rltiles/player/base/tortle.png`. Character catalogue and tile
atlases must be regenerated with the matching native build.

## Verification

The dash polish passed 17,637 assertions in 43 native cases on an isolated
Ubuntu release based on `20261019T014658Z-content-pack`, with wizard mode disabled.
Coverage includes recovery, nonlethal recoil, reticles, visible/invisible
companions, automatic emergence, half-speed ordinary steps and quivered dashes
without nearby enemies. The checks exposed and fixed a shared visibility
assumption that treated other player observers as monsters.

All 36 Tortle backgrounds passed native creation checks. Runtime-user previews,
76 backend tests, seven particle/animation cases and the frame-rendering
regression passed. A disposable browser session verified targeting and cancel,
particles, shell rendering, recoil, five-turn cooldown persistence across
save/resume, automatic emergence and an ordinary 26-aut shell step. All five
changed game assets matched their source hashes. Retained checkpoint metadata
remained compatible. These are staged Linux results; public deployment evidence
is recorded separately. The overloaded local host was not used for heavy work.

Traversal events reuse native paths and per-player visibility; durations reuse
native ticking and save serialization. The generic particle renderer can serve
other traversals, while shell artwork, recoil and cooldown rules stay in the
shell-specific modules. The older results below describe earlier iterations.

The bite update passed 17,441 assertions across 37 native cases covering the
retaliation mechanics, shell abilities, anatomy, equipment and party trading.
The nine bite cases cover the trigger rate, per-attacker cap, damage scaling,
misses, shield blocks, incapacitation, transformations, lethal bites, companion
ownership and save loading. Native creation checks passed for all 36 Tortle
backgrounds. A disposable localhost browser session saved a Tortle using the
previous executable, resumed that actual save with the updated executable,
verified the new innate bite mutation, and saved again without JavaScript
errors. These checks used an isolated native build; they are local evidence.

The shell update passed 14,573 assertions across 28 native test cases covering
shell movement, impacts, friendly fire, co-op damage ownership, transformations,
saved state, quivered firing, Tortle anatomy, equipment and party trading. Tests
used an isolated native object snapshot; the shell test translation unit was
compiled without optimisation to avoid a slow rebuild on the shared machine.
The gameplay modules retained their normal optimisation.

A fresh disposable localhost browser session verified retraction, the increased
AC, ability/status display, saving and resuming while retracted, and a directional
roll taking exactly one turn. It reported no JavaScript errors. The browser
regression is `webserver/tests/tortle-browser.cjs`; native shell cases are in
`catch2-tests/test_shell.cc` and share the `[tortle]` and `[shell]` filters.

The broader `[party-session]` filter has two independent failures at
`test_party_session.cc:169` and `:205`: cloud placement/timing and floor-clock
advancement. Both reproduce without running shell tests. These results do not
establish campaign balance or hosted gameplay acceptance.

The original species rollout was verified as follows:

The WebTiles build succeeded. The Tortle and shared equipment suites passed
14,145 assertions across 13 cases, including all current species and forms.
Native creation checks passed for all 36 available Tortle backgrounds, with
deterministic stats, legal starting equipment, and correct companion anatomy.
The existing native character-preview regression suite also passed.

A disposable localhost WebTiles session verified selection, the species guide,
the new sprite, native dungeon startup, and saving and resuming the Tortle with
its innate shell intact. Browser checks reported no JavaScript errors. These
are local integration results; campaign balance remains untested.

Reproduce with `catch2-tests-executable '[tortle],[equipment-profile],[equipment-matrix]'`,
`webserver/tests/tortle-native.py --binary <matching-build>/crawl`, and
`webserver/tests/tortle-browser.cjs` against an isolated `util/qa_server.py`
runtime with the generated character catalogue and matching tile atlases.

## Sprite provenance

The retracted shell sprite was made with the built-in imagegen tool, using the
existing Tortle as the edit reference. Its alpha bounds were cropped, sampled
to 28x22 with nearest-neighbour resizing, and placed in a transparent 32x32 tile
at `(2, 8)`. The integrated asset is
`crawl-ref/source/webserver/game_data/static/sprites/tortle-shell.png`.
The final generation prompt was:

> Use case: precise-object-edit. Asset type: a Dungeon Crawl Stone Soup native
> pixel-art player sprite. Edit the reference Tortle into its FULLY RETRACTED
> shell pose: all head, arms, legs, hands and feet tucked completely inside,
> leaving a squat domed tortoise shell resting on the ground, seen from the same
> front three-quarter / slightly top-down game perspective. Preserve the
> reference shell's dark olive-green and earthy-brown identity with tan edge
> plates, dark outline, discrete coarse pixels, and small 32-by-32 native
> game-tile visual language. One single shell, no character limbs or head, no
> gear, no face, no dust or shadow outside the sprite. The shell should occupy
> roughly 26 pixels wide and 21 pixels high in a centered 32x32 transparent tile,
> grounded near the bottom with ample transparency above. Make the dome's
> segmented hexagonal scutes highly readable and asymmetrical enough that
> spinning is obvious. Deliver a square image with truly transparent background,
> ideally a 32x32 sprite or a clean nearest-neighbor enlarged 32x32 pixel grid.
> No smooth gradients, no antialiasing, no text, no border, no extra objects.
> This shell replaces only the dungeon sprite while the Tortle is tucked inside.

The original standing Tortle sprite was created as follows:

Created using the built-in imagegen tool, with `frog_m.png` as a style and
framing reference. The generated transparent image was cropped to its alpha
bounds and resized with nearest-neighbour sampling to a 30-pixel-high sprite
inside a 32x32 transparent native tile. The generation prompt was:

> Create one new playable TORTLE base sprite for Dungeon Crawl Stone Soup,
> using the reference ONLY as a guide to the existing tiny player-sprite pose,
> framing, and pixel-art language. A tortle is a large, stocky, anthropomorphic
> turtle, standing upright on two short legs, with two empty hands, olive-green
> reptilian skin, a tan segmented belly plastron, a broad dark brown/olive domed
> shell visible behind its shoulders and sides, a small turtle beak, no hair,
> no tail prominent. Readable shell silhouette is essential. Full body
> front-facing with a slight three-quarter angle as in classic DCSS player
> paperdoll sprites; feet near the bottom, head near the top, empty space at the
> sides for weapon/shield overlays. No weapons, no shield, no clothes, no hat.
> Match a native 32-by-32 game tile: use a deliberately coarse 32x32 pixel grid,
> sharp discrete square pixels, dark outline, limited earthy 12-color palette,
> no antialiasing, no smooth gradients, no lighting glow, no backdrop, no ground
> shadow. Deliver a square canvas as a nearest-neighbor enlarged 32x32 pixel
> tile with true transparent background and centered subject, exactly one
> sprite, no text, no labels, no grid lines.
