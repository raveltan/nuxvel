import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src", import.meta.url));
const setupDir = join(src, "setup");
const composablesDir = join(src, "runtime/app/composables");
const componentsDir = join(src, "runtime/app/components");

const SERVER_FOLDER_TOPICS = {
  actions: "actions",
  audit: "audit",
  backfills: "backfills",
  billing: "billing",
  cache: "cache",
  database: "database",
  seeders: "database",
  errors: "api",
  events: "events",
  flags: "flags",
  i18n: "i18n",
  jobs: "queues",
  logging: "observability",
  mail: "mail",
  notifications: "notifications",
  policies: "authorization",
  privacy: "privacy",
  push: "push",
  realtime: "realtime",
  redis: "redis",
  security: "security",
  storage: "storage",
  trpc: "api",
  flash: "api",
  webhooks: "webhooks",
  maintenance: "maintenance",
};

const SERVER_FILE_TOPICS = {
  "server/clock/now": "observability",
  "server/discovery/renamed": "observability",
  "server/utils/config": "observability",
  "server/utils/audit": "audit",
  "server/utils/auth": "auth",
  "server/utils/use-auth": "auth",
  "server/utils/define-validated-handler": "api",
};

const APP_FILE_TOPICS = {
  "app/composables/list-rows": "ui",
  "app/composables/optimistic": "api",
  "app/composables/router-types": "api",
  "app/composables/unwrap-auth": "auth",
  "app/composables/use-action-form": "forms",
  "app/composables/use-change-email": "auth",
  "app/composables/use-channel": "realtime",
  "app/composables/use-experiment": "flags",
  "app/composables/use-flag": "flags",
  "app/composables/use-flash": "ui",
  "app/composables/use-form-errors": "forms",
  "app/composables/use-job-channel": "realtime",
  "app/composables/use-live-query": "api",
  "app/composables/use-maintenance": "maintenance",
  "app/composables/use-notifications": "notifications",
  "app/composables/use-presence": "realtime",
  "app/composables/use-resend-verification": "auth",
  "app/composables/use-route-input": "ui",
  "app/composables/use-sessions": "auth",
  "app/composables/use-timezone": "ui",
  "app/composables/use-two-factor": "auth",
  "app/composables/use-upload": "storage",
  "app/composables/use-user": "auth",
  "app/seo/use-seo": "seo",
  "app/seo/use-seo-og-image": "seo",
  "app/trpc/is-network-error": "api",
  "app/trpc/api": "api",
  "app/auth/client": "auth",
  "app/ui/use-confirm": "ui",
  "app/ui/use-ui-locale": "ui",
  "app/maintenance/is-maintenance-error": "maintenance",
  "app/pwa/use-push": "pwa",
  "app/ui/SocialSignIn.vue": "auth",
  "app/ui/DataTable.vue": "ui",
  "app/ui/SearchInput.vue": "ui",
  "app/ui/UploadField.vue": "storage",
  "app/ui/ActionForm.vue": "forms",
  "app/ui/ActionField.vue": "forms",
  "app/ui/AuthForm.vue": "auth",
  "app/ui/PresenceAvatars.vue": "realtime",
  "app/ui/TypingIndicator.vue": "realtime",
  "app/ui/NotificationBell.vue": "notifications",
  "app/ui/PwaInstallPrompt.vue": "pwa",
  "app/ui/PushToggle.vue": "pwa",
  "app/ui/DateTime.vue": "ui",
  "app/ui/SafeHtml.vue": "ui",
  "app/maintenance/MaintenanceBanner.vue": "maintenance",
  "app/maintenance/Maintenance.vue": "maintenance",
  "app/maintenance/UiMaintenance.vue": "maintenance",
  "app/query-state/QueryState.vue": "api",
  "app/query-state/UiQueryState.vue": "api",
  "app/components/DateTime.vue": "ui",
  "app/components/SafeHtml.vue": "ui",
};

const SHARED_FOLDER_TOPICS = {
  pagination: "pagination",
  ugc: "html",
  auth: "auth",
  realtime: "realtime",
};

function topicFor(file, side) {
  const key = file.replace(/\.ts$/, "").replace(/^runtime\//, "");
  if (side === "server") {
    if (SERVER_FILE_TOPICS[key]) return SERVER_FILE_TOPICS[key];
    const folder = key.slice("server/".length).split("/")[0];
    const topic = SERVER_FOLDER_TOPICS[folder];
    if (!topic) throw new Error(`No topic rule for server file ${file}`);
    return topic;
  }
  if (side === "shared") {
    const folder = key.slice("shared/".length).split("/")[0];
    const topic = SHARED_FOLDER_TOPICS[folder];
    if (!topic) throw new Error(`No topic rule for shared file ${file}`);
    return topic;
  }
  const topic = APP_FILE_TOPICS[key] ?? APP_FILE_TOPICS[file];
  if (!topic) throw new Error(`No topic rule for app file ${file}`);
  return topic;
}

function pushEntry(entries, { name, kind, side, file: rawFile }) {
  const file = rawFile.includes(".") ? rawFile : `${rawFile}.ts`;
  const topic = topicFor(file, side);
  const entry = {
    name,
    kind,
    side,
    file,
    path: `@nuxvel/nuxt/${side}/${topic}`,
  };
  const seen = entries.find((e) => e.name === name);
  if (seen) {
    if (seen.kind !== entry.kind || seen.file !== entry.file || seen.path !== entry.path) {
      throw new Error(`Duplicate name ${name}: ${JSON.stringify(seen)} vs ${JSON.stringify(entry)}`);
    }
    return;
  }
  entries.push(entry);
}

function serverImportsEntries() {
  const json = JSON.parse(readFileSync(join(src, "runtime/server/server-imports.json"), "utf8"));
  const entries = [];
  for (const [side, kind] of [["values", "value"], ["types", "type"]]) {
    for (const [file, names] of Object.entries(json[side])) {
      const runtimeFile = file.startsWith("../")
        ? `runtime/${file.replace("../", "")}`
        : `runtime/server/${file}`;
      const entrySide = file.startsWith("../") ? "shared" : "server";
      for (const name of names) {
        pushEntry(entries, { name, kind, side: entrySide, file: `${runtimeFile}.ts` });
      }
    }
  }
  return entries;
}

function scanDirExports(dir, side, sub) {
  const entries = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.endsWith(".vue")) {
      pushEntry(entries, { name: name.replace(/\.vue$/, ""), kind: "component", side, file: `runtime/${sub}/${name}` });
      continue;
    }
    if (name.includes(".stories.")) continue;
    if (!name.endsWith(".ts")) continue;
    const text = readFileSync(join(dir, name), "utf8");
    for (const match of text.matchAll(/^export (async )?(function|const|type|interface|class) ([A-Za-z0-9_$]+)/gm)) {
      const kind = match[2] === "type" || match[2] === "interface" ? "type" : "value";
      const file = `runtime/${sub}/${name}`;
      pushEntry(entries, { name: match[3], kind, side, file });
    }
  }
  return entries;
}

