import { fail } from "../ui/fail.ts";

export const RESERVED_CONNECTIONS = 10;
const MAX_POOL = 10;

export function poolSize(maxConnections: number, apps: { web: number; worker: number }[]) {
  const processes = apps.reduce((total, app) => total + 2 * (app.web + app.worker), 0);
  const pool = Math.min(MAX_POOL, Math.floor((maxConnections - RESERVED_CONNECTIONS) / Math.max(processes, 1)));

  if (pool < 1) {
    fail(`${processes} processes do not fit in the ${maxConnections} Postgres connections of the server`, {
      hint: "Lower processes in nuxvel.deploy.ts",
    });
  }

  return pool;
}
