# Equipment paper doll and native anatomy

The equipment folio presents the inspected hero's current native appearance,
usable slots, item fit and equipment limitations. Species names and mutation
descriptions never determine equipment permissions in browser code.

## System map

`player-equip` / item slot graph / current form / native doll
→ `equipment_profile_json()`
→ live party snapshot and no-save character preview
→ `equipment-paperdoll` + `native-tile-art`
→ slot selection and inventory filtering
→ existing `inv_item_describe` native management.

The profile serializer isolates inspection RNG and requires the caller to select
the correct native player context. It does not equip items, save, or advance time.
The party snapshot and character preview already establish their hero contexts.

## Profile version 1

`equipment_profile` is optional on older party snapshots. Its nested version is
independent of `snapshot_version`; existing consumers can ignore the addition.

| Field | Meaning |
| --- | --- |
| `species`, `size`, `form`, `hands`, `feet` | Native current identity and anatomy labels. |
| `portrait` | Ordered native equipped doll layers, including form and mutation appearance. |
| `unarmed_attack` | Optional native attack name, including anatomy without a weapon slot. |
| `slots` | Every real slot type, including zero-capacity and flexible slots. |
| `items` | Inventory identities, native artwork and native fit verdicts. |
| `restrictions` | Partial slot restrictions; currently the native hard-helmet probe distinguishes hats from helmets. |

Slot identity is `type:index`, not a translated label or inventory letter. A slot
has a capacity, label, available alternative slot types and state:

| State | Meaning |
| --- | --- |
| `empty` | An available slot without an item. |
| `equipped` | The principal slot of an equipped item. |
| `occupied` | Another slot consumed by the same item, such as a two-handed weapon or multi-slot armour. |
| `melded` | An item is merged into the current form and its equipment effects are inactive. |
| `blocked` | A slot exists but the current form prevents equipment there. |
| `unavailable` | Native slot capacity is zero; the native reason explains why. |

Occupied and melded slots retain the owning inventory identity. Shared occupancy
is inspectable rather than falsely displayed as a free slot. Coglin offhands,
poltergeist armour, form-specific support slots, extra rings and extra amulets
come from the native slot graph and counts.
An optional `support_only` flag identifies secondary weapon support sockets.
Their inventory filters use native `required_slots`, so fortress crab support
can show two-handed weapons without treating support as a primary item slot.

For equipment items, `fits` and `reason` come from `can_equip_item(item, true)`.
They describe anatomy, current form and religion, including size, hard helmets,
missing hands, claws and multi-slot requirements. This is **not** permission to
perform an action: curses, replacement, inscriptions, turn readiness and warnings
still belong to the native management flow. `slot_types` identifies primary
compatible target slots; `required_slots` records other slots the item consumes.

Artwork uses atlas rectangles and clipping from the same native build rather
than guessed browser tile indexes. Item layers come from `get_tiles_for_item`,
the native inventory menu's composition: base artwork, known brands and armour
egos, curse/equipment backgrounds, chaotic markers and melded mesh. Native
identification rules decide which properties are visible. The active game's
`main`, `player` and `icons` images must match that native build. An optional
layer `texture` overrides the artwork's atlas for overlays such as melded mesh.
Missing artwork is labelled unavailable, with no invented humanoid silhouette.
The renderer is shared by portraits, loadout, backpack, HUD inventory and item
quick slots. HUD art resolves against the specific hero's inventory profile;
identification and atlas-load changes refresh both the HUD and quick slots.
Identified items retain their own randomized base sprite beneath the native
identification badge, including co-op items that reuse another subtype's badge
and items identified without global type knowledge. Catalogue entries continue
to hide appearances for unknown types.

## Interaction and layout

The equipment menu uses a dark equipment frame, recessed item sockets and native
artwork. The inspected hero's AC, EV and SH appear beneath the portrait when
those values are present in the snapshot. Up to three jewellery sockets sit
beneath the portrait; larger capacities use a full-width rack. Additional
flexible slots are grouped by native slot type and label, with six haunted
armour sockets sharing one desktop row. Missing anatomy is represented by
compact explanation chips, not nonexistent empty body slots. Chips support
hover and keyboard focus. Current form and body size remain visible.
Native unarmed attack names remain visible on empty weapon sockets. Heroes
without a weapon socket, or with a weapon blocked or melded by a form, show
the native unarmed attack name beneath the portrait when it is available.

