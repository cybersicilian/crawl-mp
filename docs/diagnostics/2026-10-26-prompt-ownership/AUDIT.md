# Multiplayer freeze audit and recovery

Status: implemented locally; hosted upload and deployment are pending separate authorization. The last deployed release contains the earlier no-op completion fix. It does not contain this follow-up ownership, audit, or recovery work.

## Failure and scope

The screenshot's “Another hero is finishing an action” message was caused by disagreement between the router's command owner and the native engine's prompt owner. An owner's repeated key could bypass serialization while an earlier command was running. Native completion could then be emitted before buffered input finished. A queued peer took the router token while the original hero's inventory still owned the engine. The router rejected one hero and the engine rejected the other. Visible enemies were not necessary.

The original all-player deadlock was reproduced through the real native engine and Python router, using three disposable owner identities. See `original-three-owner/report.json`. This audit follows browser input, WebSocket reconnects, server action queues, native datagram transport, command/macro completion, dialogs, automation, cancellation, projections, and recovery. It is a focused audit of this freeze family, not a claim that every gameplay system or platform is defect free.

## Findings and mitigation

| Finding | Consequence | Local mitigation |
| --- | --- | --- |
| Repeated owner input bypassed the command token | Native and router ownership diverged | Serialize each ordinary command, including raw input characters; bypass only for a real owned prompt |
| Native completion ran before an entire macro or nested control handler returned | A queued peer could take ownership while a dialog remained open | Complete only outside control handlers, personal projections, both native input buffers, and pending text input |
| Automated prompts discarded in-flight ownership | Either another hero could intervene or the real owner was blocked | Keep the original token throughout manual and automated prompts |
| Inline dialogs retain COMMAND mouse mode | Mode alone cannot distinguish a completed command from a dialog | Consult the native UI stack and retain ownership during inline dialogs |
| Error responses emitted completion directly | A rejected dialog action could release another command | Rejections use the same ordinary command boundary as accepted input |
| Delayed prompt replies could become new commands | Unexpected actions or completion of the wrong token | Require the exact prompt token and actual native hero; reject stale replies without acknowledging a newer token |
| Hidden input queue lacked disconnect/floor/identity guards | Old input could execute after reconnect or travel | Revalidate connection, reserved hero, and original floor before delivery; bind the original floor in the native engine too, so delayed server projections cannot permit stale input; apply the same identity guard to visible queued actions |
| Escape/Stop did not clear hidden queued input | Movement could resume after cancellation | Clear only the requesting hero's hidden and visible queues, while preserving any real prompt response |
| Hidden queues and raw input batches were unbounded | A burst or paste could flood the shared input path | Limit deferred input to 32 entries per hero and raw packets to 32 valid keys; reject overflow explicitly |
| Recovery/status messages or projected completion could be confused with authority | False release of an active command | Reject browser control/status messages, projected acknowledgements, noninteger tokens, stale tokens, and future tokens |
| Lost completion or prompt messages had no reconciliation path | A correct engine could remain blocked behind stale router state | Periodic token-specific native status probes, safe completion recovery, prompt owner/UI restoration, and tactical acknowledgement repair |

## Detection and self-healing contract

The existing 150 ms activity timer checks an in-flight request. After five seconds it sends a read-only native status query for that exact request; further probes are spaced by at least five seconds. The query does not submit gameplay input, change heroes, spend a turn, dismiss a dialog, or replace a save.

The engine retains the most recently completed activity ID, its hero, and any associated tactical plan ID and turn count. It reports `complete` only when that exact request completed at the real command boundary and the engine is currently idle, outside menus, nested control handlers, projection, macros, and pending text. The router can then recover the lost completion and dispatch queued input once. The browser's tactical acknowledgement is restored to the original hero when present.

If the exact native pending token owns a prompt, the router restores that owner, delivers only that owner's pending responses, and requests the existing native UI stack. Repeated identical status replies do not repeatedly restore the UI. A disconnected owner keeps their reserved hero and must reconnect to resolve their prompt; recovery never invents their answer.

`busy`, `unknown`, absent, invalid, stale, or projected evidence cannot release ownership. The router never retries gameplay input on a timer. It records diagnostics and continues bounded probes instead. Unknown native state and three unanswered probes (about 15 seconds) produce warning logs. Other lifecycle observations use info logs, with repeated unanswered warnings suppressed per request.

Diagnostics use the existing server logger and the `Input lifecycle:` prefix. They include event, activity ID, owner, prompt flag, queue depth, request age, and relevant native state. They do not record key contents. Per-process recovery counters record probes, recovered completions, recovered prompts, and unresolved native states. No scheduled external monitor or notifications were created.

## Operational remediation

1. For `completion_recovered` or `prompt_recovered`, confirm continued input and stable per-hero turns. No restart is needed.
2. For a legitimate open prompt, its native owner finishes or cancels it; a disconnected owner reconnects to the same reserved hero. Peers cannot answer on that hero's behalf.
3. For `native_unknown` or `native_unresponsive`, retain the activity ID and logs, inspect native liveness and pending state, and preserve all saves before any separately authorized process intervention. The watchdog intentionally does not kill, reset, unlock, auto-confirm, or replay commands.
4. Deploy native and backend changes together. A backend-only rollout cannot supply native completion evidence. The prepared deployment helper pins the current release, verifies native source/build binding, builds privately, runs disposable regressions, backs up state, and refuses cutover with active games or changed save hashes.

## Verification and limits

The audit's source binding, logs, native reports, and exact gate release evidence are under `audit/`. The final validation receipt is `validation.json`. The original negative regression and intermediate fixture failures are retained so corrected tests are distinguishable from product fixes.

Native checks use the real C++ engine, real Unix datagrams, real router/pump/stream objects, and three simulated authenticated receiver objects. They deliberately drop completion/plan and prompt events, corrupt only the router owner, verify safe recovery, and run 96 burst commands with exact per-hero turn counts. They also cover inventory and inline dialogs, reconnect UI restoration, stale replies, cancellations, no-op commands, rejected commands, and macro suffixes. No existing save was used.

Deterministic JavaScript suites exercise browser transport, reconnect lifecycle, authentication ordering, command sending, tactical planning, and state-delta recovery. They are not a new live browser acceptance run. A pre-existing missing `document`/event fixture in `client-connection.cjs` was corrected to exercise the actual disconnect event.

The new ownership and recovery fields are process memory only; this patch changes no native save format, database schema, or persisted player data.

The minimal production overlay excludes unrelated unreleased AI features and is tested separately at the Python boundary. Linux compilation, hosted browser/gameplay acceptance, and post-deployment monitoring of this final follow-up remain pending authorization. Local macOS validation does not replace those checks. No production files or saves were changed during this audit.
