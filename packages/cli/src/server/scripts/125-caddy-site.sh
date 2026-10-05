helper=/usr/local/lib/nuxvel/caddy-site
caddy_site=$(cat <<'HELPER'
#!/usr/bin/node
const { execFileSync } = require("node:child_process");
const { closeSync, constants, existsSync, openSync, readFileSync, rmSync, statSync, writeFileSync } = require("node:fs");

const [app, color] = process.argv.slice(2);
const apps = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8")).apps ?? {};
if (!Object.hasOwn(apps, app) || !["blue", "green"].includes(color)) {
  console.error("Usage: caddy-site <app> <blue|green>, for an app in /srv/nuxvel/server.json");
  process.exit(2);
}

const caller = Number(process.env.SUDO_UID ?? 0);
if (caller !== 0 && statSync(apps[app].folder).uid !== caller) {
  console.error(`You do not own ${apps[app].folder}, so you cannot change the app ${app}`);
  process.exit(2);
}

const { folder, ports, domains = [], redirects = {}, filesDomain } = apps[app];
const upstream = `127.0.0.1:${ports[color][0]}`;
const split = (target) => {
  const slash = target.indexOf("/");
  return slash === -1 ? { host: target, path: "" } : { host: target.slice(0, slash), path: target.slice(slash) };
};

const rules = new Map(domains.map((domain) => [domain, []]));
for (const [from, to] of Object.entries(redirects)) {
  const source = split(from);
  const target = split(to);
  const host = target.host || (source.host && !domains.includes(source.host) ? domains[0] : "");
  const location = host ? `https://${host}${target.path || (source.path ? "/" : "{uri}")}` : target.path;
  const rule = source.path ? `redir ${source.path} ${location} permanent` : `redir ${location} permanent`;
  for (const site of source.host ? [source.host] : domains) rules.set(site, [...(rules.get(site) ?? []), rule]);
}

const appSite = (domain) => `${domain} {
${rules.get(domain).map((rule) => `\t${rule}\n`).join("")}\tlog {
\t\toutput file /var/log/caddy/${app}.access.log {
\t\t\tmode 644
\t\t}
\t\tformat filter {
\t\t\trequest>uri regexp (/reset-password/)[^/?]*|([?]).* \${1}\${2}REDACTED
\t\t\trequest>headers>Referer delete
\t\t\twrap json
\t\t}
\t}
\tencode zstd gzip
\trequest_body {
\t\tmax_size 8MB
\t}
\thandle /_nuxt/* {
\t\troot * /srv/nuxvel/assets/${app}
\t\theader Cache-Control "public, max-age=31536000, immutable"
\t\tfile_server
\t}
\thandle {
\t\treverse_proxy ${upstream} {
\t\t\theader_up -Forwarded
\t\t\tlb_try_duration 5s
\t\t\thealth_uri /api/health/live
\t\t\tflush_interval -1
\t\t}
\t}
}
`;
const redirectSite = (domain) => `${domain} {
${rules.get(domain).map((rule) => `\t${rule}\n`).join("")}\trespond 404
}
`;

const filesSite = (domain) => `${domain} {
\t@buckets path /${app}-private/* /${app}-public/*
\thandle @buckets {
\t\theader X-Content-Type-Options nosniff
\t\theader Content-Security-Policy sandbox
\t\treverse_proxy 127.0.0.1:8333
\t}
\thandle {
\t\trespond 404
\t}
}
`;

const sites = [...rules.keys()].map((domain) => (domains.includes(domain) ? appSite(domain) : redirectSite(domain)));
const site = [...sites, ...(filesDomain ? [filesSite(filesDomain)] : [])].join("\n");
const accessLog = `/var/log/caddy/${app}.access.log`;
closeSync(openSync(accessLog, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o644));
execFileSync("chown", ["-h", "caddy:caddy", accessLog]);
const file = `/etc/caddy/sites/${app}.caddy`;
const previous = existsSync(file) ? readFileSync(file, "utf8") : undefined;
writeFileSync(file, site, { mode: 0o644 });
try {
  execFileSync("/usr/local/lib/nuxvel/caddy-reload", { stdio: "inherit" });
} catch {
  if (previous === undefined) rmSync(file);
  else writeFileSync(file, previous);
  console.error(`Caddy refused the new site of ${app}, ${file} is unchanged`);
  process.exit(1);
}
console.log(`Caddy serves ${app} from ${color} on ${upstream}`);
HELPER
)

file_is "$helper" "$caddy_site" || change "write $helper" write_file 755 "$helper" "$caddy_site"

file_is /usr/local/lib/nuxvel/assets "$NUXVEL_ASSETS_HELPER" ||
  change "write /usr/local/lib/nuxvel/assets" write_file 755 /usr/local/lib/nuxvel/assets "$NUXVEL_ASSETS_HELPER"
