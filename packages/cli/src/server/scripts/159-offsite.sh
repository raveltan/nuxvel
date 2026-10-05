env_file=/etc/nuxvel/offsite.env
versions_tried=/etc/nuxvel/offsite-versions-tried

offsite() {
  (set -a && . "$1" && rclone "${@:2}")
}

use_offsite() {
  local check=/etc/nuxvel/offsite.env.nuxvel-check output
  (umask 077 && printf '%s\n' "$1" > "$check")
  local probe=offsite:$NUXVEL_OFFSITE_BUCKET/.nuxvel-check
  if ! output=$(offsite "$check" mkdir "offsite:$NUXVEL_OFFSITE_BUCKET" 2>&1) || ! output=$(offsite "$check" lsf "offsite:$NUXVEL_OFFSITE_BUCKET" --max-depth 1 2>&1) ||
    ! output=$(printf 'nuxvel\n' | offsite "$check" rcat "$probe" 2>&1) || ! output=$(offsite "$check" deletefile "$probe" 2>&1); then
    rm "$check"
    echo "The off-site bucket $NUXVEL_OFFSITE_BUCKET refused the credentials of backups.offsite:" >&2
    echo "$output" >&2
    return 1
  fi
  mv "$check" "$env_file"
  rm -f "$versions_tried"
}

keep_versions() {
  offsite "$env_file" backend versioning "offsite:$NUXVEL_OFFSITE_BUCKET" Enabled >/dev/null 2>&1 || touch "$versions_tried"
}

if [ -z "$NUXVEL_OFFSITE" ]; then
  [ -f "$env_file" ] || echo "! No off-site backup target: the backups stay on this server, and are lost with it. Set backups.offsite in nuxvel.deploy.ts"
else
  dpkg -s rclone >/dev/null 2>&1 || change "install rclone" apt_install rclone
  file_is "$env_file" "$NUXVEL_OFFSITE" || change "upload the backups to the off-site bucket $NUXVEL_OFFSITE_BUCKET" use_offsite "$NUXVEL_OFFSITE"
  if [ -f "$env_file" ] && [ ! -f "$versions_tried" ] && [ "$(offsite "$env_file" backend versioning "offsite:$NUXVEL_OFFSITE_BUCKET" 2>/dev/null | tr -d '"')" != Enabled ]; then
    change "keep the versions of the files in the off-site bucket $NUXVEL_OFFSITE_BUCKET" keep_versions
  fi
  [ ! -f "$versions_tried" ] ||
    echo "! The off-site bucket $NUXVEL_OFFSITE_BUCKET cannot keep versions: a deleted or changed file there is gone. Turn on versioning or a retention lock at your provider if it offers one"
fi
