// Run with `npm test` (builds first). Exercises the sign-in and sync failure paths that
// used to surface as "Session expired" or "not letting Overtime download replays".
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { classifyEpicError } from "../dist/epicErrors.js";
import { writeFileAtomic } from "../dist/atomicFile.js";
import {
  BUNDLED_PSYNET_BUILDS,
  REMOTE_PSYNET_BUILDS_URL,
  RLAPI_PSYNET_SOURCE_URL,
  getKnownPsyNetBuilds,
  resetPsyNetBuildState,
} from "../dist/psyNetBuilds.js";
import { PsyNet, isPsyNetBuildRejected } from "../dist/psynet.js";
import { authenticate, EpicSessionExpiredError, EpicUnavailableError } from "../dist/auth.js";
import { syncReplays } from "../dist/replays.js";

const NEWEST = BUNDLED_PSYNET_BUILDS[0];
const realFetch = globalThis.fetch;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** PsyNet stub: accepts only `acceptedSecret`, answers BuildNotFound otherwise. */
function psyNetAuth(init, acceptedSecret, onAccept) {
  if (init.headers.PsyBuildSecret !== acceptedSecret) {
    return json({ Error: { Type: "BuildNotFound", Message: "" } });
  }
  onAccept?.(init);
  // An unreachable socket URL: the test closes the RPC before it matters.
  return json({
    Result: {
      PerConURLv2: "ws://127.0.0.1:9/",
      PsyToken: "t",
      SessionID: "s",
      VerifiedPlayerName: "Player",
    },
  });
}

beforeEach(() => resetPsyNetBuildState());
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("Epic error classification separates dead logins from outages", () => {
  assert.equal(classifyEpicError(400, "errors.com.epicgames.account.oauth.invalid_refresh_token"), "credentials");
  assert.equal(classifyEpicError(400, "errors.com.epicgames.account.invalid_account_credentials"), "credentials");
  assert.equal(classifyEpicError(503, "errors.com.epicgames.common.server_error"), "transient");
  assert.equal(classifyEpicError(429, undefined), "transient");
  assert.equal(classifyEpicError(400, "errors.com.epicgames.account.oauth.authorization_pending"), "pending");
  assert.equal(classifyEpicError(400, "errors.com.epicgames.common.unknown"), "other");
});

test("PsyNet sign-in falls back to a known build when the installed one has no secret", async () => {
  let acceptedVersion;
  const fetchFn = async (url, init) => {
    if (String(url) === REMOTE_PSYNET_BUILDS_URL) {
      return new Response("offline", { status: 503 });
    }
    return psyNetAuth(init, NEWEST.buildSecret, (accepted) => {
      acceptedVersion = accepted.headers["User-Agent"];
    });
  };
  // Simulate Launch.log reporting a build from a patch Overtime has never seen.
  const psyNet = new PsyNet({ fetchFn });
  psyNet.setVersion("999999.1.1", "PrimeUpdate99");
  const { rpc } = await psyNet.authPlayer("ticket", "abc", "Player");
  await rpc.close();
  assert.match(acceptedVersion, new RegExp(NEWEST.gameVersion.replaceAll(".", "\\.")));
});

test("A build secret published after release is picked up without an app update", async () => {
  const published = {
    gameVersion: "999999.2.2",
    featureSet: "PrimeUpdate99",
    buildSecret: "f".repeat(64),
  };
  const fetchFn = async (url, init) => {
    if (String(url) === REMOTE_PSYNET_BUILDS_URL) {
      return json({ builds: [published, { gameVersion: "bad", featureSet: "x", buildSecret: "y" }] });
    }
    return psyNetAuth(init, published.buildSecret);
  };
  const { rpc } = await new PsyNet({ fetchFn }).authPlayer("ticket", "abc", "Player");
  await rpc.close();
  assert.equal(getKnownPsyNetBuilds()[0].gameVersion, published.gameVersion);
  assert.ok(!getKnownPsyNetBuilds().some((build) => build.gameVersion === "bad"));
});

test("A new build published only by rlapi is picked up automatically", async () => {
  const secret = "a".repeat(64);
  const goSource = `const (
	baseURL      = "https://api.rlpp.psynet.gg/rpc"
	gameVersion  = "999999.3.3"
	featureSet   = "PrimeUpdate99_FFE7A62B41040BB67F8829FD67F2EE8A"
	buildSecret  = "${secret}"
)`;
  const fetchFn = async (url, init) => {
    if (String(url) === REMOTE_PSYNET_BUILDS_URL) {
      return new Response("not found", { status: 404 });
    }
    if (String(url) === RLAPI_PSYNET_SOURCE_URL) {
      return new Response(goSource);
    }
    return psyNetAuth(init, secret);
  };
  const { rpc } = await new PsyNet({ fetchFn }).authPlayer("ticket", "abc", "Player");
  await rpc.close();
  assert.equal(getKnownPsyNetBuilds()[0].featureSet, "PrimeUpdate99_FFE7A62B41040BB67F8829FD67F2EE8A");
});

