# PlayerStrip

A row above and below the board naming each side, its captured pieces and whose turn it is.

**Use** the engine's strip on the far side of the board, the human's on the near side; they swap
with orientation.

**The consumer supplies** the name (engine profile name, or "You"), the engine's limit ("depth 8",
"1000 ms" — never a rating), captured pieces and material balance, and the phase.

**Anatomy** a 40px initial tile (`accent` for the engine, `panel-raised` for the human; no avatar
images), name in `body` 700 with the limit in `muted`, captured cburnett pieces at 16px overlapping,
material lead as `+N` `caption`; a status chip on the right in the `eval` style, on `panel-raised`
for the side to move.

New in this system.
