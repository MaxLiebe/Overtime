# rlapi (Node.js)

Node.js port of the [Go rlapi](../go) library, focused on authentication and match history.

This package implements the PsyNet HTTP auth flow, WebSocket RPC layer, Epic Games authentication, and the `Matches/GetMatchHistory v1` endpoint.

## Setup

```bash
cd nodejs
npm install
```

## Match history example

```bash
npm run match-history
```

On first run, the example prints an Epic Games login URL. After signing in, paste the authorization code from the redirect URL. The refresh token is saved to `.rlshops` so later runs reuse it automatically.

The example fetches your 20 most recent matches and prints playlist, map, score, duration, result, and personal stats.

## Replay saver (CLI)

The CLI version still works for headless use:

```bash
npm run replay-saver
```

## Desktop app (Electron)

Background tray app with a UI for saved replays and settings:

```bash
npm run electron
```

Features:

- Runs minimized in the system tray and keeps syncing in the background
- **Saved Replays** tab listing downloaded matches with playlist, score, result, and Ballchasing status
- **Settings** for poll interval, replay folder, tray behavior, launch at login
- **Ballchasing** auto-upload with configurable API token and visibility
- **Epic Games** login flow built into the settings panel

Sign in opens an in-app Epic Games login window and completes authentication automatically — no terminal or manual code copying required.

Config and state are stored in the Electron user data directory (not the project folder).

## Usage as a library

```typescript
import { authenticate } from "./src/auth.js";
import { getRecentMatches } from "./src/matches.js";

const { rpc, displayName } = await authenticate();
const matches = await getRecentMatches(rpc, 20);

console.log(`${displayName}: ${matches.length} matches`);
await rpc.close();
```

## Architecture

The flow mirrors the Go SDK:

1. **EGS auth** — Exchange Epic OAuth code/refresh token for an EOS access token
2. **PsyNet HTTP** — `Auth/AuthPlayer/v2` returns WebSocket credentials
3. **PsyNet WebSocket** — Persistent connection for RPC calls with `PsySig` signing
4. **Match history** — `Matches/GetMatchHistory v1` returns recent matches for the authenticated player

## Ported modules

| Go file | Node.js module |
|---------|----------------|
| `egs.go` | `src/egs.ts` |
| `psynet.go` | `src/psynet.ts` |
| `psynetrpc.go` | `src/psynetRpc.ts` |
| `auth.go` | `src/auth.ts` + auth logic in `psynet.ts` |
| `matches.go` | `src/matches.ts` |
| `playerid.go` | `src/playerId.ts` |
| `requestid.go` | `src/requestId.ts` |
| `buildid.go` | `src/buildId.ts` |

## Notes

- Game version and feature set constants are copied from the Go SDK and may need updating when Rocket League patches.
- Steam authentication is supported via `PsyNet.authPlayerSteam()` and `EGS.exchangeEosTokenFromSteam()` if you provide a Steam session ticket separately.