function resolveFrom(args, vars) {
  const literals = [...args.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (literals.length === 0) return null;
  const file = literals.find((l) => !l.includes("Ui") && !l.includes("og-image")) ?? literals[0];
  return file;
}

function setupEntries() {
  const entries = [];
  for (const name of readdirSync(setupDir).sort()) {
    if (name === "namespaces.ts" || !name.endsWith(".ts")) continue;
    const text = readFileSync(join(setupDir, name), "utf8");

    const vars = new Map();
    for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(runtimeFile|billing)\("([^"]+)"\)/g)) {
      vars.set(m[1], m[3]);
    }

    for (const m of text.matchAll(/importsFrom\(\s*(?:(runtimeFile|billing)\("([^"]+)"\)|([A-Za-z_$][\w$]*))\s*,\s*\[([^\]]*)\]\s*(,\s*true)?\)/gs)) {
      const base = m[2] ?? vars.get(m[3]);
      if (!base) throw new Error(`Cannot resolve importsFrom source ${m[3]} in setup/${name}`);
      const file = m[1] === "billing" ? `./runtime/server/billing/${base}` : base;
      const kind = m[5] ? "type" : "value";
      for (const raw of m[4].split(",")) {
        const imported = raw.trim().replace(/^"|"$/g, "");
        if (imported) pushEntry(entries, { name: imported, kind, side: sideFor(file), file: file.replace(/^\.\//, "") });
      }
    }

    for (const m of text.matchAll(/\{[^{}]*?name:\s*"([^"]+)"[^{}]*?\}/gs)) {
      const imported = m[1];
      const body = m[0];
      const from = body.match(/from:\s*(runtimeFile|billing)\(/);
      const path = body.match(/filePath:\s*runtimeFile\(/);
      if (!from && !path) continue;
      const kind = /\btype:\s*true\b/.test(body) ? (path ? "component" : "type") : path ? "component" : "value";
      const remainder = body.slice(body.indexOf("from:") === -1 ? body.indexOf("filePath:") : body.indexOf("from:"));
      const literals = [...remainder.matchAll(/"([^"]+)"/g)].map((l) => l[1]);
      const file = literals.find((l) => !l.includes("Ui") && !l.includes("og-image")) ?? literals[0];
      if (!file) throw new Error(`Cannot resolve from of ${imported} in setup/${name}`);
      const full = from?.[1] === "billing" ? `./runtime/server/billing/${file}` : file;
      pushEntry(entries, { name: imported, kind, side: sideFor(full), file: full.replace(/^\.\//, "") });
    }
  }
  return entries;
}

function sideFor(file) {
  if (file.includes("./runtime/server/")) return "server";
  if (file.includes("./runtime/shared/")) return "shared";
  return "app";
}

const publicFileEntries = [
  ["billingCustomersTable", "runtime/server/billing/tables.ts", "billing"],
  ["billingEventsTable", "runtime/server/billing/tables.ts", "billing"],
  ["billingPaymentsTable", "runtime/server/billing/tables.ts", "billing"],
  ["billingSubscriptionsTable", "runtime/server/billing/tables.ts", "billing"],
  ["useRedis", "runtime/server/redis/client.ts", "redis"],
  ["useS3", "runtime/server/storage/client.ts", "storage"],
  ["useQueue", "runtime/server/jobs/queue.ts", "queues"],
  ["useStripe", "runtime/server/billing/use-stripe.ts", "billing"],
].map(([name, file, topic]) => ({ name, kind: "value", side: "server", file, path: `@nuxvel/nuxt/server/${topic}` }));

const entries = [
  ...serverImportsEntries(),
  ...scanDirExports(composablesDir, "app", "app/composables"),
  ...scanDirExports(componentsDir, "app", "app/components"),
  ...setupEntries(),
  ...publicFileEntries,
];

entries.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));

for (const entry of entries) {
  if (entry.name.startsWith("$") && entry.name !== "$api") {
    throw new Error(`Namespace name leaked into the map: ${entry.name}`);
  }
}

if (process.argv[2] === "--write") {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    join(src, "public-imports.json"),
    JSON.stringify(entries, null, 2) + "\n",
  );
  console.log(`wrote ${entries.length} entries to src/public-imports.json`);
} else {
  console.log(JSON.stringify(entries, null, 2));
}
