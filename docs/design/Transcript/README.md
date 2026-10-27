# Transcript

The engine's UCI conversation, read-only, behind a disclosure that starts closed.

**Use** in the sidebar directly above the toolbar, in the technical view (milestone 2); the Play
view (milestone 3) hides it. It appears with the first game and is kept through a new game, so an
open panel stays open; the server clears its lines.

**The consumer supplies** the lines, each with its direction: sent to the engine, received from it,
or the engine's error output.

**Anatomy** a `<details>` row: the summary "UCI transcript" in `caption`, `space-3` / `space-5`
padding, separated from the section above by a `hairline` rule. Open, a list in the `pv` style,
at most 16rem tall, scrolling, and following new lines while scrolled to the bottom. Each line
starts with a mark: `→` sent in `ink`, `←` received in `muted`, `!` error output in `notice`;
each mark has an `aria-label`. Lines wrap anywhere. Never an input: typed commands could desync
the controller.

Hand-written from `packages/client/src/Transcript.tsx` and `app.css` (`.transcript`).
