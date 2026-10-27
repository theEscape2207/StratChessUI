# Design references

Copies of the StratChess design system's play-screen components, for agents and reviewers who
cannot open the design system itself (it is private). The design system is the source: change it
there, then copy the changed files here. Each `README.md` is the component's guideline;
`preview.html` is a static rendition with illustrative data, not app code.

Open a preview straight from the checkout: it loads the client's `tokens.css`, generated from the
same design system. Piece images live in the design system and are hidden here.

| Component                                    | What                                   |
| -------------------------------------------- | -------------------------------------- |
| [GameScreen](GameScreen/README.md)           | Play screen at 960px and wider         |
| [GameScreenPhone](GameScreenPhone/README.md) | Play screen below 960px                |
| [SearchInfo](SearchInfo/README.md)           | Engine search line, top of the sidebar |
| [Transcript](Transcript/README.md)           | UCI transcript, above the toolbar      |
| [EvalBar](EvalBar/README.md)                 | Evaluation bar beside the board        |
| [PlayerStrip](PlayerStrip/README.md)         | Rows above and below the board         |

The design's game lifecycle: each stage shows only its own actions.

| Stage          | Screen                        | Actions                                  |
| -------------- | ----------------------------- | ---------------------------------------- |
| 0. First visit | PairScreen                    | Pair                                     |
| 1. Set up      | NewGameForm in the sidebar    | New game (primary): side, engine, limit  |
| 2. Playing     | GameScreen / GameScreenPhone  | Resign · Undo · Hint                     |
| 3. Game over   | GameOverDialog over the board | New game (primary) · Review game         |
| 4. Review      | GameReview                    | first / previous / next / last; New game |
