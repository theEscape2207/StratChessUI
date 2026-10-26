# Issue tracker: GitHub

Issues and specs live as GitHub issues on this repository. Use the `gh` CLI; it infers the repo
from the clone.

**Every body or comment goes through `--body-file`**, written to your scratchpad first. An inline
`--body "..."` run from Bash executes backtick spans and posts the mangled text publicly.

- **Create**: `gh issue create --title "..." --body-file <path>`
- **Read**: `gh issue view <number> --json title,body,labels,comments`. Outside a terminal, `--comments` prints the comments without the body.
- **List**: `gh issue list --state open --json number,title,labels` with `--label` filters as needed.
- **Comment**: `gh issue comment <number> --body-file <path>`
- **Labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number>`, after any explanation posted as a comment.

PRs are opened with `gh pr create --body-file <path>`; the owner merges them. A PR closes an issue
only with GitHub's exact keywords: `Closes #N`, `Fixes #N` or `Resolves #N`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and PRs: resolve a bare `#42` with `gh pr view 42`,
falling back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --json title,body,labels,comments`.
