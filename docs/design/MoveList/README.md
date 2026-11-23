# MoveList

The game's moves in SAN, two per numbered row, under an optional opening name.

**Use** in the sidebar, filling the space between MoveFeedback and the actions; it scrolls, and keeps
the current move in view.

**The consumer supplies** the SAN moves (from chessops), the index of the move shown on the board,
optional per-move verdicts, and in GameReview the human's scores and an `onSelect(index)` to step
through the game.

**Anatomy** rows striped `panel` / `row-alt`; move number `caption` in `muted`; SAN in the `move`
style; the current move on a `panel-raised` chip (`radius-sm`); a verdict as a 16px QualityBadge
before the SAN: during play only for inaccuracies and worse, in GameReview on every judged move,
since its tally counts the best and excellent ones too.

**In GameReview** every move is a button. Each of the human's moves has its score after the SAN in
the `pv` style, `muted`, written as SearchInfo writes a score (from white's side); the engine's moves
have none.

New in this system (milestone 2 lists a move list).
