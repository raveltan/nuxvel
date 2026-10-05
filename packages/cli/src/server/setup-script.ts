import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { offsiteEnv } from "./offsite-env.ts";
import { shellQuote, shellScript } from "./shell-script.ts";

const scriptsDir = fileURLToPath(new URL("./scripts/", import.meta.url));
const helpersDir = fileURLToPath(new URL("./helpers/", import.meta.url));
const helperFiles = ["backup", "restore", "erasure", "assets", "monitor", "metrics"];

function alertChannels(alerts: { email?: string; webhook?: string; heartbeat?: string } = {}) {
  return [alerts.email, alerts.webhook && "the webhook", alerts.heartbeat && "a heartbeat to the heartbeat URL"].filter(Boolean).join(", ");
}

export function setupScript(options: {
  dryRun: boolean;
  arch: string;
  deployUser: string;
  nodeMajor: string;
  logSink?: Record<string, unknown>;
  offsite?: { endpoint: string; bucket: string; region?: string; accessKeyId: string; secretAccessKey: string };
  alerts?: { server: string; email?: string; smtp?: string; webhook?: string; heartbeat?: string };
}) {
  return shellScript(
    scriptsDir,
    `NUXVEL_DRY_RUN=${options.dryRun ? 1 : 0}
NUXVEL_ARCH=${options.arch}
NUXVEL_DEPLOY_USER=${options.deployUser}
NUXVEL_NODE_MAJOR=${options.nodeMajor}
NUXVEL_LOG_SINK=${shellQuote(options.logSink ? JSON.stringify(options.logSink) : "")}
NUXVEL_OFFSITE=${shellQuote(options.offsite ? offsiteEnv(options.offsite) : "")}
NUXVEL_OFFSITE_BUCKET=${shellQuote(options.offsite?.bucket ?? "")}
${helperFiles.map((name) => `NUXVEL_${name.toUpperCase()}_HELPER=${shellQuote(readFileSync(`${helpersDir}${name}.cjs`, "utf8").trimEnd())}`).join("\n")}
NUXVEL_ALERTS=${shellQuote(options.alerts ? JSON.stringify(options.alerts, null, 2) : "")}
NUXVEL_ALERT_CHANNELS=${shellQuote(alertChannels(options.alerts))}
NUXVEL_RAM_MB=$(awk '/^MemTotal:/ { print int($2 / 1024 / 256) * 256 }' /proc/meminfo)
NUXVEL_POSTGRES_MB=$((NUXVEL_RAM_MB / 4))
NUXVEL_REDIS_MB=$((NUXVEL_RAM_MB / 10))
NUXVEL_SERVICES_MB=$((NUXVEL_RAM_MB / 20))
NUXVEL_APPS_MB=$((NUXVEL_RAM_MB - NUXVEL_POSTGRES_MB - NUXVEL_REDIS_MB - NUXVEL_SERVICES_MB))`,
  );
}
