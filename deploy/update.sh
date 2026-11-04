#!/bin/bash
set -euo pipefail
exec 9>/run/lock/quinsuper-update.lock
flock -n 9 || exit 0
base=/var/www/quinsuper
repo=/var/lib/quinsuper-deploy/repo.git
if [ ! -d "$repo" ]; then
  git init --bare "$repo"
  git --git-dir="$repo" remote add origin https://github.com/mrbrainzs/pricing_app.git
fi
git --git-dir="$repo" fetch --depth=1 origin refs/heads/deploy/quinsuper:refs/heads/deploy/quinsuper
revision=$(git --git-dir="$repo" rev-parse refs/heads/deploy/quinsuper)
target="$base/releases/$revision"
if [ "$(readlink -f "$base/current" || true)" = "$target" ]; then exit 0; fi
if systemctl is-active --quiet quinsuper-import.service; then echo 'Import in progress; retry next minute'; exit 0; fi
mkdir -p "$target"
git --git-dir="$repo" archive "$revision" | tar -x -C "$target" --no-same-owner
test -s "$target/web/index.html"
test -s "$target/server/server.mjs"
test -s "$target/server/ingest.mjs"
grep -Eq '^RELEASE_SHA=[a-f0-9]{40}$' "$target/release.env"
find "$target" -type d -exec chmod 755 {} +
find "$target" -type f -exec chmod 644 {} +
previous=$(readlink -f "$base/current" || true)
ln -sfn "$target" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl restart quinsuper-api.service
healthy=false
for attempt in $(seq 1 15); do
  if curl -fsS --max-time 3 http://127.0.0.1:3007/api/health > /dev/null; then healthy=true; break; fi
  sleep 1
done
if [ "$healthy" != true ]; then
  if [ -n "$previous" ]; then
    ln -sfn "$previous" "$base/current.next"
    mv -Tf "$base/current.next" "$base/current"
    systemctl restart quinsuper-api.service
  fi
  echo 'Release failed API health check' >&2
  exit 1
fi
echo "Activated $revision"
