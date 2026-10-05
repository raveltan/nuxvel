user=$NUXVEL_APP
private=$NUXVEL_APP-private
public=$NUXVEL_APP-public
shared=$NUXVEL_APP_DIR/shared
s3=http://127.0.0.1:8333

set -a
. /etc/nuxvel/seaweedfs.env
set +a

cors="<CORSConfiguration><CORSRule><AllowedHeader>*</AllowedHeader><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedMethod>PUT</AllowedMethod>$(
  for domain in $NUXVEL_DOMAINS; do printf '<AllowedOrigin>https://%s</AllowedOrigin>' "$domain"; done
)<ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>"
lifecycle='<LifecycleConfiguration><Rule><ID>expire-temp-uploads</ID><Filter><Prefix>tmp/</Prefix></Filter><Status>Enabled</Status><Expiration><Days>1</Days></Expiration></Rule></LifecycleConfiguration>'
policy="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\",\"s3:AbortMultipartUpload\",\"s3:ListMultipartUploadParts\"],\"Resource\":[\"arn:aws:s3:::$private\",\"arn:aws:s3:::$private/*\",\"arn:aws:s3:::$public\",\"arn:aws:s3:::$public/*\"]}]}"

weed_shell() {
  local output
  output=$(printf '%s\n' "$@" | /usr/local/bin/weed shell -master=127.0.0.1:9333 2>&1)
  if grep -q '^error' <<<"$output"; then
    echo "$output" >&2
    return 1
  fi
  echo "$output"
}

signed() {
  local credentials=$1
  shift
  printf 'user = "%s"\n' "$credentials" | curl -fsS --aws-sigv4 aws:amz:us-east-1:s3 -K - "$@"
}

admin() {
  signed "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY" "$@"
}

admin_xml_is() {
  [ "$(admin "$s3/$1" 2>/dev/null | grep -v '^<?xml')" = "$2" ]
}

put_xml() {
  admin -o /dev/null -X PUT -H "Content-MD5: $(printf '%s' "$2" | openssl md5 -binary | base64)" --data-binary "$2" "$s3/$1"
}

env_value() {
  sed -n "s/^$1=//p" "$shared/.env" 2>/dev/null
}

set_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$1=" "$shared/.env" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } | deploy_write "$shared/.env"
}

has_credentials() {
  local url credentials
  url=$(env_value NUXT_STORAGE_URL)
  credentials=${url#http://}
  credentials=${credentials%@*}
  [ -n "$credentials" ] && signed "$credentials" -o /dev/null "$s3/$private" 2>/dev/null &&
    signed "$credentials" -o /dev/null "$s3/$public" 2>/dev/null
}

create_credentials() {
  local key secret file
  key=$(openssl rand -hex 10)
  secret=$(openssl rand -hex 32)
  file=$(mktemp)
  printf '%s\n' "$policy" > "$file"
  weed_shell s3.user.list | grep -q "\"$user\"" && weed_shell "s3.user.delete -name $user" >/dev/null
  weed_shell "s3.policy -put -name=$user -file=$file" "s3.user.create -name $user -access_key $key -secret_key $secret" \
    "s3.policy.attach -policy $user -user $user" >/dev/null
  rm "$file"
  set_env NUXT_STORAGE_URL "http://$key:$secret@127.0.0.1:8333"
  for _ in $(seq 50); do has_credentials && return; sleep 0.2; done
  echo "SeaweedFS did not accept the new keys of $user" >&2
  return 1
}

anonymous_is() {
  weed_shell "s3.anonymous.get -bucket $1" 2>/dev/null | grep -qx "Access: $2"
}

set_anonymous() {
  weed_shell "s3.anonymous.set -bucket $1 -access $2" >/dev/null
}

for bucket in "$private" "$public"; do
  admin -o /dev/null -I "$s3/$bucket" 2>/dev/null || change "create the bucket $bucket" admin -o /dev/null -X PUT "$s3/$bucket"
done
has_credentials || change "create the S3 user $user for $private and $public, its URL in $shared/.env" create_credentials
[ "$(env_value NUXT_STORAGE_BUCKET)" = "$private" ] ||
  change "set NUXT_STORAGE_BUCKET=$private in $shared/.env" set_env NUXT_STORAGE_BUCKET "$private"
unset_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$1=" "$shared/.env" || true; } | deploy_write "$shared/.env"
}

if [ -n "$NUXVEL_FILES_DOMAIN" ]; then
  [ "$(env_value NUXT_STORAGE_PUBLIC_URL)" = "https://$NUXVEL_FILES_DOMAIN" ] ||
    change "set NUXT_STORAGE_PUBLIC_URL=https://$NUXVEL_FILES_DOMAIN in $shared/.env" set_env NUXT_STORAGE_PUBLIC_URL "https://$NUXVEL_FILES_DOMAIN"
else
  [ -z "$(env_value NUXT_STORAGE_PUBLIC_URL)" ] || change "remove NUXT_STORAGE_PUBLIC_URL from $shared/.env" unset_env NUXT_STORAGE_PUBLIC_URL
fi
anonymous_is "$private" none || change "block public access to $private" set_anonymous "$private" none
anonymous_is "$public" Read || change "let anyone read the files of $public" set_anonymous "$public" Read
for bucket in "$private" "$public"; do
  [ -z "$NUXVEL_DOMAINS" ] || admin_xml_is "$bucket?cors" "$cors" || change "allow uploads and downloads from $NUXVEL_DOMAINS in $bucket" put_xml "$bucket?cors" "$cors"
done
admin_xml_is "$private?lifecycle" "$lifecycle" ||
  change "delete the files under tmp/ of $private after one day" put_xml "$private?lifecycle" "$lifecycle"
