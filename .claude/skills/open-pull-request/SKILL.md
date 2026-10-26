---
name: open-pull-request
description: Review, open and land a PR on this repo, then clean up after the owner merges. Use when finishing a branch, opening or updating a PR, or cleaning up after a merge.
---

# Open a pull request

## 1. Review

A PR that changes code gets skill `code-review` (`mattpocock-skills:code-review`) first: fixed
point `origin/main`, the issue as spec, CLAUDE.md's Code section as standards. Size it to the
risk; a trivial fix can be reviewed inline. Every finding is fixed, or rejected with its reason in
the PR body. A docs-only change needs lint and no review.

## 2. Open

`gh pr create --body-file <path>`, the body written to the scratchpad first. It says `Closes #N`
exactly, stays sized to the diff, and its test plan names the checks run and how a new test was
seen to fail. Later commits reach the PR with a plain `git push`.

Wait with `gh pr checks <n> --watch`; right after creation it can report "no checks" before the
run registers, so ask again. Green means **awaiting merge**: the owner merges on github.com, never
`gh pr merge`.

## 3. After the merge

Done when the PR reads `MERGED`, `main` is pulled, and the branch and worktree are gone.

1. `gh pr view <n> --json state` reads `MERGED`. Anything else: stop and tell the owner, because
   deleting an open PR's head branch closes the PR.
2. Remove the worktree, by how it was made:
   - **Claude-managed** (`.claude/worktrees/…`): `ExitWorktree` with `action: "remove"`. It asks
     for `discard_changes: true` because the branch has commits its starting point lacks; after
     step 1 nothing is lost. Do this first: a worktree-isolated session may not run git against
     the main checkout.
   - **Sibling** (`git worktree add`): `git worktree remove <path>`, run from the main checkout.
3. In the main checkout: `git switch main`, `git pull --ff-only`, `git branch -d <branch>`.
   GitHub deletes the remote branch on merge; `git ls-remote --heads origin <branch>` shows any
   left over.
