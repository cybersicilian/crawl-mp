#!/usr/bin/env bash
# Runs on the dedicated VM; only an empty state disk may be formatted.
set -euo pipefail
ARCHIVE="${1:?Source archive required}"
RELEASE_ID="${2:?Release ID required}"
DOMAIN="${3:?Domain required}"
PORT="${4:-8080}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends advancecomp bison build-essential ca-certificates curl debian-keyring debian-archive-keyring apt-transport-https gnupg flex git liblua5.4-dev libncursesw5-dev libpng-dev libsqlite3-dev pkg-config pngcrush python3 python3-tornado python3-yaml rsync zlib1g-dev
if ! command -v caddy >/dev/null; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /tmp/caddy.gpg
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
    chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y caddy
fi

STATE_DEVICE=/dev/disk/by-id/google-dcss-data
for attempt in {1..30}; do [[ -e "$STATE_DEVICE" ]] && break; sleep 2; done
[[ -b "$STATE_DEVICE" ]]
filesystem="$(blkid -s TYPE -o value "$STATE_DEVICE" || true)"
if [[ -z "$filesystem" ]]; then
    [[ -z "$(lsblk -n -o FSTYPE "$STATE_DEVICE" | tr -d '[:space:]')" ]]
    [[ "$(lsblk -n -o TYPE "$STATE_DEVICE" | wc -l)" -eq 1 ]]
    mkfs.ext4 -L dcss-state "$STATE_DEVICE"
elif [[ "$filesystem" != ext4 ]]; then
    echo 'Unexpected filesystem on DCSS state disk; refusing to modify it.' >&2; exit 1
fi
mkdir -p /var/lib/dcss
STATE_UUID="$(blkid -s UUID -o value "$STATE_DEVICE")"
if ! grep -q "UUID=$STATE_UUID " /etc/fstab; then
    printf 'UUID=%s /var/lib/dcss ext4 defaults 0 2\n' "$STATE_UUID" >> /etc/fstab
fi
mountpoint -q /var/lib/dcss || mount /var/lib/dcss
id -u dcss >/dev/null 2>&1 || useradd --system --home-dir /var/lib/dcss --shell /usr/sbin/nologin dcss
install -d -o dcss -g dcss -m 750 /var/lib/dcss/rcs /var/lib/dcss/saves /var/lib/dcss/recovery
install -d -m 755 /opt/dcss/releases /etc/dcss

# Build with two workers and swap to avoid exhausting this 4 GiB runtime VM.
if [[ ! -f /swapfile ]]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
fi
swapon --show=NAME --noheadings | grep -qx /swapfile || swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

RELEASE="/opt/dcss/releases/$RELEASE_ID"
[[ ! -e "$RELEASE" ]]
mkdir "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
chmod +x "$RELEASE"/deploy/*.sh
"$RELEASE/deploy/install_release.sh" "$RELEASE" "$DOMAIN" "$PORT"
rm -f "$ARCHIVE"
