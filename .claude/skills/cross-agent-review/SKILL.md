---
name: cross-agent-review
description: Review an issue, design or PR another agent wrote, or answer the review of your own. Use when asked to review or cross-review such an artifact, or to address review findings.
---

# Cross-agent review

The owner routes a second agent's review to artifacts where a bad premise is expensive and CI
cannot see it: an issue or design before work starts, and PRs they choose. Skip mechanical changes
where CI is the real gate.

**Channel.** A review is a comment on the artifact's issue or PR, through `--body-file`. The author
edits the artifact; the reviewer writes only the review.

## Reviewer

Read the artifact, its issue with comments, and every file it cites, at `origin/main` unless it
names another commit. Look for claims nobody verified (a library behaviour, a default that has
changed), logic that does not hold (a false dichotomy, a test that cannot fail), and weight out of
proportion to the change.

Write a header line (model, date, revision reviewed), one line on what you verified as correct,
then numbered findings, each citing `file:line` or the passage and proposing a concrete change:

- **Blocking**: proceeding risks a wrong or unverifiable result.
- **Add**: a real gap, but the artifact is sound without it.
- **Clarify**: wording only.

Report the comment URL and the count per rank.

## Author

Judge each finding on its merits; the reviewer is strong on provenance and logic, weaker on what
is worth changing. Answer in one comment with a disposition per finding: accepted (what changed),
rejected (why) or deferred (where tracked). Close a Blocking finding with evidence: source, a test
or a run. Then edit the artifact and report the counts.

**One round.** A second round covers only a disputed or new Blocking finding. A rejected finding on
a design carries into the PR body.
