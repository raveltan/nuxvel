#!/usr/bin/env bash
set -euo pipefail

bump="${1:-}"
case "$bump" in
  patch | minor | major) ;;
  *) echo "usage: scripts/publish.sh patch|minor|major" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "publish from main" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "commit or stash your changes first" >&2
  exit 1
fi

npm whoami >/dev/null
git pull --ff-only

workspaces=(-w packages/nuxt -w packages/cli -w packages/create)
npm version "$bump" --no-git-tag-version --ignore-scripts "${workspaces[@]}" >/dev/null
version="$(node -p "require('./packages/nuxt/package.json').version")"
npm pkg set "peerDependencies.@nuxvel/nuxt=^$version" -w packages/cli
npm install --no-audit --no-fund

echo "Releasing $version"
npm run typecheck
npm test

git commit -am "release: $version"
git tag "v$version"

trap 'npm run dev:prepare -w packages/nuxt' EXIT
npm publish -w packages/nuxt
npm publish -w packages/cli
npm publish -w packages/create

git push
git push origin "v$version"
echo "Published $version"
