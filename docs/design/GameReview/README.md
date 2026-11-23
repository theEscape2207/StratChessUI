# GameReview

The screen after a game: step through the moves and see what each of the human's moves was worth.
Same layout as GameScreen; the sidebar changes. Nothing new is computed: the verdicts, scores and
best moves are the ones judged during play, so a game played with Move Feedback off has none.

**Use** once the game is over. GameOverDialog's **Review game**, its ×, or a tap on its scrim closes
into it; a game already over when the page loads opens straight in it. It lands on the last move.

**Sidebar, top to bottom** title "Game review"; MoveFeedback for the selected move when it is the
human's; the MoveList, every move selectable, each of the human's moves with its verdict badge and
its score; the toolbar; the verdict tally; one primary **New game**, which opens the NewGameForm in
its place, prefilled with the game just played, with Cancel back to review; More (closed).

**Toolbar** first / previous / next / last, then Copy FEN (the position on the board) and Copy PGN.
It sits under the MoveList rather than at the bottom, so on a phone the stepping buttons stay just
below the board and the moves. First goes to the start position, before any move.

**Board** shows the selected move: its position, last-move highlight and, on a human move, its
QualityBadge on the to-square and the best-move arrow. Moving pieces on the board is off in review.

**Best-move arrow** on a human move where another move was best: from the best move's from-square to
its to-square, drawn on the position after the move played, in Chessground's `blue` brush, apart
from the hint's green. None when the move played was the best.

**EvalBar** follows the selection: the score of the human's latest scored move at or before the
selected one, so stepping onto the engine's reply keeps the bar where the human's move left it, rather
than emptying it on every other step. Empty before the human's first move.

**Tally** each verdict's count on the human's moves, in two columns: Best and Excellent on the
left, Inaccuracy, Mistake and Blunder on the right. A row is an 18px QualityBadge, the word in
`caption` `muted`, the count in the `move` style at the row's end. A move with no verdict (a hinted
turn, the opening's first moves) counts nowhere.

**Engine moves** show their SAN alone: no badge, score, MoveFeedback or arrow. Judging them needs a
search per move, which is later work (live analysis in review).

**Under the board** the StatusLine with the result, as on GameScreen once the dialog is closed.
**Player strips** carry the outcome in the chip (`won` on `accent`, `lost` / `draw` on `panel`);
their captures follow the board.

**Not here** Resign, Undo, Hint and SearchInfo belong to the game in progress; Flip board lives in
Settings. Deeper analysis (engine lines per move, eval graph) is out of scope for now.

**Moment shown** the human (white) has stepped back to 4. Nc3, an inaccuracy where O-O was best. The
line played is legal; the verdicts and scores are illustrative.
