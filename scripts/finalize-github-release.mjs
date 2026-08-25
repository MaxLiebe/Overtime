/**
 * Finalize the GitHub Release created by electron-builder:
 * - title: "Overtime <version>" (matches prior releases)
 * - publish draft → public
 * - optional body from RELEASE_NOTES
 *
 * Requires GH_TOKEN or GITHUB_TOKEN with repo release permissions.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const OWNER = "MaxLiebe";
const REPO = "Overtime";

function getToken() {
  return (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
}

async function github(path, { method = "GET", body } = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("GH_TOKEN or GITHUB_TOKEN is required to finalize the release.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Overtime-finalize-release",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function findReleaseByTag(tag) {
  const releases = await github(`/repos/${OWNER}/${REPO}/releases?per_page=20`);
  return releases.find((release) => release.tag_name === tag) ?? null;
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = String(packageJson.version ?? "").trim();
  if (!version) {
    throw new Error("package.json is missing version.");
  }

  const tag = `v${version}`;
  const releaseName = `Overtime ${version}`;
  const release = await findReleaseByTag(tag);
  if (!release) {
    throw new Error(`No GitHub release found for tag ${tag}.`);
  }

  const releaseNotes = (process.env.RELEASE_NOTES || "").trim();
  const updated = await github(`/repos/${OWNER}/${REPO}/releases/${release.id}`, {
    method: "PATCH",
    body: {
      name: releaseName,
      draft: false,
      prerelease: false,
      ...(releaseNotes ? { body: releaseNotes } : {}),
    },
  });

  console.log(`Release finalized: ${updated.html_url}`);
  console.log(`Title: ${updated.name} (draft=${updated.draft})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
