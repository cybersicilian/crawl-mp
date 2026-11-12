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

## Handoff policy (account-wide)

Any repository you work in must stay in a state where another agent (Claude, Codex, Gemini, Antigravity, or a human) can pick up the work cold, with no access to the conversation that produced it. Two things make that true, and you maintain both:

1. **`HANDOFF.md` at the repository root.** The single entry point for whoever comes next. It holds: what the project is and where its pieces live (code, data, services, deploy targets); the current state, under a dated stamp; how to set up, run, test and deploy; the open work, each item linked to its GitHub issue; a **triage** list ranking what to pick up next (lanes for agents, a human, and blocked; one issue per line with its size and what done looks like); known issues and gotchas; recent decisions and why; and this handoff policy itself, in full, so the instruction survives the handoff.
2. **GitHub issues for every open piece of work.** Anything unfinished, deferred, newly discovered, or decided against for now gets an issue with enough context to act on without the conversation: what, why, where in the code, and what done looks like. Close issues when the work lands and reference them from the commit or PR. The open-work list in `HANDOFF.md` points at issues; it never carries work that has no issue.

**When to update:** at the end of any session or turn that changed code, state, configuration, or plans, before the final commit or push. Refresh the current-state stamp, add or close issues, and record decisions made. If a repository has no `HANDOFF.md`, create it and the issues as your first act there. If it has no GitHub remote, say so in `HANDOFF.md` and keep an `## Open work` list there until one exists.

**Triage:** when you start, take the top unclaimed item in the agents' lane unless you were given a task, and claim it (`fork_handoff` with `claim=#N`, or `ej handoff fork --claim N`) so no other agent takes it. When you finish, re-rank: drop what you closed, add what you found, move items between lanes when that changed (a human is needed, something blocks it). Keep it short: the next handful, not the whole backlog; the rest stays in Open work.

**Capture, don't chase:** when the engineer voices a side thought mid-task ("oh, also…"), record it with `capture_idea` (the eng-journal MCP tool, or `ej capture`) and stay on the current goal, unless they say to do it now. When you drift from the goal yourself (more than a few tool calls on something the goal does not need), open a hole first with `hole_open` (the detour, the point to return to, a budget of calls), and close it with `hole_close` and its outcome: fixed-in-place, filed (with the issue or card it went to), abandoned (with why) or became-goal. When a hole reaches its budget ("Hole '…' is at its budget"), decide then: extend it (`hole_tick` with `extend`), file it and return, or abandon it.

**Propagation:** every `HANDOFF.md` you create or update contains this policy, so an agent that reads only the repository learns to keep maintaining it. Mirror it in the repository's `AGENTS.md` (read by Codex, Gemini CLI and others) and have the repository's `CLAUDE.md` import that file with `@AGENTS.md`.

Hand-offs move like a Zed Delta thread: **fork** when you start (`ej handoff fork`, or the MCP tool `fork_handoff`), which records your base commit and shows what was merged since and who else is working here; **merge** a delta when you finish (`ej handoff merge`, `merge_handoff`): what changed, what comes next, what you decided, the issues you opened and closed; or **discard** a fork that leaves nothing to hand on. Work that stops unfinished is **handed on** (`ej handoff pass <id> --note …`, `pass_handoff`): the fork stays open with a note saying where it stopped, and the next agent **resumes** it (`ej handoff fork --resume <id>`, `fork_handoff resume=`) instead of starting over. Start from the brief (`ej handoff brief`, `get_handoff brief=true`): what to pick up, who is working here, and this file's sections with their line ranges, so you read the section you need. Before merging, rewrite Current state to what is true now; history belongs in Deltas, not in the stamp. Claim the triage item you take when you fork (`claim=#N`); a merge that closes an issue drops its triage line.
