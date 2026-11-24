# QualityBadge

A round glyph marking how good a move was: !! great, ★ best, ! excellent, ?! inaccuracy, ? mistake,
?? blunder.

**Use** on the to-square of the move on the Board (20px), inline in the MoveList (16px) and in
MoveFeedback (`badge-size`). Always next to the word or an `aria-label`; colour alone never carries
the verdict.

**The consumer supplies** the verdict, derived from the win chance the move gave up against the
engine's best move. Thresholds are the app's call; state them as win-chance drops in percentage
points, never in pawns or as Elo: three pawns matter at equality and not at +15.

**Great** the engine's best move when it was the only good one: the second-best move gives up enough
win chance to be a mistake. It needs the second-best move's score from the same search, so a forced
move, or an engine that cannot rank two moves, earns none.

**Mate** `#` on the `q-best` fill, in place of the verdict of a move that mates: nothing beats a mate,
and "is checkmate" says more than any verdict.

**Colours** `q-*` fills; light fills (`q-excellent`, `q-inaccuracy`, `q-mistake`) take `q-ink`, the
rest `on-accent`.

New in this system.
