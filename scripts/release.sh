#!/usr/bin/env bash
# Cut a release on the current stable branch.
#
# Bumps package.json, prepends CHANGELOG.md, commits, tags vX.Y.Z, and
# pushes both the branch commit and the tag. publish.yml takes over from
# the tag push (build → npm publish → GitHub Release).
#
# Releases are deliberate. There is no auto-bump on push; only this
# script is supposed to create release tags. Run from the major branch
# you want to ship a release on (e.g. v0.39 for v0.39.x).
#
# Usage:
#   scripts/release.sh <X.Y.Z>     # explicit semver — recommended
#   scripts/release.sh patch       # 0.39.1 → 0.39.2
#   scripts/release.sh minor       # 0.39.1 → 0.40.0 — refused unless --allow-major
#   scripts/release.sh major       # 0.39.1 → 1.0.0  — refused unless --allow-major
#   scripts/release.sh --allow-major <X.Y.Z>
#
# Semver-zero rule: while the major is 0, the MINOR is the breaking-
# change boundary (per semver). 0.39 → 0.40 IS a major bump. The script
# refuses both `minor` and `major` keywords without --allow-major while
# the current major is 0.
#
# Pre-flight (each check refuses to proceed on failure):
#   - On a v<MAJOR>[.<MINOR>] branch (refuses on main / feature branches)
#   - Working tree clean
#   - Local HEAD matches origin/<branch>
#   - Latest CI run on HEAD is green

set -euo pipefail

ALLOW_MAJOR=0
if [ "${1:-}" = "--allow-major" ]; then
  ALLOW_MAJOR=1
  shift
fi

VERSION_ARG="${1:-}"
if [ -z "$VERSION_ARG" ]; then
  echo "Usage: $0 [--allow-major] <X.Y.Z>|patch|minor|major" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

branch="$(git rev-parse --abbrev-ref HEAD)"
if ! [[ "$branch" =~ ^v[0-9]+(\.[0-9]+)?(-dev)?$ ]]; then
  cat >&2 <<EOF
Refusing to release from '$branch'.

Release branches in this repo are named after the major they ship
(v0.39, v0.40, ...) or the next-major dev line (v0.40-dev). main has
been retired — see CONTRIBUTING.md for the branch model.

If you intended to ship a v0.39.x release, run:
  git checkout v0.39 && git pull --ff-only && scripts/release.sh ...
EOF
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree not clean. Stash or commit first." >&2
  exit 1
fi

git fetch --tags origin "$branch"
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "origin/$branch")"
if [ "$local_sha" != "$remote_sha" ]; then
  cat >&2 <<EOF
Local $branch ($local_sha) does not match origin/$branch ($remote_sha).
Pull (or push) before releasing.
EOF
  exit 1
fi

if command -v gh >/dev/null 2>&1; then
  status="$(gh run list --branch "$branch" --commit "$local_sha" --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "")"
  case "$status" in
    success) ;;
    "" )
      echo "Warning: no CI run found for $local_sha on $branch. Continuing anyway." >&2
      ;;
    *)
      echo "Latest CI on $branch@$local_sha is '$status' (not success). Refusing to release a red commit." >&2
      exit 1
      ;;
  esac
fi

current_version="$(node -p "require('./package.json').version")"

case "$VERSION_ARG" in
  major|minor|patch)
    next_version="$(node -e "
      const semver = require('semver');
      const cur = require('./package.json').version;
      const inc = '$VERSION_ARG';
      const out = semver.inc(cur, inc);
      if (!out) { console.error('semver.inc failed for', cur, inc); process.exit(1); }
      console.log(out);
    ")"
    ;;
  *)
    next_version="$VERSION_ARG"
    ;;
esac

if ! node -e "if (!require('semver').valid('$next_version')) process.exit(1)"; then
  echo "Not a valid semver: $next_version" >&2
  exit 2
fi

cur_major="${current_version%%.*}"
next_major="${next_version%%.*}"
cur_minor="$(node -p "require('semver').minor('$current_version')")"
next_minor="$(node -p "require('semver').minor('$next_version')")"

if [ "$cur_major" = "0" ]; then
  if [ "$next_major" != "0" ] || [ "$next_minor" != "$cur_minor" ]; then
    if [ "$ALLOW_MAJOR" -ne 1 ]; then
      cat >&2 <<EOF
Refusing $current_version → $next_version without --allow-major.

This package is still on a 0.x line, so the MINOR component is the
breaking-change boundary (per semver). 0.$cur_minor → 0.$next_minor
counts as a major bump and should land on a new branch (v0.$next_minor)
following the model in CONTRIBUTING.md.

If you actually want this on the current branch, pass --allow-major.
EOF
      exit 1
    fi
  fi
elif [ "$next_major" != "$cur_major" ] && [ "$ALLOW_MAJOR" -ne 1 ]; then
  cat >&2 <<EOF
Refusing major bump $current_version → $next_version without --allow-major.

In this repo's release model, a major bump means cutting a new branch
(v$next_major). Don't tag a major on top of the v$cur_major branch.
EOF
  exit 1
fi

echo "Releasing v$next_version on $branch (was v$current_version)."

# release-it bumps + CHANGELOG + commit + tag + push in one shot.
# --no-npm.publish keeps npm out of the dev machine; --no-github.release
# defers the GH release to publish.yml on the tag arrival.
npx release-it "$next_version" --ci \
  --no-npm.publish \
  --no-github.release

echo
echo "Pushed v$next_version. publish.yml will fire on the tag and ship to npm."
echo "Track it at: https://github.com/genlayerlabs/genlayer-cli/actions"