test("Rejection of every build is reported as a build problem", async () => {
  const fetchFn = async (url, init) =>
    String(url) === REMOTE_PSYNET_BUILDS_URL
      ? new Response("{}", { status: 404 })
      : psyNetAuth(init, "never-matches");
  await assert.rejects(new PsyNet({ fetchFn }).authPlayer("ticket", "abc", "Player"), (error) => {
    assert.ok(isPsyNetBuildRejected(error));
    return true;
  });
});

function epicStub({ exchange, deviceAuthGrant, eosRefresh, psyNet }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? new URLSearchParams(String(init.body)) : new URLSearchParams();
    if (href === REMOTE_PSYNET_BUILDS_URL) {
      return new Response("", { status: 404 });
    }
    if (href.endsWith("/account/api/oauth/exchange")) {
      calls.push(`exchange:${init.headers.Authorization}`);
      return exchange(init.headers.Authorization);
    }
    if (href.endsWith("/account/api/oauth/token")) {
      calls.push(`token:${body.get("grant_type")}`);
      if (body.get("grant_type") === "device_auth") {
        return deviceAuthGrant();
      }
      return json({ errorCode: "errors.com.epicgames.account.oauth.invalid_refresh_token" }, 400);
    }
    if (href.endsWith("/epic/oauth/v2/token")) {
      calls.push(`eos:${body.get("grant_type")}`);
      if (body.get("grant_type") === "refresh_token") {
        return eosRefresh();
      }
      return json({ access_token: "eos", refresh_token: "eos-r", account_id: "abc" });
    }
    if (href.includes("psynet.gg")) {
      calls.push("psynet");
      return psyNet();
    }
    throw new Error(`unexpected request ${href}`);
  };
  return calls;
}

const savedLogin = {
  accountId: "abc",
  displayName: "Player",
  accessToken: "stale-access",
  accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  eosRefreshToken: "eos-refresh",
  refreshToken: "eg1-refresh",
  deviceAuth: { accountId: "abc", deviceId: "d", secret: "s", clientId: "c" },
};

test("A revoked saved session falls through to the lasting login", async () => {
  const calls = epicStub({
    exchange: (auth) =>
      auth === "bearer stale-access"
        ? json({ errorCode: "errors.com.epicgames.authorization.invalid_token" }, 401)
        : json({ code: "exchange" }),
    deviceAuthGrant: () => json({ access_token: "fresh", refresh_token: "r", displayName: "Player", account_id: "abc" }),
    eosRefresh: () => json({}, 500),
    psyNet: () => json({ Error: { Type: "ServiceUnavailable", Message: "maintenance" } }),
  });

  // PsyNet maintenance must surface as itself, not as an expired Epic session.
  await assert.rejects(authenticate(savedLogin), (error) => {
    assert.ok(!(error instanceof EpicSessionExpiredError));
    assert.match(error.message, /ServiceUnavailable/);
    return true;
  });
  assert.ok(calls.includes("token:device_auth"));
  assert.ok(calls.includes("exchange:bearer fresh"));
});

test("Epic outages are not reported as an expired session", async () => {
  epicStub({
    exchange: () => json({ errorCode: "errors.com.epicgames.common.server_error" }, 503),
    deviceAuthGrant: () => json({ errorCode: "errors.com.epicgames.common.server_error" }, 503),
    eosRefresh: () => json({ errorCode: "errors.com.epicgames.common.server_error" }, 503),
    psyNet: () => json({}),
  });
  await assert.rejects(authenticate(savedLogin), EpicUnavailableError);
});

test("Only rejection of every saved credential asks the user to sign in again", async () => {
  const dead = () => json({ errorCode: "errors.com.epicgames.account.invalid_account_credentials" }, 400);
  epicStub({ exchange: dead, deviceAuthGrant: dead, eosRefresh: dead, psyNet: () => json({}) });
  await assert.rejects(authenticate(savedLogin), EpicSessionExpiredError);
});

test("Concurrent atomic writes never leave a torn file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "overtime-atomic-"));
  const path = join(dir, "state.json");
  const big = (n) => JSON.stringify({ n, padding: "x".repeat(200_000) });
  await Promise.all(Array.from({ length: 20 }, (_, n) => writeFileAtomic(path, big(n))));
  assert.equal(JSON.parse(await readFile(path, "utf8")).n, 19);
});

test("Sync skips matches it already downloaded, even after the file was deleted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "overtime-sync-"));
  await writeFile(join(dir, "keep.replay"), "x");
  let downloads = 0;
  const fetchFn = async () => {
    downloads += 1;
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const match = (guid) => ({
    ReplayUrl: `https://example.invalid/${guid}`,
    Match: {
      MatchGUID: guid,
      Playlist: 10,
      MapName: "stadium_p",
      Team0Score: 1,
      Team1Score: 0,
      SecondsPlayed: 300,
      OvertimeSecondsPlayed: 0,
      bOverTime: false,
      WinningTeam: 0,
      Players: [],
    },
  });
  const deleted = "A".repeat(32);
  const fresh = "B".repeat(32);
  const result = await syncReplays([match(deleted), match(fresh)], {
    replayDir: dir,
    knownGuids: [deleted],
    fetchFn,
  });
  assert.equal(downloads, 1);
  assert.deepEqual(result.downloaded.map((item) => item.matchGuid), [fresh]);
});
