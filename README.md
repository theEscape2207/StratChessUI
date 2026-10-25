# StratChessUI

A browser chess app served from a Windows machine to phones and tablets on the home network. It
talks to engines over UCI only — [StratChess](https://github.com/theEscape2207/StratChess) first,
Stockfish and others later.

Requirements, decisions and milestones: [`docs/Requirements.md`](docs/Requirements.md).

Status: scaffold. One browser plays both sides against the server's rules; no engine yet (M1).

## Layout

| Package           | Role                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `packages/shared` | chessops rules and the WebSocket protocol, used by both sides           |
| `packages/server` | Fastify: owns the game, serves the built client, Host/Origin allowlists |
| `packages/client` | React + Vite; Chessground board as a thin view                          |

The server runs TypeScript directly on Node 24 (type stripping), so it has no build step. Write
erasable TypeScript only (no `enum`, no parameter properties) and import with `.ts` extensions.

## Develop

Requires Node 24 (`.nvmrc`).

```sh
npm install
npm run build && npm start   # http://<this-machine>:8080, reachable from the LAN
npm run dev                  # Vite on localhost:5173 with hot reload; needs `npm start` running
npm run lint                 # ESLint + Prettier check (`npm run format` fixes formatting)
npm run typecheck
npm test                     # Vitest
npm run e2e                  # Playwright, desktop and phone; first run: npx playwright install chromium
```

`PORT` changes the port; `EXTRA_HOSTS` (comma-separated) adds Host names beyond localhost, this
machine's name and its IPv4 addresses.

## Engines

Engines are configured on the host only, in `engines.json` at the repository root (git-ignored;
copy `engines.example.json`). Relative paths resolve against the file. Threads and Hash are capped
by the server. Check a profile against the real engine with:

```sh
npm run probe-engine -- stratchess
```

## License

GPL-3.0-or-later, as required by Chessground and chessops. See [LICENSE](LICENSE).
