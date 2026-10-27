# CLAUDE.md – StratChessUI

A browser chess UI for UCI engines, served from the Windows host to phones on the home LAN. Layout
and commands: `README.md`. Requirements, decisions and milestones: `docs/Requirements.md`. Backlog:
GitHub Issues via `gh`.

The process is deliberately lighter than the engine repo's: CI takes minutes and there is nothing to
measure. Before adding a rule, script or doc, ask whether this project needs it.

## Code

- **The server owns the game** and decides moves, turns and results; the client validates only for
  feedback and the board is a view. Rules go through chessops in `packages/shared`, not hand-rolled.
- The server runs TypeScript by type stripping: erasable syntax only, `.ts` import extensions.
- Comments state a key concept or a tripwire for a reader who knows TypeScript, React, Chessground
  and UCI. Never restate the code or cite a task, PR or earlier version; history goes in the PR.
- Extract a named helper rather than scoping part of a function in a bare `{ }` block.
- A new dependency needs a reason in the PR body; each one is future update work.
- Statements in an issue about what the code or a library does are claims: read the code, or the
  library in `node_modules`, before relying on one.

## Threat model

LAN-facing, no accounts, plain HTTP. Any device on the home network may send requests; the
defences are the cheap ones in `docs/Requirements.md` → Architecture constraints (Host and Origin
allowlists, pairing, profile IDs instead of paths, no CR/LF into UCI, bounded everything). A change
that weakens one of those, or exposes the app beyond the LAN, needs the owner's agreement. Beyond
them, aim for robustness, not hardening against an attacker the project does not have.

## Testing

`npm run lint`, `npm run typecheck`, `npm test`, `npm run e2e` (README → Develop). Pick the checks a
change could fail; a docs-only change needs lint at most.

- **Prove a new test guards something:** break the code, watch it fail, restore. Drive it through
  the production path (`GameSession`, the WebSocket, the board), not by feeding a value in below
  the code under test.
- **Client tests:** pure client logic goes in plain functions tested by Vitest (`*.test.ts`);
  anything layout, Chessground or touch goes through Playwright. No DOM-emulation test stack until
  something needs one.
- **Playwright: "your move" does not mean the engine replied.** Right after the human moves, the
  status still reads it, and under a depth limit the fake replies too fast to see "thinking". Wait
  through `playAndAwaitReply` (`e2e/helpers.ts`), which watches the FEN.
- **Chessground caches the board's bounds** until it sees a scroll event; after anything that
  scrolls the page, wait for that event before clicking squares (`board.spec.ts`).

## Workflow

- **Every task that changes files starts in a Claude-managed worktree**: `EnterWorktree` named
  after the issue (`issue-23-handshake-timeout`), which branches fresh from `origin/main` into
  `.claude/worktrees/<name>`; a session launched in one already has it. Then `npm ci`: a new worktree
  has no `node_modules`, and Node falls back to the main checkout's root one, which lacks the
  workspace packages' own dependencies. PRs target `main`.
- **One slice per session.** An issue split into PRs ends the session at each PR with a one-line
  start prompt for the next (issue, what landed, what is next, cleanup due).
- **Design first** when a decision could reasonably go more than one way and affects the protocol,
  the architecture or correctness, or when the change rests on an assumption the code cannot
  confirm. Post it as an issue comment: problem, decisions with the rejected alternatives,
  unverified assumptions and how each gets verified, validation. No placeholders. A decision
  surfacing mid-implementation means stop and write it.
- **Finishing a branch, opening a PR or cleaning up after a merge:** skill `open-pull-request`.
  Reviewing another agent's issue, design or PR: skill `cross-agent-review`.
- Commit messages stay short; stage named files, never `git add -A`.

**Public repo.** Every issue, PR or comment body goes through `--body-file` (an inline `--body`
from Bash executes backtick spans). No `claude.ai` session links. Write another repository's
issue or PR as a code span, never a bare ref or URL, so GitHub posts no backlink on their page.

## Agent skills

### Issue tracker

GitHub Issues on this repository, through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The skills' five readiness roles, same names as the labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context; decisions live in `docs/Requirements.md`. See `docs/agents/domain.md`.
