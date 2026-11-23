# EvalBar

A vertical bar left of the board showing the engine's evaluation from white's side.

**Use** beside the Board, the board's full height, `eval-bar-width` wide; on phones an 8px
horizontal strip above the board with no number.

**The consumer supplies** the score in centipawns or mate-in-N from the engine's `info score`, and
the board orientation (the bar flips with it).

**Mapping** `eval-white` grows from white's edge; 0.00 is half. Clamp at ±8 pawns to 5%/95%; mate
fills 100%. The number (`eval` style, no sign, `M4` for mate) sits at the leading side's end, in
the opposite bar colour.

**In GameReview** the bar follows the selected move with the score stored for the human's latest
scored move at or before it; empty (half, no number) before their first move, and in a game played
with Move Feedback off.

New in this system; StratChessUI has no eval display yet (milestone 2: live search info).
