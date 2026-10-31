# Equipment workspace layout — 17 October 2026

The equipment menu places the native loadout and backpack side by side on wide
screens, with Trade in the backpack heading. At 900 pixels and below, the two
sections stack. Trade availability cannot add another primary layout cell.

The equipment skin uses a quiet green surface, subdued empty sockets and compact
inventory rows. Item names and properties wrap; inspection, item letters, Share,
individual Trade and independent randart links remain directly available.
Accessory racks retain native socket counts, with a compact single-socket rack.

The renderer still consumes the canonical native equipment profile. It does not
derive anatomy, equipment legality, item identity or action costs from appearance.
The shared folio renderer owns inventory search, filter state and action routing;
the paper-doll module owns profile presentation; CSS owns arrangement and density.
Older snapshots retain the legacy loadout and inventory presentation.

## Local validation

`webserver/tests/equipment-layout.cjs` checks four representative species with
Trade enabled and disabled at seven viewport widths (56 combinations). It checks
desktop panel alignment and first-item visibility, narrow-screen stacking,
horizontal overflow, Trade event arguments, action gates, long names and separate
randart links. It uses existing native-produced fixtures and matching atlases.

From `crawl-ref/source`, supply the same fixture inputs used by the native
equipment browser matrix:

```sh
EQUIPMENT_SPECIES=/path/to/starting-species.json \
EQUIPMENT_NATIVE_ROOT=/path/to/matching/native/source \
node webserver/tests/equipment-layout.cjs
```

`EQUIPMENT_NATIVE_ROOT` must contain `dat/tiles/main.png`, `player.png` and
`icons.png`. `EQUIPMENT_PROOF_DIR` optionally selects the screenshot/evidence
directory. The test requires Playwright and a local Chrome installation, as do
the existing equipment tests.

The equipment paper-doll, folio-controls and native-state browser matrix tests
provide the existing inspection, focus, filtering and anatomy compatibility
checks. These browser checks establish local UI behavior against retained native
data; they do not establish fresh native gameplay or a deployed release.
