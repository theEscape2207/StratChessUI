# Domain docs

This repo is single-context.

## Before exploring, read these

- **`docs/Requirements.md`**: intent, milestones, agreed decisions with their reasons, and the
  architecture constraints. It is the decision record; there is no `docs/adr/`.
- **`CONTEXT.md`** at the repo root, if it exists.

If a file does not exist, proceed silently; `/domain-modeling` creates `CONTEXT.md` when a term
actually gets resolved.

## Use the project's vocabulary

Name concepts as the code and `docs/Requirements.md` do: engine profile, generation ID, pairing.
Do not drift to synonyms.

## Flag decision conflicts

If your output contradicts a decision in `docs/Requirements.md`, say so and give the reason to
reopen it, rather than silently overriding it.
