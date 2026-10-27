# GameScreen

The play screen at desktop width while a game is in progress (lifecycle stage 2), composed only
from this system's parts: EvalBar, two PlayerStrips around the Board, the FEN StatusLine, and the
sidebar (SearchInfo, MoveFeedback, MoveList, the in-game actions, Transcript and an icon toolbar).

**Layout** three columns centred on `bg`: `eval-bar-width`, `board-max`, `sidebar-width`, `space-4`
apart, `space-5` page padding. The eval bar lines up with the board, not the strips. The sidebar is
one `panel` (`radius-md`) with a `panel-raised` title bar; sections are split by `hairline` rules,
and the move list takes whatever height is left.

**Sidebar order, top to bottom** title bar · SearchInfo · MoveFeedback · MoveList · actions ·
Transcript (closed) · toolbar. SearchInfo and Transcript belong to the technical view (milestone 2)
and are hidden in the Play view (milestone 3).

**Actions** exactly three secondary buttons, icon over label: **Resign**, **Undo**, **Hint**. No
primary button during play. Hint is disabled while the engine is thinking; Undo stays available. The
toolbar holds Copy FEN and Settings only — move stepping belongs to GameReview. Settings appears
once it has something to set; until then the toolbar is Copy FEN alone.

**Moment shown** the human (white) has just played 12. a3, judged an inaccuracy (-0.64 against
0.00 for O-O); the engine strip's chip reads "thinking", so the board is locked. When the game ends,
GameOverDialog opens over the board.

**Below 960px** see GameScreenPhone.

The line played is legal (checked with python-chess); the verdicts and evals are illustrative.
