release=$NUXVEL_APP_DIR/releases/$NUXVEL_RELEASE
archive=$release.tar.gz
assets=/srv/nuxvel/assets/$NUXVEL_APP/_nuxt

trap 'rm -rf "$release" "$archive"' EXIT
if ! printf '%s  %s\n' "$NUXVEL_SHA256" "$archive" | sha256sum -c --status; then
  echo "The uploaded archive does not match its checksum $NUXVEL_SHA256" >&2
  exit 1
fi
mkdir "$release"
tar -xzf "$archive" -C "$release"
chmod 750 "$release"
rm "$archive"
ln -s ../../shared/.env "$release/.env"
echo "~ extract the release $NUXVEL_RELEASE into $release, with shared/.env"
if [ -d "$release/.output/public/_nuxt" ]; then
  if ! tar -C "$release/.output/public/_nuxt" -c . | sudo -n /usr/local/lib/nuxvel/assets "$NUXVEL_APP" add; then
    echo "The assets helper refused the hashed assets. If it is missing, run nuxvel server:setup and nuxvel app:create first" >&2
    exit 1
  fi
  echo "~ copy its hashed assets into $assets"
fi
trap - EXIT
