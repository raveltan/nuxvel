import { z } from "zod";
import { RESERVED_CONNECTIONS } from "./pool-size.ts";
import { PROCESS_MB } from "./process-counts.ts";

const counts = z.object({ web: z.number(), worker: z.number() });

export const serverStatusSchema = z.object({
  disk: z.object({ sizeMb: z.number(), usedMb: z.number() }),
  memory: z.object({ totalMb: z.number(), appsMb: z.number(), swapUsedMb: z.number() }),
  maxConnections: z.number(),
  services: z.record(z.string(), z.boolean()),
  apps: z.array(
    z.object({
      name: z.string(),
      color: z.string().nullable(),
      release: z.string().nullable(),
      processes: z.object({ blue: counts.optional(), green: counts.optional() }),
      backup: z.object({ time: z.string() }).loose().nullable(),
    }),
  ),
  slowQueries: z.array(z.object({ database: z.string(), calls: z.number(), meanMs: z.number(), query: z.string() })),
  slowLog: z.array(z.string()),
});

type ServerStatus = z.output<typeof serverStatusSchema>;

const DISK_WARNING_PERCENT = 80;

export function diskPercent(disk: ServerStatus["disk"]) {
  return Math.round((disk.usedMb / Math.max(disk.sizeMb, 1)) * 100);
}

export function appProcesses(processes: ServerStatus["apps"][number]["processes"]) {
  return Object.values(processes).reduce((total, counts) => total + counts.web + counts.worker, 0);
}

export function serverWarnings(status: ServerStatus) {
  const warnings: string[] = [];
  const running = status.apps.reduce((total, app) => total + appProcesses(app.processes), 0);
  const pooled = status.apps.reduce((total, app) => {
    const counts = Object.values(app.processes);
    if (counts.length === 0) return total;
    return total + 2 * (Math.max(...counts.map((c) => c.web)) + Math.max(...counts.map((c) => c.worker)));
  }, 0);

  if (running * PROCESS_MB > status.memory.appsMb) {
    warnings.push(`${running} app processes of ${PROCESS_MB} MB need ${running * PROCESS_MB} MB, the apps have ${status.memory.appsMb} MB`);
  }
  if (pooled > status.maxConnections - RESERVED_CONNECTIONS) {
    warnings.push(
      `${pooled} processes during a deploy need a connection each, Postgres has ${status.maxConnections - RESERVED_CONNECTIONS} for the apps`,
    );
  }
  if (diskPercent(status.disk) >= DISK_WARNING_PERCENT) warnings.push(`The disk is ${diskPercent(status.disk)}% full`);
  for (const [service, up] of Object.entries(status.services)) {
    if (!up) warnings.push(`${service} is not answering`);
  }

  return warnings;
}
