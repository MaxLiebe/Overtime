# Maintaining Overtime

## After a Rocket League update

Each Rocket League patch ships a new game build and rotates the `PsyBuildSecret` that
Rocket League's servers (PsyNet) require when Overtime signs in. Until Overtime knows the new
secret, sync shows "Rocket League's servers don't accept this version of Overtime" and no new
replays download.

Overtime tries every build it knows (the installed game's build first, then newest to oldest),
so an older build often keeps working for a while after a patch. To add the new build:

1. Find the new values: the game version (`GPsyonixBuildID` in Rocket League's `Launch.log`),
   the feature set (`Using feature set ...` in the same log), and the build secret.
   [dank/rlapi](https://github.com/dank/rlapi) usually publishes them in `psynet.go` within
   days of a patch.
2. Add the build to the top of [`psynet-builds.json`](psynet-builds.json) and commit it to
   `main`. Installed copies of Overtime read that file from GitHub (at most once an hour,
   sooner after a rejection), so users get sync back **without a new release**.
3. In the next release, also add it to `BUNDLED_PSYNET_BUILDS` in
   [`src/psyNetBuilds.ts`](src/psyNetBuilds.ts) and update `GAME_VERSION` / `FEATURE_SET` in
   [`src/constants.ts`](src/constants.ts), so fresh installs work offline too. Keep the
   previous build in both lists for a while.

## Tests

`npm test` builds the library and runs the tests in [`test/`](test). They stub Epic and PsyNet,
so they need no account or network access.
