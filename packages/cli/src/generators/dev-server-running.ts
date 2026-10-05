import { readFileSync } from "node:fs";
import { join } from "node:path";
import { alive } from "@nuxvel/nuxt/cli";
import { isRecord } from "../is-record.ts";

export function devServerRunning(buildDir: string) {
  try {
    const lock: unknown = JSON.parse(readFileSync(join(buildDir, "nuxt.lock"), "utf-8"));
    return isRecord(lock) && typeof lock.pid === "number" && alive(lock.pid);
  } catch {
    return false;
  }
}
