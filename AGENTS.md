<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Work on main. Do not create worktrees.

This is one person building a website. No employees, no users, no release train.
The worst realistic outcome of most changes is that he asks for it again.

**Default: branch from `main` in this directory, commit, push, done.**

Do not run `git worktree add`. Do not create a lane, a proof harness, or an
isolated copy because a change *feels* important. Every worktree you create is
a directory he has to clean up later, and it will still be there long after you
are gone. If you genuinely believe one is justified, ask first and say why.

**Size the process to what the change can actually break.**

A CSS nudge, a copy fix, a comment, a doc move: find it, change it, run the one
check that's relevant, ship it. That is the whole procedure. Do not install
dependencies, run full test suites, or run production builds to justify a
one-line visual edit.

Reserve real rigor for what can genuinely bite: money, database migrations,
deletions, auth and privilege boundaries, and anything touching
`app/api/evaluate/route.ts`.

**Verification means the smallest proof that answers the question**, not the
most proof available. State the question ("is the ? clear of the select in both
states?"), answer it, stop. If it's visual, he looks at it — you don't need a
ceremony to hand it over.
