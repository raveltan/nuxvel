url=$(sed -n 's/^NUXT_REDIS_URL=//p' "$NUXVEL_APP_DIR/shared/.env")
prefix=$(sed -n 's/^NUXT_REDIS_PREFIX=//p' "$NUXVEL_APP_DIR/shared/.env")
credentials=${url#redis://}
credentials=${credentials%@*}
address=${url##*@}
address=${address%%/*}
export REDISCLI_AUTH=${credentials#*:}
redis() {
  redis-cli --no-auth-warning -h "${address%:*}" -p "${address##*:}" --user "${credentials%%:*}" "$@" </dev/null
}
total=0
for key in $(redis --scan --pattern "${prefix}bull:*:failed"); do
  total=$((total + $(redis zcard "$key")))
done
echo "@failed $total"
