# Board

The 8×8 board: a thin view of the server's position, drawn by Chessground in `Board.tsx`.

**Use** one per page, in the widest column, up to `board-max`. It is always square and never
rounded (`radius-none`).

**The consumer supplies** `fen`, `lastMove` (UCI, e.g. `a2a3`), `orientation` (the human's colour),
`movable` (the side allowed to move now; undefined locks the board), a `revision` counter to redraw
after the server rejects a move, and `onMove(uci)`.

**Squares** `board-light` / `board-dark`; coordinates sit inside the edge squares in the `coord`
style, ranks top-left and files bottom-right, coloured with the opposite square colour.

**States**
- Last move: `highlight-light` / `highlight-dark` on both squares.
- Selected piece: `move-dest` fill; legal empty destinations: a `move-dest` dot; captures: a
  `move-dest` ring.
- Check: `check` radial glow under the king.
- Quality: a 20px `q-*` badge on the to-square's top-right corner (`z-badge`, `shadow-badge`), for
  the human's latest move, until their next one; in GameReview, for the selected move when it is
  the human's. It hides once that square no longer holds a piece
  of theirs, so it never sits on the piece that captured there.
- Arrows: the hint in Chessground's `green` brush; in GameReview, the best move instead of a human
  move in its `blue` brush, on the position after the move played.

**Don't** draw arrows or badges for the engine's own moves unless the user asked for analysis.

Static rendition here; hand-written from `packages/client/src/Board.tsx` and Chessground's brown
theme with this system's green squares.
