shared=$NUXVEL_APP_DIR/shared

set_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$1=" "$shared/.env" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } | deploy_write "$shared/.env"
}

secret=$(sed -n 's/^NUXT_AUTH_SECRET=//p' "$shared/.env" 2>/dev/null || true)
[ "${#secret}" -ge 32 ] ||
  change "set a random NUXT_AUTH_SECRET in $shared/.env" set_env NUXT_AUTH_SECRET "$(openssl rand -hex 32)"

chain_secret=$(sed -n 's/^NUXT_AUDIT_CHAIN_SECRET=//p' "$shared/.env" 2>/dev/null || true)
[ -n "$chain_secret" ] ||
  change "set a random NUXT_AUDIT_CHAIN_SECRET in $shared/.env" set_env NUXT_AUDIT_CHAIN_SECRET "$(openssl rand -hex 32)"

og_secret=$(sed -n 's/^NUXT_OG_IMAGE_SECRET=//p' "$shared/.env" 2>/dev/null || true)
[ -n "$og_secret" ] ||
  change "set a random NUXT_OG_IMAGE_SECRET in $shared/.env" set_env NUXT_OG_IMAGE_SECRET "$(openssl rand -hex 32)"

site_url=$(sed -n 's/^NUXT_SITE_URL=//p' "$shared/.env" 2>/dev/null || true)
first_domain=${NUXVEL_DOMAINS%% *}
[ -n "$site_url" ] || [ -z "$first_domain" ] ||
  change "set NUXT_SITE_URL=https://$first_domain in $shared/.env" set_env NUXT_SITE_URL "https://$first_domain"
