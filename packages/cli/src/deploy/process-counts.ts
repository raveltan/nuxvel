import { fail } from "../ui/fail.ts";
import type { DeployEnvironment } from "./define-deploy.ts";

export const PROCESS_MB = 512;
const PORTS_PER_COLOR = 10;

type ServerCapacity = { appsMb: number; cpus: number; apps: number };

export function processCounts(requested: DeployEnvironment["processes"], capacity: ServerCapacity) {
  const slots = Math.floor(capacity.appsMb / PROCESS_MB / Math.max(capacity.apps, 1));
  const worker = requested.worker === "auto" ? 1 : requested.worker;
  const web =
    requested.web === "auto" ? Math.max(1, Math.min(capacity.cpus, Math.floor((slots - worker) / 2))) : requested.web;

  if (worker > PORTS_PER_COLOR - 1) {
    fail(`processes.worker is ${worker}, a color has ports for ${PORTS_PER_COLOR - 1} workers`);
  }

  return { web, worker };
}
