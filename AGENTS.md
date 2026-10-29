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
