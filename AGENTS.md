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
