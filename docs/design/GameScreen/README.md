# GameScreen

The play screen at desktop width while a game is in progress (lifecycle stage 2), composed only
from this system's parts: EvalBar, two PlayerStrips around the Board, and the sidebar (SearchInfo,
MoveFeedback, MoveList, the in-game actions, Transcript and an icon toolbar).

**Layout** three columns centred on `bg`: `eval-bar-width`, `board-max`, `sidebar-width`, `space-4`
apart, `space-5` page padding. The eval bar lines up with the board, not the strips. The sidebar is
one `panel` (`radius-md`) with a `panel-raised` title bar; sections are split by `hairline` rules,
and the move list takes whatever height is left.

**Sidebar order, top to bottom** title bar · SearchInfo · MoveFeedback · MoveList · actions ·
Transcript (closed) · toolbar. SearchInfo and Transcript belong to the technical view (milestone 2)
and are hidden in the Play view (milestone 3).

**Under the board** nothing during play: the strips' chips carry the turn, and the FEN is only ever
copied, never shown. A StatusLine appears here for a connection problem or an ended game with its
dialog closed, and a `notice` line when the server rejects something.

**Actions** exactly three secondary buttons, icon over label: **Resign**, **Undo**, **Hint**. No
primary button during play. Hint is disabled while the engine is thinking; Undo stays available. The
toolbar holds Copy FEN and Settings only — move stepping belongs to GameReview. Settings appears
once it has something to set; until then the toolbar is Copy FEN alone.

**Resign** asks once, inline: the tap swaps the whole row for `Resign this game?` over two
secondary buttons, **Keep playing** on the left, under the thumb that just tapped Resign, and
**Resign** on the right, so a double tap cannot end the game. Neither is primary. Keep playing, or
the game ending meanwhile, brings the row back.

**Moment shown** the human (white) has just played 12. a3, judged an inaccuracy (-0.64 against
0.00 for O-O); the engine strip's chip reads "thinking", so the board is locked. When the game ends,
GameOverDialog opens over the board.

**Below 960px** see GameScreenPhone.

The line played is legal (checked with python-chess); the verdicts and evals are illustrative.
