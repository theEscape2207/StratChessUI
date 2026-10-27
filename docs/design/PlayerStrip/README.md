# PlayerStrip

A row above and below the board naming each side, its captured pieces and whose turn it is.

**Use** the engine's strip on the far side of the board, the human's on the near side; they swap
with orientation.

**The consumer supplies** the name (engine profile name, or "You"), the engine's limit ("depth 8",
"1000 ms" — never a rating), the human's colour, captured pieces and material balance, and the
phase and result.

**Anatomy** a 40px initial tile (`accent` for the engine, `panel-raised` for the human; 32px on
phones; no avatar images), name in `body` 700 with the limit (engine) or colour (you) in `muted`,
captured cburnett pieces at 16px overlapping, material lead as `+N` `caption` on the side ahead
only; a status chip on the right in the `eval` style.

**Captures** count against the position the game started from, not a full set: a game loaded from
a FEN shows only what was taken during the game. The material lead (pawn 1, knight and bishop 3,
rook 5, queen 9) comes from the current position.

**Chip** text by phase; the side to move's chip is on `panel-raised`, the other on `panel`:

| Phase | Engine | You | Raised |
| --- | --- | --- | --- |
| starting | starting | waiting | engine |
| your move | waiting | your move | you |
| engine thinking | thinking | waiting | engine |
| over, with a result | won / lost / draw | won / lost / draw | none |
| over, no result (engine failed) | ended | ended | none |

New in this system.
