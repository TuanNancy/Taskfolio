#!/usr/bin/env bash
set -euo pipefail
umask 077

# Runs on GitHub Actions. Runtime secrets remain on EC2.
: "${RELEASE_ID:?Set RELEASE_ID}"
: "${API_IMAGE:?Set API_IMAGE}"
: "${GHCR_USER:?Set GHCR_USER}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN}"
: "${EC2_HOST:?Set EC2_HOST}"
: "${EC2_USER:?Set EC2_USER}"
: "${EC2_SSH_KEY:?Set EC2_SSH_KEY}"
: "${EC2_KNOWN_HOSTS:?Set EC2_KNOWN_HOSTS}"
: "${BACKEND_ORIGIN:?Set BACKEND_ORIGIN}"
: "${FRONTEND_ORIGIN:?Set FRONTEND_ORIGIN}"

port=${EC2_PORT:-22}
app_dir=${EC2_APP_DIR:-/opt/taskfolio}
app_dir=${app_dir%/}
fail() { echo "$*" >&2; exit 1; }

# SSH interprets a command string: validate every interpolated argument.
[[ "$RELEASE_ID" =~ ^sha-[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || fail "Invalid release ID."
[[ "$API_IMAGE" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+@sha256:[0-9a-f]{64}$ ]] || fail "Expected a GHCR image digest."
[[ "$GHCR_USER" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]] || fail "Invalid registry user."
[[ "$EC2_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || fail "Use an EC2 DNS name or IPv4 address."
[[ "$EC2_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || fail "Invalid SSH user."
if [[ ! "$port" =~ ^[1-9][0-9]{0,4}$ ]] || (( port > 65535 )); then
  fail "Invalid SSH port."
fi
[[ "$app_dir" =~ ^/[a-zA-Z0-9_./-]+$ && "$app_dir/" != *"/../"* ]] || fail "Use an absolute app directory without spaces or traversal."
for origin in "$BACKEND_ORIGIN" "$FRONTEND_ORIGIN"; do
  [[ "$origin" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail "Use HTTPS origins without paths or trailing slashes."
done

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ssh_dir=$(mktemp -d)
trap 'rm -rf -- "$ssh_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$EC2_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
printf '%s\n' "$EC2_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
ssh_options=(
  -i "$ssh_dir/key"
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$ssh_dir/known_hosts"
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3
)
destination="$EC2_USER@$EC2_HOST"
release_dir="$app_dir/releases/$RELEASE_ID"

# Never overwrite a release: each workflow attempt has a unique directory.
ssh "${ssh_options[@]}" -p "$port" "$destination" "mkdir -p '$app_dir/releases' && mkdir '$release_dir'"
scp "${ssh_options[@]}" -P "$port" \
  "$repo_dir/compose.production.yaml" "$repo_dir/deploy/remote-deploy.sh" \
  "$destination:$release_dir/"

# A short-lived token travels through stdin, never in the remote command line.
printf '%s' "$GHCR_TOKEN" | ssh "${ssh_options[@]}" -p "$port" "$destination" \
  "timeout --signal=TERM --kill-after=600 900 bash '$release_dir/remote-deploy.sh' '$app_dir' '$RELEASE_ID' '$API_IMAGE' '$GHCR_USER' '$BACKEND_ORIGIN' '$FRONTEND_ORIGIN'"
