import { writeFile } from "node:fs/promises";
import { useQueue } from "../jobs/queue";
import { goDown, goUp, maintenanceState } from "../maintenance/state";
import type { NuxvelCommand } from "./command";
import { commandReport, commandSuccess } from "./command-error";
import type { MaintenanceListing } from "./maintenance-listing";

type MaintenanceCommand = Extract<NuxvelCommand, { kind: "down" | "up" | "maintenance:status" }>;

async function status(outFile: string) {
  const state = await maintenanceState();
  const queuePaused = await useQueue().isPaused();
  const listing: MaintenanceListing = state
    ? {
        down: true,
        message: state.message,
        retryAfter: state.retryAfter,
        since: state.since,
        allow: state.allow,
        bypass: state.secret !== null,
        queuePaused,
      }
    : { down: false, queuePaused };

  await writeFile(outFile, JSON.stringify(listing));
}

async function down(command: Extract<MaintenanceCommand, { kind: "down" }>) {
  const { kind: _, ...options } = command;
  const state = await goDown(options);

  commandSuccess(`The app is down for maintenance, ${state.keepQueue ? "the queue keeps running" : "the queue is paused"}`);
  if (state.secret !== null) commandReport(`  → Bypass it at /${state.secret}`);
}

export async function runMaintenanceCommand(command: MaintenanceCommand): Promise<number> {
  switch (command.kind) {
    case "down":
      await down(command);
      break;
    case "up":
      commandSuccess((await goUp()) ? "The app is up, the queue runs again" : "The app was not down");
      break;
    case "maintenance:status":
      await status(command.outFile);
      break;
  }

  return 0;
}
