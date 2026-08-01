# Privacy and security

Short version of what Overtime keeps on your machine, and how to report a problem.

## If you find a security issue

Please report it privately if you can (a GitHub security advisory on [MaxLiebe/Overtime](https://github.com/MaxLiebe/Overtime), or a direct message to the maintainer).

Don't post a full public write-up with exploit steps until there's a fix out.

## What gets stored on your PC

Overtime keeps its data in a normal app data folder. On Windows that's usually `%APPDATA%\Overtime`.

That folder can include:

- Epic login tokens (so you stay signed in)
- Your Ballchasing API token, if you added one
- Replay list / sync info

Don't share that folder or upload it anywhere public. Anyone with it could use your linked accounts.

Overtime does not take your Epic password. Sign-in goes through Epic's website in your browser.

## Updates

With the **setup installer** and updates enabled, Overtime can pull new versions from [GitHub Releases](https://github.com/MaxLiebe/Overtime/releases).

The **portable** build won't update itself. Grab a new file from Releases when you want a newer version.

## Epic / game login bits

Like a lot of community Rocket League tools, Overtime uses publicly known Epic client IDs to talk to Epic's login systems. Those aren't secret Overtime passwords, and they aren't private keys unique to this project.
