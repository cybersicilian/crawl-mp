# Vorr design review checks

Revision two, 18 October 2026. The current design restores Red Passage at three stars, uses a simplified altar study, compares native altar sprites, and supplies portrait faith plinth studies. The initial concept assets remain available as a baseline.

- Four generated concept PNGs are recorded with dimensions, SHA-256 hashes, generation method, and exact prompts. The new altar has real alpha transparency. Three native altar references were copied unchanged.
- Nine static SVG frame exports parse successfully, use a 60×68 view box and dimensions, and resolve their gradients internally without file URLs. They omit the hero and the temporary altar inset.
- The review page renders at desktop width 1440 and mobile width 390 without horizontal overflow. Every image loads, and no browser page errors occur. Desktop, mobile, plinth, reference comparison, and critique screenshots were inspected.
- The plinth gallery renders ranks zero through six, penance, and unavailable favor. Decoration captures no pointer events, and every altar link has an accessible name. Reduced motion hides particles. These are local concept checks, not live HUD acceptance.
- The embedded theme matches the canonical JSON record. All new HTML, CSS, JavaScript, and SVG files remain below 600 lines.

These checks describe the earlier concept review. Native registration, provisional 32-pixel exports, faith integration and gameplay implementation have since been added; see [native prototype status](implementation-status.md). Optical cleanup, ordinary-run balance and crowded-scene effect review remain open.

The browser tool's file-URL policy blocked refreshing the already-open in-app tab. The revised files are saved; the user can reload that tab. Browser checks above used a separate local rendering before that policy rejection.
