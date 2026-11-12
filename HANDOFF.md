# crawl-mp (DCSS co-op fork): HANDOFF

**Last updated:** 2026-11-12 12:55 MST, by claude-code: crawl-mp (checkout ~/Documents/Projects/dcss, worktree dcss-wt-secrets): commit 207d25472d on branch claude/remove-committed-secrets (base master 42974c9a3) deletes the 196 leaked files from GHSA-5jh6-274c-3x62 (**/priv… Earlier hand-offs are under Deltas and in `ej handoff log`.

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

A fork of Dungeon Crawl Stone Soup (DCSS) with co-op multiplayer, lobbies, extra content and a reworked WebTiles client, served publicly at https://dcss.iancaltabiano.com. The repository `cybersicilian/crawl-mp` is **public**: anything committed here is published.

## 3. Where things live

- `crawl-ref/source/`: the native game (C++) and `crawl-ref/source/webserver/` (Python/Tornado WebTiles server, static client, browser tests).
- `deploy/`: release bundling (`prepare_release.py`, `package_source.py`), `live_smoke.cjs`, deploy tests; `deploy_gcloud.sh` at the root drives the Google Cloud VM. `deploy/README.md` is the deployment runbook.
- `docs/`: design notes, release evidence and diagnostics archives. Diagnostics are archived evidence, not live code.
- Production: one GCP VM (`dcss-coop-server`) behind Caddy. Account database at `/var/lib/dcss/accounts.db3` on the VM.
- Local checkout: `~/Documents/Projects/dcss` (other sessions work on feature branches there).

## 4. Current state

**2026-11-12.** The branch `claude/remove-committed-secrets` (based on `master` @ `42974c9a3`) removes the committed QA account files (`**/private*.json`), the `docs/diagnostics/**/*.log` server logs and the `docs/diagnostics/**/diagnostic-*.json` captures (196 files). It also adds `.gitignore` rules for `private*.json`, `.account.json`, `*.log`, `docs/diagnostics/**/deploy/` and `docs/diagnostics/**/diagnostic-*.json`. Deploy tests pass: 15 run, OK.

**Still unhealthy:** the leaked QA passwords remain valid on production until the accounts are disabled, and they remain in git history (see Triage, needs a human). Nine other scan findings are open as draft security advisories under the epic GHSA-gr7v-896p-wrff.

## 5. Triage

Ranked: take the top unclaimed line in the agents' lane, and claim it when you fork (`fork_handoff claim=#N`, `ej handoff fork --claim N`) so no other agent takes it. A merge that closes an issue drops its line; `ej handoff triage --sync` drops closed issues and lists open ones nobody has triaged.

**Agents can pick up:**
1. GHSA-qjrr-c6vf-8v7c Logout endpoint lacks CSRF protection — S — done when logout requires the CSRF token/same-origin check.
2. GHSA-2cr9-8rm5-wvv8 Co-op guests can send owner/server-only engine messages — M — done when guest messages are filtered server-side.
3. The other draft advisories under GHSA-gr7v-896p-wrff (see Open work) — S–M each.

**Needs a human:**
1. GHSA-5jh6-274c-3x62 (production part) — S — done when `Perf0mvr3l91d`, `Perf1mvr3l91d` and `SafariQAmvr5lm5e` are in `disabled_accounts` (`webserver/config.py`) or deleted from `/var/lib/dcss/accounts.db3`, and no other `Perf*`/`*QA*` smoke accounts remain active.
2. GHSA-5jh6-274c-3x62 (history, optional) — M — decide whether to rewrite history to purge the files. Once the accounts are disabled the passwords are worthless, so this is low value.
3. Enable GitHub issues on `cybersicilian/crawl-mp`, or keep using draft advisories (they are private, which suits security work in a public repo).

**Blocked or waiting:**
_None yet._

## 6. Set up, run, test, deploy

- Deploy tests: `python3 -m unittest discover -s deploy -p 'test_*.py' -v` (from the root), or `cd deploy && python3 -B -m unittest test_deploy test_prepare_release`.
- Release and deploy: see `deploy/README.md` (`deploy/prepare_release.py create|verify`, then `./deploy_gcloud.sh --project PROJECT_ID --bundle … [--dry-run]`).
- Live smoke against production: `node deploy/live_smoke.cjs save|resume`. It writes credentials to `$DEPLOYMENT_PROOF_DIR` (default `/tmp/dcss-live-proof`). Keep that outside the repository.
- Heavy builds/tests: follow the host-heavy gate in `AGENTS.md`.

## 7. Open work

GitHub issues are **disabled** on this repository. Open work is tracked as draft security advisories (https://github.com/cybersicilian/crawl-mp/security/advisories) and in this list until issues exist.

- GHSA-gr7v-896p-wrff: epic tracking the 2026-11-12 security scan of `master` @ `42974c9a`.
- GHSA-5jh6-274c-3x62: production QA passwords and server logs committed. Repo clean-up done on `claude/remove-committed-secrets`; disabling the accounts on production is still open.
- GHSA-qjrr-c6vf-8v7c: logout lacks CSRF protection.
- GHSA-h7jj-hhqc-66p4: client-supplied `X-Real-IP` trusted.
- GHSA-cfxg-cpx5-f954: public library lists private-lobby expeditions, including live seeds.
- GHSA-pqmw-6f2v-r3jq: unauthenticated character previews spawn native processes.
- GHSA-5wfq-36jc-wp3f: client-chosen party room ids allow squatting/overwriting.
- GHSA-6wf6-39j3-jrjf: spectators can join solo games as players.
- GHSA-2cr9-8rm5-wvv8: co-op guests can send owner/server-only engine messages.
- GHSA-6cg2-m5w8-7j7g: unvalidated party-room fields break lobby updates.
- Tracked `deploy/__pycache__/*.pyc` files: build output in git. Untrack them and ignore `__pycache__/` (no advisory; small).

## 8. Known issues and gotchas

- **The repository is public.** Never commit smoke-test credentials, server logs or diagnostic captures from production. The `.gitignore` now blocks the usual names, but check `git status` before committing evidence directories.
- `deploy/package_source.py` packages tracked **and untracked, non-ignored** files, so anything not ignored can ship in a release tarball.
- Archived scripts under `docs/diagnostics/2026-10-27-*` still reference `private-accounts.json`. They are historical records and are not meant to be run again; the file they read is gone.
- `*.log` is now ignored repo-wide. Logs already tracked elsewhere (for example `docs/releases/**`, `docs/coop-content/**`) stay tracked. They were checked and hold no IPs or credentials.

## 9. Decisions

- 2026-11-12: removed the leaked files from `master` without rewriting history. The passwords stop mattering once the accounts are disabled, forks and caches may already hold them, and a rewrite would disrupt every open branch.
- 2026-11-12: removed only `docs/diagnostics` logs and captures, not every tracked log. Only those held production IPs, tokens or passwords; the other logs are local validation output.
- 2026-11-12: kept the GCP project id and VM name in `deploy/README.md` and the deployment docs. They are operational documentation and low risk on their own.

## 10. Deltas

<!-- composite:deltas · newest first; Composite rewrites this block on every merge (ej handoff merge / merge_handoff) -->
- **2026-11-12 12:55 MST** · claude-code · `claude/remove-committed-secrets` `42974c9`→`207d254` (1 commit) · `h-4f68b6` — crawl-mp (checkout ~/Documents/Projects/dcss, worktree dcss-wt-secrets): commit 207d25472d on branch claude/remove-committed-secrets (base master 42974c9a3) deletes the 196 leaked files from GHSA-5jh6-274c-3x62 (**/private*.json QA passwords, docs/diagnostics/**/*.log server logs with operator IP/GCP host, docs/diagnostics/**/diagnostic-*.json incl. a login token). It also adds .gitignore rules (private*.json, .account.json, *.log, docs/diagnostics/**/deploy/, diagnostic-*.json), creates HANDOFF.md, mirrors the policy into AGENTS.md and adds CLAUDE.md. Deploy tests: 28 OK. NOT pushed: the auto-mode classifier denied pushing to the public repo, so it waits for Ian. **Next:** Ian: from ~/Documents/Projects/dcss-wt-secrets run `git push origin HEAD:master` (fast-forward from 42974c9a3). Then disable the QA accounts Perf0mvr3l91d, Perf1mvr3l91d and SafariQAmvr5lm5e on production. Then tick step 2/3 on GHSA-5jh6-274c-3x62. Agents: the other draft advisories under epic GHSA-gr7v-896p-wrff; untrack deploy/__pycache__/*.pyc. **Decided:** No history rewrite: the passwords are worthless once the accounts are disabled, and forks/caches may hold them already. Deleted only docs/diagnostics logs and captures; other tracked logs were scanned and hold no IPs or credentials. Kept the GCP project id in the deploy runbooks (operational docs, low risk). Archived diagnostics scripts that reference private-accounts.json were left as historical records. Issues are disabled on the repo, so open work lives in HANDOFF.md and in the draft advisories.
- **2026-11-12 06:29 MST** · claude-code · `h-56148f` — Verified that agent 061445's git stash/pop in the composite checkout lost nothing. The 7 other-session files are intact: still modified or untracked, no conflict markers, and Python and JS syntax OK. No leftover stash came from that agent; the two remaining stashes (062130 tooltip-pill, ej451-check) belong to other agents and touch none of those files. No code changed. Cards c-f21648 and c-aadedb are done. **Next:** None for this item. The owners of stash@{0} (062130 tooltip-pill) and stash@{1} (ej451-check) in composite may want to pop or drop them. **Decided:** Did not touch the other sessions' files or their stashes. This was a read-only check.
- **2026-11-12 06:29 MST** · claude-code · `h-588d95` — Took over run 20261112-062711-02d8aa, which stopped on its usage limit without doing any work. Its card, c-63d2ff, held only a "Left alone" note that the orchestrator had picked up as a follow-up by mistake. The real request, @ and $ tokens in sent messages, had already landed in composite (497a460f, 7aa1725a). Closed c-63d2ff and c-48af27 as done. No code changed. **Next:** None for this work. The capture bug may be worth a look: the orchestrator files a reply's "Left alone:" lines as follow-up cards. **Decided:** Did not touch the other sessions' uncommitted files that the note lists. They belong to those sessions.
- **2026-11-11 22:21 MST** · me · `ej/skeletons` `271e2fe`→`3bd63f9` (50 commits) · `h-bb0605` — System-wide loading skeletons and a live design-system page (#485): Skel (web/skeleton.js, skeleton.css) is the one loading component (lines, list, stats, card, cards, columns, table, form, prose, chips, block; one role=status region; --skel/--skel-hi from --ink). The router draws a skeleton shaped like the page you move to when it takes >220 ms (at once on first load); a write into main cancels it and a route that draws nothing gets its page back (Skel.forRoute). Every bare Loading… placeholder replaced. #/design-system (More > System) shows every token's live value, the shared components and each skeleton. uv run pytest now runs the design-token, skeleton and sidebar-icon node tests. **Next:** #487: look at the skeletons and #/design-system in the installed Mac window (light, dark) after the next signed install, and give the native popups a .redacted placeholder. tests/web/git-today and pipelines fail on master since fe1211df (Title Case changed the headings those tests match). **Decided:** Skeletons never fade in: a hidden pane holds an animation at its first frame and left a fading skeleton invisible. Page skeletons only on a move to another route, never on a same-route query change (search as you type). The router helper lives in skeleton.js because index.html is at the 600-line cap. **Issues:** opened #487; closed #485.
- _Older hand-offs, a line each; `ej handoff log` has them whole:_
- **2026-11-11 20:54 MST** · local-agent-mode-eng-journal · `h-ecd014` — Tests & CI page (#/tests, Agents' work), landed as e0cdc24b and closing #481: one page for unit tests and CI across projects, built on the pipelines' stored test runs. **Next:** #482 Ian: look at it in the window after the next signed install. **Issues:** opened #482, #483, #484; closed #481.
- **2026-11-11 20:44 MST** · me · `h-5b73c4` — Reply summary sections share one vocabulary in the page (web/markdown.js SUMMARY) and on the server (orchestrator_followups): agents' own phrasings (What I changed, Not checked, Not changed, What I verified, Decisions) are recognised, and every kind links to… **Next:** #493: Action items cards set data-project so project-scoped section links resolve there. **Issues:** opened #493.
- **2026-11-11 20:01 MST** · me · `h-9194cc` — Page and data loading (#474): assets named by content hash and cached immutable (web_assets.py), gzip, HTTP/1.1 keep-alive for GETs; Today uses /api/board?compact=1 and /api/days?brief=1, Actions ?compact=done; /api/status alerts check and /api/usage recomput… **Next:** Run uv run ej install (or the signed install) so the web server serves it, then check Today, Board, Actions, Checkpoints in the app; #474 lists what is left (earlier-days doc size, slow git status in… **Issues:** opened #474.
- **2026-11-11 17:18 MST** · claude-code (after codex-mcp-client) · `h-cfd440` — Implemented Roca Insight's Composite deploy adapter (Roca half of tenpointdata/composite#395) as PR tenpointdata/roca-insight#6138 (branch claude/release-bundle-deploy, commit a51aa1e6ce, worktree /Users/iancaltabiano/Documents/Projects/roca-insight-wt-395). **Next:** 1) Review and merge roca-insight#6138, running bash -n on scripts/deploy-gc.sh and scripts/deploy-bundle.sh plus `bun run check` first. **Issues:** opened #tenpointdata/roca-insight#6136, #tenpointdata/roca-insight#6137, #tenpointdata/roca-insight#6138 (PR).
- **2026-11-11 17:11 MST** · claude-code (after codex-mcp-client) · `h-99900b` — c-d66970 closed without a rebuild. **Next:** Ian: on the next refused agent, check that a wide rule (e.g.
- **2026-11-11 17:10 MST** · claude-code (after codex-mcp-client) · `h-1c98df` — Card c-a5fc81 (retry the committed-source Composite build once the checkout is quiet) is done with no new build. **Next:** The app-intents metadata processor still fails in every release build (tenpointdata/composite#429). **Issues:** closed #tenpointdata/composite#428.
- **2026-11-11 17:10 MST** · claude-code (after codex-mcp-client) · `h-43abb9` — c-121216 complete. **Next:** #395 stays open: first real build + deploy through Builds (needs Ian: notarizes and restarts the app) and the Roca Insight adapter.
- **2026-11-11 17:10 MST** · claude-code (after codex-mcp-client) · `h-1031f0` — Goal c-ab719a is done. **Next:** The build log says the app-intents metadata processor FAILED, so Shortcuts won't list Composite's actions.
<!-- /composite:deltas -->

## 11. Updating this document

Before your final commit of any session that changed code, config, state or plans:

1. Rewrite **Current state** to what is true now, and refresh the **Last updated** stamp.
2. Reconcile **Open work** with the issues: open one for anything new, close what landed; re-rank **Triage** (`ej handoff triage --sync` drops closed issues and lists untriaged ones).
3. Add what you decided, and why, to **Decisions**.
4. Merge your delta (`ej handoff merge <fork id> --summary …`, or `merge_handoff`).
5. Leave **Handoff policy** intact.
