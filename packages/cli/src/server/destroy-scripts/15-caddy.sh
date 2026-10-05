site=/etc/caddy/sites/$NUXVEL_APP.caddy

remove_site() {
  rm "$site"
  /usr/local/lib/nuxvel/caddy-reload
}

[ ! -f "$site" ] || change "remove the Caddy site $site" remove_site
