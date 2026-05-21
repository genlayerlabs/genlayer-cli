---
name: release
description: Cut a release of genlayer-cli. Bumps version, updates CHANGELOG, tags, pushes — CI then publishes to npm and creates the GitHub Release. Use when a human asks "release v0.39.x" or "ship a new version".
---

# Release skill — genlayer-cli

This repo follows a branch-per-major release model. There is no auto-bump on push. A release happens when a human (or you on their behalf) runs `scripts/release.sh` on the target stable branch.

## When to use this skill

User asks anything like:
- "release v0.39.2"
- "ship a patch"
- "tag the latest fix as a release"

If they ask "publish to npm directly" — refuse and point at this flow. The repo doesn't have an unprotected npm push path; the tag is the only release entry point.

## What this repo's release model expects

- Branches are named after the major they ship: `v0.39` (current stable). When `v0.40` opens (a major bump in semver-zero terms), the previous `v0.39` stays read-only for back-ports.
- Tags live within those branches: `v0.39.2`, `v0.39.3`, ...
- **Semver-zero rule**: this package is on 0.x, so the MINOR component is the breaking-change boundary. `0.39 → 0.40` IS a major bump. `scripts/release.sh` refuses both `minor` and `major` keywords without `--allow-major`.
- A major (= minor on 0.x) bump means cutting a new branch (`v0.40`) — not tagging on the current one.
- `CHANGELOG.md` is updated in the release commit (release-it via `@release-it/conventional-changelog`).
- `publish.yml` fires on the tag push and does the npm publish + GitHub Release.

## Steps

1. **Confirm intent with the user.**
   - Which version? If unspecified, ask whether it's patch or explicit.
   - If they say "minor" or "major" on 0.x, surface that this means cutting a new branch — confirm.

2. **Switch to the target branch + sync.**
   ```bash
   git checkout v0.39
   git pull --ff-only origin v0.39
   ```

3. **Verify the head is shippable.**
   - Latest CI green:
     ```bash
     gh run list --branch v0.39 --commit "$(git rev-parse HEAD)" --limit 1
     ```
   - Inspect commits since the previous tag:
     ```bash
     git log "$(git describe --tags --abbrev=0)..HEAD" --oneline
     ```

4. **Run the release script.**
   ```bash
   scripts/release.sh <X.Y.Z>     # or patch
   ```
   Bumps `package.json`, prepends `CHANGELOG.md`, commits, tags `vX.Y.Z`, pushes branch + tag. Does NOT publish to npm — CI handles that.

5. **Watch the publish workflow.**
   ```bash
   gh run watch
   ```
   If `publish.yml` fails (typical: tag/package.json mismatch, NPM_TOKEN, provenance), report verbatim and stop.

6. **Confirm on npm.**
   ```bash
   npm view genlayer dist-tags
   ```
   (Yes — the npm package name is `genlayer`, not `@genlayer/cli`.)

## Things to refuse

- **Minor or major bump on 0.x without `--allow-major`**. Those are major bumps in semver-zero and belong on a new branch.
- **Releasing from `main`** — `main` is retired.
- **Pushing to the dead `staging` branch** — the beta-channel flow was retired with the auto-bump. If you need a pre-release, tag `v0.39.2-beta.0` directly via the script with explicit version.
- **Hand-editing `package.json` to bump the version** — the script keeps everything in lockstep.
- **Publishing a tag where `publish.yml` failed** — fix the underlying issue, delete the bad tag, re-cut via the script.

## Roll-back

1. **Don't unpublish from npm** unless someone with elevated permissions has assessed the impact.
2. **Deprecate the bad version**:
   ```bash
   npm deprecate "genlayer@<X.Y.Z>" "broken release; install <X.Y.Z+1> or later"
   ```
3. **Ship a follow-up patch** via the same flow.

## Why no auto-bump?

The previous flow auto-bumped on every push to `main` (and `staging` for betas). Trade-off:
- Lost: instant publish on merge.
- Gained: a human checkpoint between "code lands" and "users get it"; no accidental major bumps from `BREAKING CHANGE` footers in PR bodies.
