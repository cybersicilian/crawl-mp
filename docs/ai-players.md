# Jev AI party players

This is a local source implementation. Production activation and real Jev
gameplay acceptance have not been performed. The local launcher now reads the
existing Google Cloud secret, and one live typed decision has passed. Automated
tests use controlled responses. Native syntax checks do not establish a linked
executable or gameplay acceptance.

## Using AI seats

In the party builder, select **AI player** for P2, P3 or P4 and choose that hero's
build normally. AI seats can accompany human seats. **Companion** retains the
manually controlled solo companion behavior. Sparse staging seats compact into
native slots together; the saved expedition's `ai_slots` records the resulting
native indices and survives normal save/resume.

AI expeditions use native multiplayer initiative, private perception and fixed
hero ownership. A human cannot claim an AI seat or impersonate its controller.
Only the expedition owner can change AI controls. Each AI card has Pause/Resume;
an active AI prompt also has Cancel AI prompt. Cancelling pauses the AI and sends
Escape to its exact current native prompt. A paused AI can hold up initiative
on its threatened floor until resumed. All AI inference stops while every human
participant is disconnected.

Configure the **webserver process environment**, then rebuild the native binary
with the repository's release settings and restart the matching server:

| Variable | Purpose | Default |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Server-only TypeSafe credential | Required for AI launch |
| `TYPESAFE_MODEL` | System One model name or alias | `jev-latest` |
| `DCSS_AI_CALLS_PER_HOUR` | Request ceiling shared by expeditions in one server worker | `3600` |

### Existing Google Cloud credential

`./start_coop_server.sh` uses `deploy/run_with_secrets.py` and the reference-only
configuration in `deploy/ai-credentials.json`:

```text
projects/chuk-437319/secrets/typesafe-api-key/versions/latest
```

The launcher uses the existing authenticated `gcloud` session to fetch the
credential, captures its value in memory and passes it as `TYPESAFE_API_KEY` in
the server environment. It never writes the value into the checkout, shell
arguments, saved games or logs. Gcloud file and HTTP logging are disabled for
the access call. An already-set `TYPESAFE_API_KEY` takes precedence and skips
cloud access. Startup fails with a sanitized error when the secret is unavailable.

Use `DCSS_AI_CREDENTIALS_CONFIG=/path/to/references.json` for another mapping, or
`DCSS_AI_CREDENTIALS_CONFIG= ./start_coop_server.sh` to launch without cloud
credentials. On macOS, the launcher uses `/etc/ssl/cert.pem` unless certificate
paths were explicitly supplied; certificate and hostname verification remain
enabled.

The production systemd service runs the webserver directly and the VM has no
cloud service account. This local credential setup does not change its identity,
permissions or environment, restart it, or activate the AI feature in production.
Production still needs its existing server-side secret/environment provisioning
and the matching validated native release.

Keep the key in the server's existing secret/environment configuration. It is
never sent to browsers, included in saved party specifications or shown in
provider error messages. Model usage is billed by TypeSafe. Calls have a 15-second
timeout, no automatic retry, a 60 KB application request cap, one outstanding
request per expedition, and at least 0.5 seconds between completed decisions.
The hourly ceiling also counts failed attempts. Multiple server workers have
separate ceilings. Returned token counts are available in AI status; these are
session counters, not durable monetary billing records.

Launching without a configured key returns a configuration error before writing
an rcfile or starting a game. Provider failures, invalid results, exhausted
budgets and excessive prompt responses put that AI in an error state with no
fallback game action. Resume explicitly retries after the issue is resolved.

## State and decision contract

`tileweb-ai.cc` produces each configured AI's semantic observation inside the
existing native personal projection. Unconfigured games perform no AI snapshot
work. The server consumes these packets without forwarding them to browsers.

| State | Representation |
| --- | --- |
| Hero | Slot, floor, position, HP/MP, clocks, turns, confusion and berserk state |
| Local terrain | 17 by 17 remembered terrain window with named symbol legend |
| Live creatures | Personally visible names, relative positions, attitude, native threat and visible wounds |
| Teammates | Public positions, floors, HP, turns and liveness |
| Hero context | Own equipment, status, resistances, inventory and known powers with bounded descriptions |
| Tactical facts | Code-computed health band, hostile counts, distances, directions and a suggested safe step toward the leader |
| Action candidates | Stable action IDs with human-readable consequences; code retains execution |

