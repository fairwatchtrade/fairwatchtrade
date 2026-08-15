<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Solo-Developer / Worktree Proportionality Law

Governing law, full text: `/docs/product-laws/Solo-Developer-Worktree-Proportionality-Law.md`

FairWatchTrade is a solo-development project with no employees and no public
users. **The default working location is the existing main worktree.**

Do not create a new worktree, branch, verification lane, temporary checkout,
preview environment, or parallel repository merely to isolate ordinary work.
A new worktree is justified only when one of these is actually true:

- concurrent unfinished work must remain untouched;
- a destructive migration or rollback requires isolation;
- a security/authentication change has meaningful blast radius;
- an exact historical commit must be reproduced or compared;
- Jason explicitly requests an isolated lane.

A worktree is **not** justified merely because a change is visual, observable,
deployable, or being verified. Before creating one, inspect the existing
worktrees and reuse an appropriate one. Remove any temporary worktree when its
work closes — abandoned directories are not historical evidence; git history is.

For ordinary UI polish, copy, spacing, positioning, typography, icons, bounded
component fixes, and similarly reversible work:

**find it → change it → run the smallest relevant check → ship it → Jason looks.**

Verification must be the **smallest proof that answers the actual question**,
not maximum ceremony. Do not run full builds, broad regression suites, or
reproduce environments unless the changed surface can realistically require it.

When uncertain, prefer the simpler path — unless the change can realistically
damage data, money, authentication, publication state, security, or other
difficult-to-reverse system state.

# Complex Piping Documentation Law

Any complex piping feature — Vault ingestion, Vault Upgrade Room, Galaxy
publication, Dealer Accelerator, taxonomy resolution, or similar multi-layer
architecture — must have a repo-local README attached to its machinery.
Written when the architecture is fresh, updated when it changes, deliberately
labeled about what will and won't age.

**The test:** if losing session context would require 30+ minutes to
rediscover how this system works, it earns a README.

**Location:** colocated with the code (`app/[feature]/README.md`), not in a
separate docs folder where it gets forgotten.

**Format:** architecture properties (durable) plus queries/commands to verify
current state (self-refreshing). Never hardcoded counts, line numbers, or
specifics that rot.

Practical notes earned the hard way:

- Lead with the misconception the file exists to kill.
- Record where the behaviour actually lives when that is non-obvious — a view
  definition, a column default, an RLS policy. That is what costs the hours.
- Say what is deliberately NOT built, and why. "Nothing in the application
  ever writes this column" was the single most valuable line in the first one.
- Write it in the session where the understanding is fresh. Written later, it
  is itself a reconstruction — the exact thing being avoided.

First instance: `app/vault/galaxy/README.md`.