An occupied slot opens native inspection directly. An empty slot selects that
slot type and immediately filters the adjacent pack, clearing unrelated search
and category filters. The visible slot-filter control clears the selection.
Items that target that slot remain visible even if they do not fit; their native
reason explains the restriction. Slot selection is kept per hero and dropped if
a mutation or form change removes the selected capacity.
If the focused socket disappears, keyboard focus moves to inventory search.

On desktop the board and backpack sit alongside each other. Backpack tiles
display item artwork, the inventory letter, name, kind and equipped state. Each
tile is one inspection button, with sharing and randart links alongside it as
separate actions. Search, category selection and slot selection are immediate
and stay scoped to the inspected hero. Native management still handles equipment
costs, restrictions and consequential warnings.
Shift-clicking gear in the loadout, backpack or HUD unequips it; Shift-clicking
an unequipped item drops its entire stack on the current tile. A second click is
required to drop gear after removing it. Native delays, melding restrictions,
inscriptions and dangerous-removal/drop warnings still apply. The folio returns
after native prompts finish, preserving the hero, filters and surviving focus.
The shared `workflow-actions` adapter sends explicit `unequip` or `drop` actions
through `inv_item_use` only when the engine advertises `inventory_secondary`.
The engine checks hero/item identity and current equipped state, so stale clicks
cannot re-equip an item or drop gear that is still worn. Older engines retain
inspection and normal use without advertising the new shortcut.
Gear classification uses the native equipment flag, including Coglin gizmos.
Melded items stay in the Equipped filter and show `Melded · inactive` in the
backpack while retaining native inspection access.

Narrow viewports stack the two areas without introducing extra navigation. The old
compact loadout remains the fallback when profile data is absent.

## Verification entry points

- `webserver/tests/inventory-secondary.cjs`: Shift-click on the HUD, backpack,
  native slots and legacy loadout; filter/focus return, warnings and action gates.
  Uses `EQUIPMENT_PROFILES` from the no-save native preview check below.
- `webserver/tests/inventory-secondary-native.cjs`: disposable localhost gameplay
  covering unwield then drop, delayed armour removal then drop, floor contents,
  and stale remove/drop rejection. Set `WEBTILES_URL` to an isolated QA server.
- `catch2-tests/test_equipment_profile.cc`: horns, claws, hooves, missing hands,
  large-body fit, shared occupancy, melding and gameplay RNG isolation.
- `catch2-tests/test_item_tiles.cc`: base sprites across individual and type
  identification for potions, scrolls, jewellery, wands and staves, plus artefact
  art and unknown catalogue entries.
- `catch2-tests/test_equipment_matrix.cc`: native species and form enumerations,
  equipment-related mutation levels, slot-granting artefacts, multi-slot items
  and selected interactions. `DCSS_EQUIPMENT_MATRIX` exports newline-delimited
  native fixtures for browser validation. These are controlled player fixtures.
- `webserver/tests/equipment-profile-native.py --binary <crawl> --output <json>`:
  native no-save previews for human, minotaur, octopode, naga, coglin,
  poltergeist, draconian, felid, troll and spriggan; deterministic profile data.
  `--all-species` covers every selectable species in the native catalogue;
  derived Draconian colours are covered by the native matrix.
- `webserver/tests/equipment-paperdoll.cjs`: browser checks using those native
  profiles and matching atlases; artwork, slot filtering, focus restoration,
  mutation explanations, flexible slots and responsive layout.
- `webserver/tests/equipment-matrix.cjs`: every exported case and starting-species
  preview, including native slot identity/state, Gear classification, support
  filtering, melded labels, disappearing sockets and responsive overflow.
- `webserver/tests/equipment-variation-native.cjs`: disposable localhost wizard
  gameplay for mutation/removal, form/unmeld, slot-granting equipment and native
  species transitions.
- `webserver/tests/inventory-art-native.cjs`: disposable localhost gameplay;
  pixel parity with native inventory menus for brands, armour egos, ammunition
  and staves, consistent item art across views and identification changes,
  including all ten co-op potion, jewellery and scroll aliases.
- Existing `folio-controls.cjs` and `companion-rpg-stats.cjs`: legacy snapshot
  compatibility and existing management/inspector behavior.

Native builds and their generated atlases must be released together with the
browser modules. Local static, controlled-browser, native-preview and fresh
native gameplay validation are distinct evidence and should be reported as such.
Existing game processes must save and resume with the rebuilt executable to
produce the complete item layers; reconnecting the browser alone retains the
old native snapshot format.
