# StratChessUI

A browser chess app served from a Windows machine to phones and tablets on the home network. It
talks to engines over UCI only — [StratChess](https://github.com/theEscape2207/StratChess) first,
Stockfish and others later.

Requirements, decisions and milestones: [`docs/Requirements.md`](docs/Requirements.md).

A paired browser plays white or black against an engine profile, limited by depth or move time or
playing a beginner level, from the standard start or any FEN, through to a result the server
decides, automatic draws included. It shows the engine's live search and its UCI transcript.

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

### Test a worktree from a phone

A test server runs a worktree's build beside the live one, so nobody's game stops. It listens on
port 8081 with a host directory of its own, `%APPDATA%\StratChessUI-Test`, sharing no pairings,
settings or log with the live server. It is reachable from the home network only, never through
the tunnel.

Once, from an elevated PowerShell, open its port under a rule of its own (`-Test -Remove` deletes
that rule and leaves the main one):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1 -Test
```

Then, in the worktree, after `npm ci`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test-server.ps1
```

It builds, starts the server in the console and prints the pairing code; Ctrl+C stops it. The
first run copies the live `engines.json` and links the live `engines` folder; after that the test
server's `engines.json` is its own. The phone pairs once on the test address
(`http://<this-machine>:8081`): a pairing belongs to the address it was made on, and the directory
is the same from every worktree.

## Host directory

`engines.json` and `pairings.json` live outside the checkout, so every worktree shares one set of
engines and paired browsers: `%APPDATA%\StratChessUI` on Windows, otherwise
`$XDG_CONFIG_HOME/stratchess-ui` or `~/.config/stratchess-ui`. `STRATCHESS_UI_HOME` overrides it.
Files left at the repository root by older versions are not read; move them there.

## Pairing

The server prints a six-digit pairing code to its console, or to `server.log` when it runs as a
scheduled task (below); a browser enters it once and keeps a
token. The code changes after each pairing and after five wrong attempts. Pairings are kept in
`pairings.json` in the host directory (above); delete an entry, or the file, to revoke a browser.
It applies the next time that browser connects.

Each paired browser has its own game, held until that browser starts another or the server stops,
so a locked phone or a lost connection does not lose it. After 60 seconds with no connection the
engine stops, and it restarts for the next move. At most 4 engines run at once; past that a new game,
or a move needing a restart, is refused with a reason.

## Engines

Engines are configured on the host only, in `engines.json` in the host directory (copy
`engines.example.json`). Relative paths resolve against the file. Threads and Hash are capped by
the server. The new-game form starts on the first profile. The server logs each engine's `id name`
when it starts, so a log shows which build ran, and the engine's strip shows it during a game.

A profile with `"levels": true` also plays the beginner opponent's levels, which are calibrated for
StratChess only. Point it at the same release as the normal profile: adopting a release rechecks
the levels (#94).

Run StratChess from a [release](https://github.com/theEscape2207/StratChess/releases), not a local
build. Download it next to `engines.json` (PowerShell), then point the profile's `executable` and
`cwd` at that folder; the release is one `.exe` that needs nothing else there:

```powershell
gh release download v0.10.0 -R theEscape2207/StratChess -D "$env:APPDATA\StratChessUI\engines\stratchess-0.10.0"
```

Check a profile against the real engine with:

```sh
npm run probe-engine -- stratchess
```

To adopt a new release, repeat this and re-check `docs/Requirements.md` → StratChess UCI behaviour,
which names the release it was checked against.

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

## Start with Windows

To have the server start at boot with nobody logged on, run from an elevated PowerShell in the
main checkout, after `npm run build`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\startup-task.ps1 -ExtraHosts pc.fritz.box
```

`-Port` and `-ExtraHosts` take the place of `PORT` and `EXTRA_HOSTS`; run the script again to
change them, or with `-Remove` to delete the task. It registers and starts the `StratChessUI`
task, whose settings go to `server.env` and whose output, the pairing code included, to
`server.log`, both in the host directory; the log is replaced at each start. To update, stop the
task (`Stop-ScheduledTask StratChessUI`, elevated), pull and build, then start it again.

## Play away from home

A Cloudflare Tunnel carries a hostname on the owner's domain to the server on localhost, and
Cloudflare Access lets through only the email addresses listed in its policy. Nothing listens on
the internet and phones need only a browser. It needs a domain whose nameservers point at
Cloudflare (Free plan) and the Zero Trust Free plan, whose sign-up asks for a payment card. Below,
`chess.example.com` stands for the chosen hostname.

In the Cloudflare dashboard:

1. **Login method:** Zero Trust → Integrations → Identity providers → add **One-time PIN**.
2. **Access application:** Zero Trust → Access controls → Applications → Create new application →
   Self-hosted, public hostname `chess.example.com` (the whole hostname, no path). Session
   duration: 1 month. One policy, action Allow, Include → Emails: each player's address; no Bypass
   policy. Login method: One-time PIN. Under Additional settings, turn off "Show application in App
   Launcher" (players open the hostname directly; a custom App Launcher domain fails to save) and
   copy the "Application Audience (AUD) Tag".
3. **Tunnel:** Networking → Tunnels → Create a tunnel, Windows. Run the installer it links; it
   puts `cloudflared.exe` in `C:\Program Files (x86)\cloudflared` without adding it to `PATH`, so
   run the `service install` command it shows from an elevated PowerShell as
   `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" service install <token>`. That installs
   `cloudflared` as a service that starts with Windows. Add a route: Published application,
   `chess.example.com`, service type HTTP (not HTTPS), URL `127.0.0.1:8080` (not `localhost`,
   which can resolve to IPv6, where the server does not listen); a wrong one shows a 502 "Host
   error". Edit the route and turn on **Protect with Access** with the team name and the AUD tag
   (press Enter after pasting it), so `cloudflared` itself refuses a request without a valid
   Access token if the application is ever deleted or mis-scoped.

On the host, add the hostname to the startup task's allowlist (see Start with Windows):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\startup-task.ps1 -ExtraHosts pc.fritz.box,chess.example.com
```

A player opens `https://chess.example.com`, enters their email and the PIN mailed to it, then
pairs with the code from `server.log`. Use that address at home too: a pairing and its game belong
to the address they were made on, so the LAN address starts over. An address not in the policy
gets no PIN, though the page says one was sent. Tested on iOS Safari and Android Firefox.

When the Access session runs out, an open page can no longer reconnect and offers **Reload**,
which leads to the login; the game is still there afterwards.

To remove a player, take their address out of the policy and revoke their pairing (Pairing,
above). `cloudflared` is the part facing the internet; keep it current from an elevated PowerShell
with `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" update` followed by
`Restart-Service cloudflared`.

## License

GPL-3.0-or-later, as required by Chessground and chessops. See [LICENSE](LICENSE).
