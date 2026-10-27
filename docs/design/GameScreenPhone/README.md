# GameScreenPhone

The play screen below 960px, shown at 390px: the main way StratChessUI is used, from a phone on the
home network.

**Layout, top to bottom** an 8px EvalBar strip (no number; `eval-white` grows from the left), the
engine's PlayerStrip, the Board edge to edge, the human's PlayerStrip, then the sidebar stacked:
SearchInfo (PV clamped to two lines), a one-row MoveFeedback (verdict, eval chip, "Best was O-O (0.00)" instead of the PV), the three
in-game Buttons (Resign, Undo, Hint; icon over label, 56px tall), the MoveList as wrapping inline SAN that scrolls, the Transcript (closed), and the toolbar (Copy FEN, Settings) along
the bottom: the same order as GameScreen's sidebar. Page gutter `space-4`.

**Touch** buttons and toolbar icons are 44px tall, above `control-min-height`; the board squares
are about 49px.

**Differences from GameScreen** smaller strip avatars (32px), coordinates at 10px, a 18px board
badge, PV and verdict tally dropped to save height.
