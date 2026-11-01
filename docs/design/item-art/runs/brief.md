You are generating raster art for Dungeon Crawl Stone Soup. Generate images only.

Your working directory is the art folder. `prompts.json` holds one verbatim prompt per asset under `prompts`.
`references/native-style-reference.png` shows enlarged native sprites for style only. Never copy its subjects.

For each asset named below:
1. Call the built-in image_gen tool once, using that asset's prompt verbatim, requesting a square image with a genuinely transparent background.
2. Copy the generated file unchanged from $CODEX_HOME/generated_images to `sources/<asset>.png`.
3. If image_gen fails, or the result has no real transparency, retry that asset once only.

Rules:
- Use only the built-in image_gen tool. Do not use scripts/image_gen.py, any API key, or any other image service.
- Do not resize, recolour, crop, clean up or otherwise post-process any image.
- Write only inside this folder. Do not run builds, tests or git. Do not touch any other checkout.
- Do not start subagents.

When finished, write `runs/<run-name>-log.json` mapping each asset to
{"source": path, "sha256": hex, "width": n, "height": n, "has_transparency": bool, "revised_prompt": text or null, "attempts": n, "error": text or null}.
Your final message lists each asset with ok or failed.

Run name: {RUN}
Assets: {ASSETS}
