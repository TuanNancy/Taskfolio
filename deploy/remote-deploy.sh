#!/usr/bin/env bash
set -euo pipefail
umask 077

# Runs on EC2. stdin is the temporary registry credential, consumed by docker login.
app_dir=${1:?App directory required}
release=${2:?Release ID required}
image=${3:?Image digest required}
registry_user=${4:?Registry user required}
backend_origin=${5:?Backend origin required}
frontend_origin=${6:?Frontend origin required}
fail() { echo "$*" >&2; exit 1; }
[[ "$app_dir" =~ ^/[a-zA-Z0-9_./-]+$ && "$app_dir/" != *"/../"* ]] || fail "Invalid app directory."
[[ "$release" =~ ^sha-[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || fail "Invalid release ID."
[[ "$image" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] || fail "Invalid image digest."
[[ "$registry_user" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]] || fail "Invalid registry user."
for origin in "$backend_origin" "$frontend_origin"; do
  [[ "$origin" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail "Invalid HTTPS origin."
done
release_dir="$app_dir/releases/$release"
env_file="$app_dir/backend.env"
[[ -r "$env_file" && -r "$release_dir/compose.production.yaml" ]] || fail "Missing server environment or release Compose file."
for tool in docker curl jq flock; do command -v "$tool" > /dev/null || fail "Missing $tool on EC2."; done

# Also serialize manual invocations, beyond the Actions concurrency group.
exec 9> "$app_dir/deploy.lock"
flock -n 9 || fail "Another backend deployment is running."
[[ ! -e "$release_dir/images.env" ]] || fail "Release already attempted; use a new workflow attempt."
docker info > /dev/null
docker compose version > /dev/null

previous=""
if [[ -e "$app_dir/current-release" ]]; then
  previous=$(cat "$app_dir/current-release")
  [[ "$previous" =~ ^sha-[0-9a-f]{40}-[0-9]+-[0-9]+$ && "$previous" != "$release" ]] || fail "Invalid current-release marker."
  [[ -r "$app_dir/releases/$previous/images.env" && -r "$app_dir/releases/$previous/compose.production.yaml" ]] || fail "Previous release files are missing."
fi
containers=$(docker ps --filter publish=5001 --format '{{.ID}} {{.Label "com.docker.compose.project"}}')
while read -r container project; do
  [[ -z "$container" ]] && continue
  [[ "$project" == taskfolio-backend ]] || fail "Port 5001 belongs to an unmanaged container; complete the documented migration first."
  [[ -n "$previous" ]] || fail "A managed API is running without a current-release marker."
done <<< "$containers"

auth_dir=$(mktemp -d)
plugin_dir="${DOCKER_CONFIG:-$HOME/.docker}/cli-plugins"
export DOCKER_CONFIG="$auth_dir"
updating=0
compose() {
  local target=$1
  shift
  # Caller environment must not override release-pinned image/config paths.
  env -u API_IMAGE -u BACKEND_ENV_FILE docker compose --project-name taskfolio-backend \
    --env-file "$app_dir/releases/$target/images.env" \
    -f "$app_dir/releases/$target/compose.production.yaml" "$@"
}
check_http() {
  local url=$1 expected=$2 expression=$3 status attempt
  for attempt in 1 2 3 4 5 6; do
    if status=$(curl --silent --show-error --connect-timeout 5 --max-time 10 \
      --output "$auth_dir/response.json" --write-out '%{http_code}' "$url") &&
      [[ "$status" == "$expected" ]] && jq -e "$expression" "$auth_dir/response.json" > /dev/null 2>&1; then
      return 0
    fi
    [[ "$attempt" == 6 ]] || sleep 5
  done
  echo "Health check failed: $url (expected HTTP $expected and matching JSON)." >&2
  return 1
}
healthy() {
  check_http "http://127.0.0.1:5001/health/ready" 200 '.status == "ready"' &&
    check_http "$backend_origin/health/ready" 200 '.status == "ready"' &&
    check_http "$frontend_origin/api/auth/me" 401 '.code == "UNAUTHENTICATED"'
}
finish() {
  local status=$?
  trap - EXIT INT TERM HUP
  # The atomic marker move is the commit point, even if a signal arrives right after it.
  if [[ -r "$app_dir/current-release" ]] && [[ "$(cat "$app_dir/current-release")" == "$release" ]]; then
    updating=0
  fi
  if [[ "$status" != 0 && "$updating" == 1 ]]; then
    if [[ -n "$previous" ]]; then
      echo "Deployment failed; restoring $previous." >&2
      if compose "$previous" up --detach --no-build --pull never --wait --wait-timeout 180 api && healthy; then
        echo "Rollback healthy. current-release remains $previous." >&2
      else
        echo "ROLLBACK FAILED. Inspect the API on EC2; current-release is the last known successful release." >&2
      fi
    else
      echo "First deployment failed; no previous managed release is available." >&2
      compose "$release" down || echo "Could not remove the failed first deployment." >&2
    fi
  fi
  rm -rf -- "$auth_dir"
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Keep user-installed Compose discoverable without copying saved Docker credentials.
jq -n --arg plugins "$plugin_dir" '{cliPluginsExtraDirs: [$plugins]}' > "$auth_dir/config.json"
printf 'API_IMAGE=%s\nBACKEND_ENV_FILE=%s\n' "$image" "$env_file" > "$release_dir/images.env"
compose "$release" config --quiet
if [[ -n "$previous" ]]; then
  compose "$previous" config --quiet
  previous_image=$(sed -n 's/^API_IMAGE=//p' "$app_dir/releases/$previous/images.env")
  [[ "$previous_image" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] || fail "Previous image is not digest-pinned."
  docker image inspect "$previous_image" > /dev/null || fail "Previous image is unavailable locally; restore it before deploying."
fi
docker login ghcr.io --username "$registry_user" --password-stdin
# Pull must succeed before the running API is changed.
compose "$release" pull api
updating=1
compose "$release" up --detach --no-build --pull never --wait --wait-timeout 180 api
healthy

# Write markers only after readiness and the external proxy path pass.
if [[ -n "$previous" ]]; then
  printf '%s\n' "$previous" > "$app_dir/previous-release.tmp"
  mv -- "$app_dir/previous-release.tmp" "$app_dir/previous-release"
fi
printf '%s\n' "$release" > "$app_dir/current-release.tmp"
mv -- "$app_dir/current-release.tmp" "$app_dir/current-release"
updating=0
echo "Backend healthy: $release ($image)"
