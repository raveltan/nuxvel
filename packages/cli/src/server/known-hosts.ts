import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const KNOWN_HOSTS_FILE = ".nuxvel/known_hosts";

export function knownHostsPath(cwd: string) {
  return join(cwd, KNOWN_HOSTS_FILE);
}

export function pinnedHostKey(file: string, host: string) {
  if (!existsSync(file)) return undefined;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [hosts, type, key] = line.trim().split(/\s+/);
    if (hosts?.split(",").includes(host) && type && key) {
      const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("base64");
      return `${type} SHA256:${digest.replace(/=+$/, "")}`;
    }
  }

  return undefined;
}
