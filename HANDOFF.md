# dcss: HANDOFF

**Last updated:** 2026-11-12 13:00 MST, by Composite (`ej handoff init`): created in the standard form; every section still to fill.

**Start here:** `ej handoff brief` (or the MCP tool `get_handoff` with `brief=true`) is the short way in: what to pick up, who is working here, and where each section of this file is. Without those tools, read Current state, Triage and Known issues and gotchas, then the issue you take.

## 1. Handoff policy

Any repository you work in must stay in a state where another agent (Claude, Codex, Gemini, Antigravity, or a human) can pick up the work cold, with no access to the conversation that produced it. Two things make that true, and you maintain both:

1. **`HANDOFF.md` at the repository root.** The single entry point for whoever comes next. It holds: what the project is and where its pieces live (code, data, services, deploy targets); the current state, under a dated stamp; how to set up, run, test and deploy; the open work, each item linked to its GitHub issue; a **triage** list ranking what to pick up next (lanes for agents, a human, and blocked; one issue per line with its size and what done looks like); known issues and gotchas; recent decisions and why; and this handoff policy itself, in full, so the instruction survives the handoff.
2. **GitHub issues for every open piece of work.** Anything unfinished, deferred, newly discovered, or decided against for now gets an issue with enough context to act on without the conversation: what, why, where in the code, and what done looks like. Close issues when the work lands and reference them from the commit or PR. The open-work list in `HANDOFF.md` points at issues; it never carries work that has no issue.

**When to update:** at the end of any session or turn that changed code, state, configuration, or plans, before the final commit or push. Refresh the current-state stamp, add or close issues, and record decisions made. If a repository has no `HANDOFF.md`, create it and the issues as your first act there. If it has no GitHub remote, say so in `HANDOFF.md` and keep an `## Open work` list there until one exists.

**Triage:** when you start, take the top unclaimed item in the agents' lane unless you were given a task, and claim it (`fork_handoff` with `claim=#N`, or `ej handoff fork --claim N`) so no other agent takes it. When you finish, re-rank: drop what you closed, add what you found, move items between lanes when that changed (a human is needed, something blocks it). Keep it short: the next handful, not the whole backlog; the rest stays in Open work.

**Capture, don't chase:** when the engineer voices a side thought mid-task ("oh, also…"), record it with `capture_idea` (the eng-journal MCP tool, or `ej capture`) and stay on the current goal, unless they say to do it now. When you drift from the goal yourself (more than a few tool calls on something the goal does not need), open a hole first with `hole_open` (the detour, the point to return to, a budget of calls), and close it with `hole_close` and its outcome: fixed-in-place, filed (with the issue or card it went to), abandoned (with why) or became-goal. When a hole reaches its budget ("Hole '…' is at its budget"), decide then: extend it (`hole_tick` with `extend`), file it and return, or abandon it.

**Propagation:** every `HANDOFF.md` you create or update contains this policy, so an agent that reads only the repository learns to keep maintaining it. Mirror it in the repository's `AGENTS.md` (read by Codex, Gemini CLI and others) and have the repository's `CLAUDE.md` import that file with `@AGENTS.md`.

Hand-offs move like a Zed Delta thread: **fork** when you start (`ej handoff fork`, or the MCP tool `fork_handoff`), which records your base commit and shows what was merged since and who else is working here; **merge** a delta when you finish (`ej handoff merge`, `merge_handoff`): what changed, what comes next, what you decided, the issues you opened and closed; or **discard** a fork that leaves nothing to hand on. Work that stops unfinished is **handed on** (`ej handoff pass <id> --note …`, `pass_handoff`): the fork stays open with a note saying where it stopped, and the next agent **resumes** it (`ej handoff fork --resume <id>`, `fork_handoff resume=`) instead of starting over. Start from the brief (`ej handoff brief`, `get_handoff brief=true`): what to pick up, who is working here, and this file's sections with their line ranges, so you read the section you need. Before merging, rewrite Current state to what is true now; history belongs in Deltas, not in the stamp. Claim the triage item you take when you fork (`claim=#N`); a merge that closes an issue drops its triage line.

## 2. What this is

A multiplayer fork of Dungeon Crawl Stone Soup (upstream merge base `3688bb285`). It adds a WebTiles co-op layer: a websocket lobby with party rooms, seats and invites, a saved-game library, character previews, a 3D view and a reworked UI. Production runs at https://dcss.iancaltabiano.com on a GCE VM behind Caddy.

## 3. Where things live

- Engine (C++): `crawl-ref/source/` (co-op input boundary in `tileweb*.cc`, `party*.cc`).
- Web server (Python/Tornado): `crawl-ref/source/webserver/webtiles/`; client JS in `webserver/static/scripts/` and `webserver/game_data/static/`.
- Deployment: `deploy/` (Caddyfile, `install_release.sh`, `webtiles.yml`, `package_source.py`) and `deploy_gcloud.sh`. VM `dcss-coop-server`.
- Diagnostics and release notes: `docs/`. Never commit smoke-test account files or server logs there (`.gitignore` covers `private*.json`, `docs/diagnostics/**/*.log`, `diagnostic-*.json`, `docs/diagnostics/**/deploy/`).
- Security reports: private GitHub security advisories on this repo (the repo is public, and issues are disabled). Never put vulnerability details in public text.

