#!/usr/bin/env bash
set -euo pipefail

# Runs on EC2; stdin contains the short-lived GHCR credential.
app_dir=${1:?App directory required}
image_tag=${2:?Image tag required}
image_prefix=${3:?Image prefix required}
registry_user=${4:?Registry username required}

[[ "$image_tag" =~ ^sha-[0-9a-f]{40}$ ]] || { echo "Invalid image tag." >&2; exit 1; }
[[ "$image_prefix" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]] || { echo "Invalid GHCR image prefix." >&2; exit 1; }
release_dir="$app_dir/releases/$image_tag"
env_file="$app_dir/deploy/.env.production"
[[ -r "$env_file" ]] || { echo "Missing server configuration: $env_file" >&2; exit 1; }
[[ -r "$release_dir/compose.production.yaml" ]] || { echo "Missing release Compose file." >&2; exit 1; }
command -v curl > /dev/null
docker info > /dev/null

# Credentials exist only for this invocation, including when pull/health checks fail.
auth_dir=$(mktemp -d)
trap 'rm -rf -- "$auth_dir"' EXIT
export DOCKER_CONFIG="$auth_dir"
export IMAGE_PREFIX="$image_prefix" APP_VERSION="$image_tag"
printf 'IMAGE_PREFIX=%s\nAPP_VERSION=%s\n' "$image_prefix" "$image_tag" > "$release_dir/images.env"
compose=(docker compose --env-file "$env_file" --env-file "$release_dir/images.env" -f "$release_dir/compose.production.yaml")
"${compose[@]}" config --quiet
docker login ghcr.io --username "$registry_user" --password-stdin

# Pull both images before updating services; deployment never builds on EC2.
"${compose[@]}" pull
"${compose[@]}" up --detach --no-build --pull never --wait --wait-timeout 180

domain=$("${compose[@]}" exec -T web printenv SITE_ADDRESS)
[[ "$domain" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || { echo "Invalid deployed domain." >&2; exit 1; }
for path in /health/ready /login; do
  status=$(curl --fail --silent --show-error \
    --retry 6 --retry-delay 5 --retry-max-time 180 --retry-all-errors \
    --connect-timeout 10 --max-time 15 --output /dev/null --write-out '%{http_code}' \
    "https://$domain$path")
  [[ "$status" == 200 ]] || { echo "Unexpected HTTP $status for $path" >&2; exit 1; }
done

# Mark success only after the containers and public HTTPS routes are ready.
printf '%s\n' "$image_tag" > "$app_dir/.current-release.tmp"
mv -- "$app_dir/.current-release.tmp" "$app_dir/current-release"
echo "Deployment healthy: $image_tag"
