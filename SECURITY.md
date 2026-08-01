# Security

## Reporting issues

If you find a vulnerability in Overtime, please open a private GitHub security advisory on [MaxLiebe/Overtime](https://github.com/MaxLiebe/Overtime) or contact the maintainer. Do not post exploit details in a public issue until a fix is available.

## What is stored on your PC

Overtime keeps local data under the Electron user data directory (for example `%APPDATA%\Overtime` on Windows):

- Linked Epic account refresh / session tokens (separate files under `tokens/`)
- Ballchasing API token (in `config.json`)
- Replay library metadata and sync state

These files are written with restrictive permissions where the OS supports it. Treat your user data folder like a password store.

## Public client constants

`src/constants.ts` includes Epic / EOS / PsyNet client identifiers that Rocket League clients already expose publicly. They are not Overtime-specific private API keys. Do not treat them as secrets unique to this project.

## Auto-updates

Installed builds can check [GitHub Releases](https://github.com/MaxLiebe/Overtime/releases) for updates when that option is enabled. Portable builds do not use the same update path.
