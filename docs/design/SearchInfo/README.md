# SearchInfo

The engine's latest search line: depth, score, nodes and speed, then the principal variation.

**Use** at the top of the sidebar, under the title bar, in the technical view (milestone 2). It
appears with the engine's first search line and stays until the engine starts on another position,
so the last search is still readable on your move. The Play view (milestone 3) hides it.

**The consumer supplies** the position searched (FEN, for move numbers) and the engine's latest
`info` line: depth, seldepth, score (from white's side), bound, nodes, nps and the PV in SAN. Any
field the engine did not report is left out, with its separator.

**Anatomy** a stats line in the `eval` style: `depth 12/26 · +0.06 · 4M nodes · 4M n/s`, compact
numbers, signed pawns or `#3` / `#-3` for mate, `≥` / `≤` before a bound. Under it the PV in the
`pv` style in `muted`, numbered from the position searched (`12… O-O 13. O-O Be6`), wrapping
anywhere, at most two lines on phones.

Hand-written from `packages/client/src/SearchInfo.tsx` and `app.css` (`.search-stats`,
`.search-pv`).
