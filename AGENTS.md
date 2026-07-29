# AGENTS.md

## Cursor Cloud specific instructions

This repo currently contains a single project, the Node.js/TypeScript port of the
Rocket League PsyNet API, located in the `nodejs/` directory. All commands below
run from `nodejs/`.

### Project overview

`nodejs/` ships three things from one codebase:

- A library (`nodejs/src/`) implementing Epic Games auth, the PsyNet HTTP/WebSocket
  RPC layer, match history, and replay download/Ballchasing upload.
- CLI examples (`nodejs/examples/`): `match-history` and `replay-saver`.
- An Electron desktop tray app (`nodejs/electron/`) — the primary application.

Standard commands live in `nodejs/package.json` scripts and `nodejs/README.md`;
prefer those over duplicating here.

### Lint / test / build

- There is no ESLint config and no automated test suite. The effective lint/type
  check is the TypeScript compiler: `npm run build` (library, `tsc`) and
  `npm run build:electron` (library + `electron/tsconfig.json`). Treat a clean
  `tsc` as the lint gate.
- `npm run build:electron` compiles `electron/main.ts`, which imports the library
  via the package name `rlapi`. That resolves through `package.json` `exports` to
  `dist/`, so the library must be built first — the script already chains
  `build` before the electron compile.
- The Electron renderer (`electron/renderer/`) is plain JS/HTML/CSS and is loaded
  from source at runtime (it is not compiled by tsc).

### Running the app (Electron) in this cloud VM

- A virtual display is available at `DISPLAY=:1`. From `nodejs/`, run
  `DISPLAY=:1 npm run electron`. The script already passes `--no-sandbox`, and
  `electron/main.ts` also disables the Chromium sandbox / GPU sandbox and
  hardware acceleration on Linux so the app does not fatal with
  `GPU process isn't usable` in containers.
- On startup Electron may still print benign errors that can be ignored:
  `Failed to connect to the bus` (no DBus) and occasional GPU init /
  `command_buffer` lines under software rendering. The window still loads and
  is fully interactive.
- The app runs in the system tray and, by default, keeps running when the window
  is closed (Settings → "Minimize to tray when closing window"). Kill it by PID
  when done; do not rely on closing the window.

### Auth boundary (important for end-to-end runs)

- Core sync features (match history, replay download) require a real Epic Games
  login. Without a linked account, `authenticate()` throws
  "No Epic account linked" and the CLIs exit — this is expected, not a setup bug.
- The UI, settings persistence, and the Epic login flow (which opens the real
  Epic Games login page) all work without credentials, so they are the safe
  surfaces to exercise for a smoke test.
- Electron config/state/accounts are stored in the Electron userData dir, not the
  repo. The CLI `match-history`/`replay-saver` store a refresh token in
  `nodejs/.rlshops` (gitignored).
