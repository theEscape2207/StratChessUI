# MoveFeedback

Two rows in the sidebar, under SearchInfo: the move just played with its verdict and eval, and the
engine's best move with its line.

**Use** when Move Feedback is on, for the human's latest move: from its verdict until the human's
next move, including while the engine thinks. A move with no feedback yet shows nothing, so the
previous feedback goes as soon as the human moves. In GameReview, for the selected move when it is
the human's; none on the engine's moves.

**Rows**
- **Played move:** QualityBadge when it has a verdict, the headline, the eval chip when it has a
  score. No verdict (a hinted turn earns no praise): its SAN alone. No score (its search was capped,
  or the rules decided the game): no chip. A move that mates: the `#` badge and "is checkmate" in
  place of its verdict's, and no best row: nothing beats a mate.
- **Best move:** only when the move played was not the best. A line under a best move that was
  played would run on from the game's own position and give away the next turn's hint. The ★ badge,
  "O-O is best", the chip, and the PV under the headline.
- **Alternative:** the best row when the move played scored higher than the best in its own search.
  The two scores come from two searches, so neither is wrong: no badge, "O-O is the alternative".

**The consumer supplies** the played move (SAN), its verdict and score, and, when it was not the
best, the engine's best move, score and PV (SAN, starting with the best move, numbered from the
position before the move), and whether the move played outscored it. Scores are from white's side.

**Anatomy** QualityBadge · headline in the `feedback` style (SAN bold; "is the only good move", "is
best", "is excellent", "is an inaccuracy", "is a mistake", "is a blunder", "is checkmate" or, on the
best row, "is the alternative" lighter) · eval chip in
the `eval` style, written as SearchInfo writes a score: `eval-white` ground for scores ≥ 0,
`eval-black` for negative. The PV under the best move is `pv` style in `muted`, one line,
ellipsised.

**Below 960px** one row, per GameScreenPhone: badge, headline and chip, with "Best was O-O (0.00)"
under the headline in place of the best row, or "Alternative was O-O (0.00)" for the alternative.
No PV.