`ai_state.py` performs arithmetic and local routing. It avoids unknown tiles,
marked hazards and visible creatures when suggesting a follow step. A suggestion
must begin with an action that native code actually offered. It cannot invent a
path to another floor or beyond the available remembered terrain.

`system_one.py` sends a `Choice` question to
`POST https://api.typesafe.ai/v1/systemone`. It is independent of Crawl and can
be reused by another async Python consumer supplying state, criteria and
instructions. It validates the selected ID, confidence, probability distribution
and usage response. Confidence is retained; no uncalibrated cutoff silently
replaces Jev's decisions.

Movement, melee, waiting, stairs, identified healing and supported quick casts
have direct candidates. Native casting, ability, firing, pickup, potion, scroll,
evocation and equipment menus are also candidates. Their follow-up choices use
the prompt loop. Native game rules still enforce availability, targeting,
resource costs, damage and initiative. This adapter does not add autonomous
skill training, spell memorisation, shopping or arbitrary natural-language text
generation.

## Prompt continuation

When an AI action asks for input, Jev receives the original action, prompt mode,
recent recipient-filtered messages, menu title and item hotkeys, current screen
text, UI state, targeting cursor, and the hero's own inventory and powers.
Confirmations, targeting and More prompts have explicit choices. Menus preserve
nested state and incremental item updates. Letter/digit prompts include finite
keyboard choices enriched with the hero's known shortcuts. Values are entered
one key at a time; nothing buffers an arbitrary suffix into a later command.
At most 64 prompt responses are allowed for one action before explicit resume.

The server discards replies after pause, disconnect, observation changes or
prompt changes. Native `ai_action` rechecks configured ownership, the consumed
observation revision, hero/floor/clocks/resources and a freshly generated action
candidate. Native `ai_prompt` additionally requires the exact initiating action
token, current prompt mode and active hero. A late prompt key cannot become an
ordinary movement or gameplay command.

`ActivityPump` owns the native completion token for the entire action, including
all prompts. Human commands get the next available command boundary. While an
AI prompt owns that boundary, it completes its own prompt before queued human
input proceeds. AI decisions never answer another hero's prompt.

## Validation and remaining acceptance

Final focused validation on 24 October 2026 passed 104 backend tests, C++17
syntax checks for the three native translation units, and syntax checks for all
four changed JavaScript files. Each changed JavaScript file remains under 600
lines. The shared heavy-host reservations were closed and released after their
compiler/test process groups exited. No real provider inference, linked native
build, browser gameplay batch or deployment was performed in that phase.

The subsequent credential check accessed the existing Secret Manager version
and made one live `jev-latest` request. It returned model `jev-1.14.0`, selected
healing for a critically injured hero with an adjacent hostile, and reported
638 input / 38 output tokens. Observed inference latency was 0.29 seconds for
this single small request, not a gameplay performance benchmark. No native game
input was sent. Credential-launcher tests cover captured access, environment
handoff, overrides and failure redaction.

Focused tests cover the provider HTTP contract, failure budgets, stale actions
and prompts, cancellation, human input priority, private recipient filtering,
roster ownership and compaction, semantic state and known-terrain routing.

```sh
PYTHONPATH=crawl-ref/source/webserver .venv/bin/python -m unittest \
  webtiles.ai_party_test webtiles.ai_state_test webtiles.party_control_test \
  webtiles.gameplay_protocol_test webtiles.multiplayer_test
```

The integration must still be accepted with a linked current native build and a
real server API key: verify mixed human/AI play, melee and spell builds, item and
targeting prompts, failed service recovery, pause/cancel/resume, stairs, personal
vision, reconnect, save/resume and actual model decision quality/latency/cost.
Read the shared host-heavy policy before native builds or gameplay batches.

API contract references: [System One API](https://docs.typesafe.ai/api/system-one),
[state](https://docs.typesafe.ai/concepts/state),
[Choice](https://docs.typesafe.ai/primitives/choice), and
[model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
