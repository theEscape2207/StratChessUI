# GameOverDialog

A dialog centred over the board the moment the server ends the game: the result, how it ended, a
three-number summary of your moves, and what to do next.

**Use** once per game, at the transition from playing to review. It never appears for a game that
was already over when the page loaded.

**The consumer supplies** the result and termination from the server's final state, the human's
colour, and the verdict counts.

**Title** from the human's side: "You beat StratChess", "StratChess wins", "Draw". The line under
it, in the `status` style: `1-0 · by checkmate`, `0-1 · you resigned`, `½-½ · by stalemate` —
the same termination words as the StatusLine.

**Actions**
- **New game** (primary) opens the NewGameForm in the sidebar, prefilled with the settings just
  played, so a rematch is one tap. There is no separate Rematch button.
- **Review game** (secondary), or ×, or a tap on the scrim closes the dialog into GameReview.

**Anatomy** `scrim` over the board at `z-promotion`; a `panel` card, 88% of the board wide,
`radius-md`, with a `panel-raised` header; tally as in GameReview.
