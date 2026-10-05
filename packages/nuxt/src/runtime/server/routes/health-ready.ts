import { statfs } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { defineEventHandler, setResponseStatus } from "h3";
import { useDb } from "../database/client";
import { useRedis } from "../redis/client";
import { useNuxvelConfig } from "../utils/config";

const REDIS_PING_TIMEOUT_MS = 2_000;

function pingRedis() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis PING timed out")), REDIS_PING_TIMEOUT_MS);
  });

  return Promise.race([useRedis("cache").ping(), timedOut]).finally(() => clearTimeout(timer));
}

async function reachability(check: () => Promise<unknown>) {
  try {
    await check();
    return "reachable";
  } catch {
    return "unreachable";
  }
}

async function diskSpace() {
  const { bavail, blocks } = await statfs(process.cwd());
  const minFreePercent = useNuxvelConfig().health?.minFreeDiskPercent ?? 15;

  return (bavail / blocks) * 100 < minFreePercent ? "low" : "ok";
}

export default defineEventHandler(async (event) => {
  const [database, redis, disk] = await Promise.all([
    reachability(() => useDb({ root: true }).execute(sql`select 1`)),
    reachability(pingRedis),
    diskSpace(),
  ]);

  const maintenance = event.context.nuxvelMaintenance ? { maintenance: true } : {};

  if (database === "unreachable" || redis === "unreachable") {
    setResponseStatus(event, 503);
    return { status: "unavailable", database, redis, disk, ...maintenance };
  }

  return { status: disk === "low" ? "degraded" : "ready", database, redis, disk, ...maintenance };
});
