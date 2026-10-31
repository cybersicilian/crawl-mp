# Vellum artwork

Vellum's visual identity is an arcane bookbinder: warm ivory parchment,
an antique-gold binding needle, magenta enchantment threads, and plum stone.

| Asset | Game sprite | Preserved source |
| --- | --- | --- |
| Altar | `crawl-ref/source/rltiles/dngn/altars/vellum.png` | [Altar source](vellum-altar-source.png) |
| Weave Enchantments | `crawl-ref/source/rltiles/gui/invocations/vellum_weave.png` | [Weave source](vellum-weave-source.png) |

Both game sprites are 32 by 32 pixels with transparent alpha. The sources were
generated with the built-in imagegen tool on 2026-10-23, then resized with macOS
`sips` for the native tile format. Exact prompts are saved in [prompts.json](prompts.json).

The sprites are registered in `rltiles/dc-feat.txt` and `rltiles/dc-invocations.txt`.
`tilepick.cc` selects them for Vellum's altar and Weave ability. New tile
registrations are appended to retain existing tile indices.

The source assets were visually checked at their native 32-pixel size, and their
dimensions and alpha channels were verified. No atlas regeneration, native build,
or deployment was run in this side conversation. The normal gated content build
must regenerate `feat` and `gui` atlases and generated tile headers before use.
