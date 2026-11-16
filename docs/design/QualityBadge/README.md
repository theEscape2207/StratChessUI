# QualityBadge

A round glyph marking how good a move was: ★ best, ! excellent, ?! inaccuracy, ? mistake,
?? blunder.

**Use** on the to-square of the move on the Board (20px), inline in the MoveList (16px) and in
MoveFeedback (`badge-size`). Always next to the word or an `aria-label`; colour alone never carries
the verdict.

**The consumer supplies** the verdict, derived from the win chance the move gave up against the
engine's best move. Thresholds are the app's call; state them as win-chance drops in percentage
points, never in pawns or as Elo: three pawns matter at equality and not at +15.

**No `great`** an only-move verdict needs the second-best move's score, which the app does not
have, and it would share its `!` with excellent. The `q-great` token stays, unused.

**Colours** `q-*` fills; light fills (`q-excellent`, `q-inaccuracy`, `q-mistake`) take `q-ink`, the
rest `on-accent`.

New in this system.
