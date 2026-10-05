user=$NUXVEL_APP

set -a
. /etc/nuxvel/seaweedfs.env
set +a

weed_shell() {
  local output
  output=$(printf '%s\n' "$@" | /usr/local/bin/weed shell -master=127.0.0.1:9333 2>&1)
  if grep -q '^error' <<<"$output"; then
    echo "$output" >&2
    return 1
  fi
  echo "$output"
}

has_bucket() {
  printf 'user = "%s"\n' "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" | curl -fsS -o /dev/null -I --aws-sigv4 aws:amz:us-east-1:s3 -K - "http://127.0.0.1:8333/$1" 2>/dev/null
}

delete_bucket() {
  weed_shell "s3.bucket.delete -name $1" >/dev/null
}

remove_user() {
  weed_shell "s3.user.delete -name $user" "s3.policy -delete -name=$user" >/dev/null
}

for bucket in "$NUXVEL_APP-private" "$NUXVEL_APP-public"; do
  ! has_bucket "$bucket" || change "delete the bucket $bucket and its files" delete_bucket "$bucket"
done
! weed_shell s3.user.list | grep -q "\"$user\"" || change "remove the S3 user $user" remove_user
