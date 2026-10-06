#!/usr/bin/env bash
set -euo pipefail

# Runs on the Actions runner. Only the Compose file and deployment script are copied.
: "${IMAGE_TAG:?Set IMAGE_TAG}"
: "${IMAGE_PREFIX:?Set IMAGE_PREFIX}"
: "${GHCR_USER:?Set GHCR_USER}"
: "${GHCR_TOKEN:?Set GHCR_TOKEN}"
: "${EC2_HOST:?Set EC2_HOST}"
: "${EC2_USER:?Set EC2_USER}"
: "${EC2_SSH_KEY:?Set EC2_SSH_KEY}"
: "${EC2_KNOWN_HOSTS:?Set EC2_KNOWN_HOSTS}"

port=${EC2_PORT:-22}
app_dir=${EC2_APP_DIR:-/opt/taskfolio}
app_dir=${app_dir%/}

# SSH executes a remote command string; restrict interpolated arguments first.
[[ "$IMAGE_TAG" =~ ^sha-[0-9a-f]{40}$ ]] || { echo "Invalid image tag." >&2; exit 1; }
[[ "$IMAGE_PREFIX" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]] || { echo "Invalid GHCR image prefix." >&2; exit 1; }
[[ "$GHCR_USER" =~ ^[a-zA-Z0-9_-]+(\[bot\])?$ ]] || { echo "Invalid registry username." >&2; exit 1; }
[[ "$EC2_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "Use an EC2 DNS name or IPv4 address." >&2; exit 1; }
[[ "$EC2_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || { echo "Invalid SSH username." >&2; exit 1; }
if [[ ! "$port" =~ ^[1-9][0-9]{0,4}$ ]] || (( port > 65535 )); then
  echo "Invalid SSH port." >&2
  exit 1
fi
[[ "$app_dir" =~ ^/[a-zA-Z0-9_./-]+$ ]] || { echo "Use an absolute app directory without spaces." >&2; exit 1; }

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ssh_dir=$(mktemp -d)
trap 'rm -rf -- "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$EC2_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
printf '%s\n' "$EC2_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"

ssh_options=(
  -i "$ssh_dir/key"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$ssh_dir/known_hosts"
  -o ConnectTimeout=15
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)
destination="$EC2_USER@$EC2_HOST"
release_dir="$app_dir/releases/$IMAGE_TAG"

ssh "${ssh_options[@]}" -p "$port" "$destination" "mkdir -p '$release_dir'"
scp "${ssh_options[@]}" -P "$port" \
  "$repo_dir/compose.production.yaml" "$repo_dir/deploy/remote-deploy.sh" \
  "$destination:$release_dir/"

# Send the short-lived registry credential via stdin, not command arguments.
printf '%s' "$GHCR_TOKEN" | ssh "${ssh_options[@]}" -p "$port" "$destination" \
  "bash '$release_dir/remote-deploy.sh' '$app_dir' '$IMAGE_TAG' '$IMAGE_PREFIX' '$GHCR_USER'"
