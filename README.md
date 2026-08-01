# Overtime

Desktop app that saves Rocket League replays in the background, with optional Ballchasing upload.

Built with Electron. The Node library code under `src/` also powers the CLI examples.

## Setup

```bash
npm install
npm run electron
```

## Desktop app

```bash
npm run electron          # run from source
npm run pack              # Windows NSIS installer + portable
npm run pack:installer    # NSIS only (supports auto-update)
npm run pack:portable     # portable only (no auto-update)
npm run publish:win       # build and publish to GitHub Releases
```

Features:

- System tray sync in the background
- Replay library with search, rename, delete, and Ballchasing links
- Process / interval / manual sync modes
- Epic device-code sign-in (opens your browser)
- Optional Ballchasing auto-upload
- Optional auto-update from GitHub Releases (installer builds)

Config and account tokens live in the Electron user data directory, not the project folder.

## Publishing updates

1. Bump `version` in `package.json`.
2. Create a GitHub personal access token with `repo` scope (for CI or local publish).
3. Run `npm run publish:win` with `GH_TOKEN` set, or let CI run electron-builder with `-p always`.
4. Users on the NSIS installer with auto-update enabled pick up `latest.yml` from the GitHub Release.

## CLI examples

```bash
npm run match-history
npm run replay-saver
```

## Security notes

See [SECURITY.md](./SECURITY.md). Epic/EOS client constants in `src/constants.ts` are public client identifiers, not private Overtime keys.
