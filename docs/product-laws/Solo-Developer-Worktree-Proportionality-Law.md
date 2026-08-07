## Solo-Developer / Worktree Proportionality Law

FairWatchTrade is currently a solo-development project with no employees and no public users.

**Default working location is the existing main worktree.**

Do not create a new Git worktree, branch, verification lane, temporary checkout, preview environment, or parallel repository merely to isolate ordinary development work.

A new worktree is justified only when one of these is actually true:

- concurrent unfinished work must remain untouched;
- a destructive migration or rollback requires isolation;
- a security/authentication change has meaningful blast radius;
- an exact historical commit must be reproduced or compared;
- Jason explicitly requests an isolated lane.

A worktree is **not** justified merely because a change is visual, observable, deployable, or being verified.

For ordinary UI polish, copy changes, spacing, positioning, typography, icons, bounded component fixes, and similarly reversible work:

**find it → change it → run the smallest relevant check → ship it → Jason looks.**

Verification must be the **smallest proof that answers the actual question**, not maximum ceremony.

Do not run full builds, broad regression suites, create new lanes, or reproduce environments unless the changed surface can realistically require them.

Before creating any worktree, first inspect existing worktrees and reuse an appropriate one if isolation is genuinely required.

Temporary worktrees created for completed work must be removed when the work closes.

Do not preserve obsolete worktrees merely as historical evidence. Git history, commits, and external evidence artifacts provide history; abandoned working directories do not.

When uncertain, prefer the simpler path unless the change can realistically damage data, money, authentication, publication state, security, or other difficult-to-reverse system state.