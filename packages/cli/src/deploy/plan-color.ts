import type { DeployEnvironment } from "./define-deploy.ts";
import type { Color } from "./ecosystem.ts";
import { poolSize } from "./pool-size.ts";
import { PROCESS_MB, processCounts } from "./process-counts.ts";
import type { ServerState } from "./server-state.ts";

export function planColor(app: string, environment: DeployEnvironment, server: ServerState) {
  const { registry, states } = server;
  const entry = registry.apps[app];
  if (!entry) throw new Error(`${app} has no entry in the server registry`);

  const live = states[app]?.active ?? null;
  const processes = processCounts(environment.processes, {
    appsMb: registry.memory.appsMb,
    cpus: registry.cpus,
    apps: Object.keys(registry.apps).length,
  });
  const others = Object.entries(states).flatMap(([name, state]) => {
    if (name === app) return [];
    const counts = Object.values(state.processes ?? {});
    return counts.length > 0 ? [{ web: Math.max(...counts.map((c) => c.web)), worker: Math.max(...counts.map((c) => c.worker)) }] : [];
  });

  const otherProcesses = others.reduce((total, counts) => total + counts.web + counts.worker, 0);
  const secondColorFits = (2 * (processes.web + processes.worker) + otherProcesses) * PROCESS_MB <= registry.memory.appsMb;
  const strategy = environment.deploy.strategy === "rolling" || !secondColorFits ? "rolling" : "blue-green";
  const color: Color = strategy === "rolling" ? (live ?? "blue") : live === "blue" ? "green" : "blue";

  return {
    strategy,
    secondColorFits,
    live,
    color,
    port: entry.ports[color][0],
    processes,
    databasePoolMax: poolSize(registry.services.postgres.maxConnections, [processes, ...others]),
  };
}