## 4. Current state

**2026-11-12.** `master` is at `42974c9a3`. Branch `claude/security-advisories-2026-11-12` (worktree `.claude/worktrees/security-advisories`, local only, not pushed) adds eight commits that fix the nine draft security advisories from the 2026-11-12 audit; each commit names its advisory. The tracking advisory is GHSA-gr7v-896p-wrff, and its checklist records each fix commit.

- Web server unit tests: 592 run; everything passes except `activity_pacing_test` (9 failures) and the `auth_test`/`util_test` import errors (they need `pytest`). Those fail the same way on `42974c9a3`.
- `tileweb.cc` passes a syntax-only compile. No full native build, browser run or production deploy has been done for this branch.
- `master`, the main checkout's working tree and production are three different code lines. Do not assume `master` is what is deployed.

## 5. Triage

Ranked: take the top unclaimed line in the agents' lane, and claim it when you fork (`fork_handoff claim=#N`, `ej handoff fork --claim N`) so no other agent takes it. A merge that closes an issue drops its line; `ej handoff triage --sync` drops closed issues and lists open ones nobody has triaged.

**Agents can pick up:**
_None: issues are disabled on this repo, so work is tracked in Open work below._

**Needs a human:**
1. Decide whether to push `claude/security-advisories-2026-11-12` publicly before deploying, or land and deploy it first. S. Done when the branch is on `master` and deployed, and each advisory is closed or published.

**Blocked or waiting:**
_None yet._

## 6. Set up, run, test, deploy

- Web server tests (light; run from `crawl-ref/source/webserver`): `~/Documents/Projects/dcss/.venv/bin/python -m unittest discover -s webtiles -p '*_test.py' -t .`
- Heavy work (native builds, broad test runs, packaging, browser batches) goes through the shared host gate: read `$HOME/Documents/Codex/work/host-heavy/policy.json` first (see `AGENTS.md`).
- Deploy: `deploy/install_release.sh` on the VM (it runs `caddy validate`). Follow the production deploy recipe in the agent memory `dcss-production-deploy-recipe`.

## 7. Open work

Issues: https://github.com/cybersicilian/crawl-mp/issues

Issues are disabled on this fork, so open work is listed here.

- Land and deploy the security fixes on `claude/security-advisories-2026-11-12`, then close or publish advisories GHSA-5jh6, GHSA-6cg2, GHSA-2cr9, GHSA-6wf6, GHSA-5wfq, GHSA-pqmw, GHSA-cfxg, GHSA-h7jj and GHSA-qjrr, and the tracking advisory GHSA-gr7v. The details are in the private advisories.
- Add an owner-facing button for join requests. Today the owner answers them in chat with `/party accept|deny <name>`.
- Set the login cookie from the server as `HttpOnly; Secure; SameSite=Lax` (it is set in JavaScript, `client-auth.js`), and add a Content-Security-Policy once the inline scripts are audited.

## 8. Known issues and gotchas

- The repo is public: put security detail only in private advisories.
- `activity_pacing_test`, `auth_test` and `util_test` already fail on `master`.
- A spectator who presses "Join co-op" on a public game now sends the owner a join request, not a seat (see Decisions).

## 9. Decisions

- 2026-11-12: Drop-in co-op stays, but it needs the owner's consent. Seats go directly only to existing reservations, the launched room's roster, or holders of a private room's current invite. Anyone else's join is a request the owner answers in chat. This was chosen over turning drop-in off, because the lobby advertises drop-in.
- 2026-11-12: The server derives party room ids (`room-<host>`, or the host's current room) and ignores ids sent by the client.
- 2026-11-12: The web client may send `set_option` only for the four `action_panel_*` options, and only from the owner. The server enforces this and the engine checks it again.
- 2026-11-12: Character previews need a session and are rate-limited per account and per IP. Cached previews are not counted.

## 10. Deltas

<!-- composite:deltas · newest first; Composite rewrites this block on every merge (ej handoff merge / merge_handoff) -->
<!-- /composite:deltas -->

## 11. Updating this document

Before your final commit of any session that changed code, config, state or plans:

1. Rewrite **Current state** to what is true now, and refresh the **Last updated** stamp.
2. Reconcile **Open work** with the issues: open one for anything new, close what landed; re-rank **Triage** (`ej handoff triage --sync` drops closed issues and lists untriaged ones).
3. Add what you decided, and why, to **Decisions**.
4. Merge your delta (`ej handoff merge <fork id> --summary …`, or `merge_handoff`).
5. Leave **Handoff policy** intact.
