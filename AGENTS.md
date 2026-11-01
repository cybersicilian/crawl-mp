# Local resource coordination

Before a heavy local build, native or broad test run, asset regeneration,
packaging phase, or browser/gameplay batch, check whether
`$HOME/Documents/Codex/work/host-heavy/policy.json` exists. If present, read it
and follow its current gate script, script hash, fixed state directory,
reservation contract, and dispatch priorities.

The user's shared-host rule permits only one heavy local build or test phase
at a time across Entry, DCSS, Multibox, and MCEco. Do not start work outside that
gate, bypass an occupied reservation, or clear another owner's reservation.
Prepare an exact source and resource binding while waiting for fair dispatch.
Light inspection, source/art preparation, and genuinely remote CI may continue.

# Asset delivery

Treat compression and server load as requirements for every asset, including
high fidelity artwork. Preserve source artwork and provenance. Prepare smaller
lossless image representations and Brotli/gzip text representations with
`crawl-ref/source/webserver/util/prepare-assets.py`, then run its `--check`
against both `webserver/static` and `webserver/game_data/static` after final
asset generation. The Docker build performs these steps after the native build.
Keep compression at build time; do not encode images on HTTP requests. Retain
only representations that reduce transfer size, verify decoded pixels/alpha
and text bytes, request optional graphics only when a selected mode needs their
tile or portrait, and preserve cache
validation and uncompressed compatibility fallback. Measure transfer sizes
before claiming a reduction. Generated sidecars and manifests are rebuildable;
original assets remain the canonical sources.

Top-level stylesheet order belongs in each static root's
`stylesheet-bundles.json`. The same preparation command expands supported local
imports and produces dependency-bound CSS bundles before compression. Install
TinyCSS2 with the build dependencies (`python3-tinycss2` in Docker); no parser is
needed by the HTTP runtime. Keep original styles and their relative resource
paths intact. Missing, stale, unsupported or corrupt bundles must fall back to
the ordered source styles. Use `--public-root URL_PREFIX=PATH` when a build maps
shared assets differently from the default `/static/` root.

Optional artwork image tags use content-versioned `data-src` URLs and the
`data-asset-optional` marker. The marker keeps failed or slow optional art out of
the required game-asset readiness barrier; native art remains the loading and
failure fallback. New catalog families inherit the shared request mechanism.
