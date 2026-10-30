#!/usr/bin/env bash
# Build first, switch after health checks, restore the previous app on failure.
set -euo pipefail
RELEASE="${1:?Release path required}"
DOMAIN="${2:?Domain required}"
PORT="${3:-8080}"
SOURCE="$RELEASE/crawl-ref/source"
cd "$SOURCE"
printf '0.33-coop\n' > util/release_ver
make "-j${BUILD_JOBS:-2}" WEBTILES=y NOWIZARD=y crawl webserver docs
./crawl -version
PYTHONPATH=webserver python3 -m unittest webtiles.chat_tags_test webtiles.game_library_test webtiles.character_preview_test webtiles.asset_revision_test webtiles.starting_weapons_test webtiles.gameplay_protocol_test webtiles.party_control_test webtiles.skill_training_test
python3 webserver/tests/native-character-preview.py --binary "$SOURCE/crawl"
sudo -u dcss python3 "$RELEASE/deploy/verify_preview_runtime.py" "$SOURCE"

for state_path in rcs saves; do
    # Native validation may create an empty default directory. Never nest the
    # state link inside it, and refuse to remove any directory containing data.
    if [[ -d "$SOURCE/$state_path" && ! -L "$SOURCE/$state_path" ]]; then
        rmdir "$SOURCE/$state_path"
    fi
    ln -sfnT "/var/lib/dcss/$state_path" "$SOURCE/$state_path"
done
ln -s /etc/dcss/webtiles.yml "$SOURCE/webserver/config.yml"
install -m 640 -o root -g dcss "$RELEASE/deploy/webtiles.yml" /etc/dcss/webtiles.yml
sed -i "s/8080/$PORT/; s/dcss.iancaltabiano.com/$DOMAIN/g" /etc/dcss/webtiles.yml
chown -R dcss:dcss /var/lib/dcss
install -m 644 "$RELEASE/deploy/dcss-coop.service" /etc/systemd/system/
install -m 644 "$RELEASE/deploy/dcss-health.service" "$RELEASE/deploy/dcss-health.timer" /etc/systemd/system/
install -m 644 "$RELEASE/deploy/dcss-recovery.service" "$RELEASE/deploy/dcss-recovery.timer" /etc/systemd/system/
systemctl daemon-reload
PREVIOUS="$(readlink -f /opt/dcss/current || true)"
if [[ -d "$PREVIOUS" ]]; then
    systemctl stop dcss-coop
    ln -sfn "$PREVIOUS" /opt/dcss/previous
fi
python3 "$RELEASE/deploy/migrate_library_paths.py" /var/lib/dcss/rcs/library
ln -sfn "$RELEASE" /opt/dcss/current.next
mv -Tf /opt/dcss/current.next /opt/dcss/current
systemctl enable dcss-coop
systemctl restart dcss-coop
healthy=false
for attempt in {1..45}; do
    if curl -fsS "http://127.0.0.1:$PORT/status/version/" >/dev/null; then healthy=true; break; fi
    sleep 2
done
if ! "$healthy"; then
    journalctl -u dcss-coop -n 60 --no-pager >&2
    if [[ -d "$PREVIOUS" ]]; then
        ln -sfn "$PREVIOUS" /opt/dcss/current.next
        mv -Tf /opt/dcss/current.next /opt/dcss/current
        systemctl restart dcss-coop
    fi
    echo 'New release failed its health check.' >&2; exit 1
fi

sed "s/dcss.iancaltabiano.com/$DOMAIN/g; s/8080/$PORT/g" "$RELEASE/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable caddy dcss-health.timer dcss-recovery.timer
systemctl reload-or-restart caddy
systemctl start dcss-health.timer dcss-recovery.timer
systemctl start dcss-health.service
systemctl start dcss-recovery.service
printf '%s\n' "$RELEASE" > /var/lib/dcss/release.txt
echo "Release healthy locally. DNS and trusted HTTPS still require external verification."
