# Complete effect artwork

Every native duration, conditional player status, bane and displayed creature
condition has an explicit art assignment in `util/effect-art-map.json`.
The generated catalogue uses symbolic native identities, not numeric enum values
or broad name fragments. Native TAG34 and TAG35 builds send those identities.
Exact legacy labels remain supported; an unrecognized future effect gets a
question mark rather than an unrelated icon.

Artwork comes from the existing DCSS `rltiles` spell, ability, invocation,
mutation, condition, item and creature illustrations. Refer to
`crawl-ref/source/rltiles/license.txt` and `crawl-ref/docs/develop/tiles_creation.txt` for
the original attribution and terms.
This atlas contains no purchased Raven artwork. It is independent of the
licensed general HUD atlas.

Related states deliberately share their illustrated subject, with a distinct
clock, shield, curse, crossed-out, borrowed-power, severity or charging marker.
Banes retain visible names and XP recovery information. Timed effects retain
their standard-turn countdowns. Art never determines effect mechanics or tone.

Rebuild using the project's Python with Pillow, under the shared heavy-work gate:

```sh
python util/generate-effect-icons.py
python util/generate-effect-icons.py --verify
```

The packer rejects missing identities, duplicate identities and empty artwork.
It trims transparent margins and uses nearest-neighbor integer enlargement for
small native overlays. It records source hashes, crop bounds and scale in
`manifest.json`; the atlas URL is content-addressed. Old atlases can remain for
cached clients. Check in the generated catalogue and key headers with the art
map, generator, atlas and manifest.

To add an effect, add its native declaration and review an explicit source and
state marker in the map before regeneration. Missing coverage fails verification
instead of silently assigning generic artwork. The shared SVG renderer retains
the same framing, accessible descriptions and turn-free input behavior across
hero cards, the character inspector and creature banners.
