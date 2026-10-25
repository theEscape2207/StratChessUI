# StratChessUI

A browser chess app served from a Windows machine to phones and tablets on the home network. It
talks to engines over UCI only — [StratChess](https://github.com/theEscape2207/StratChess) first,
Stockfish and others later.

Requirements, decisions and milestones: [`docs/Requirements.md`](docs/Requirements.md).

Status: M1 in progress. A paired browser plays white or black against an engine profile, limited
by depth or move time, through to a result the server decides, automatic draws included.

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
machine's name and its IPv4 addresses. `FAKE_ENGINE=legal` replaces the configured engines with
the test engine (`packages/server/src/uci/fake-engine.ts`), as Playwright does; with it,
pairings are not saved and `PAIRING_CODE` fixes the code.

## Pairing

The server prints a six-digit pairing code to its console; a browser enters it once and keeps a
token. The code changes after each pairing and after five wrong attempts. Pairings are kept in
`pairings.json` at the repository root (git-ignored); delete an entry, or the file, to revoke a
browser. It applies the next time that browser connects.

One paired browser controls the game; others are refused until it has been gone for 60 seconds,
which is also how long a locked phone or a reloaded page has to resume the game.

## Engines

Engines are configured on the host only, in `engines.json` at the repository root (git-ignored;
copy `engines.example.json`). Relative paths resolve against the file. Threads and Hash are capped
by the server. Check a profile against the real engine with:

```sh
npm run probe-engine -- stratchess
```

## Play from a phone

1. Configure an engine profile (above) and check it with `probe-engine`.
2. Once, from an elevated PowerShell, open the port to the home network:
   `powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1` (`-Port` if `PORT` is not
   8080; `-Remove` undoes it). The rule covers Private networks and the local subnet only.
3. `npm run build && npm start`. The console lists this machine's addresses and the pairing code.
4. On a phone on the same Wi-Fi, open the address of the Wi-Fi or Ethernet adapter (not a
   `vEthernet` one from WSL or Hyper-V) and enter the code.

If the page does not load:

- The firewall script warns when the network is Public, or when Windows's first-run prompt for
  `node.exe` left program-wide rules (a Block one wins over the script's rule); fix what it prints.
- The phone must be on the same subnet: a guest Wi-Fi network usually is not.
- `unknown host` means the phone used a name the server does not know, such as `pc.fritz.box`:
  add it with `EXTRA_HOSTS=pc.fritz.box`.

## License

GPL-3.0-or-later, as required by Chessground and chessops. See [LICENSE](LICENSE).
