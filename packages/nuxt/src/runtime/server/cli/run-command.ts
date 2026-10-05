import type { NuxvelCommand } from "./command";

export async function runCommand(command: NuxvelCommand): Promise<number> {
  switch (command.kind) {
    case "tinker":
      return (await import("./tinker")).runTinker();
    case "db:seed":
      return (await import("./db-seed")).runDbSeed(command.names);
    case "task:run":
      return (await import("./task-run")).runTaskCommand(command.name, command.payload);
    case "flags:list":
    case "flags:stale":
    case "flags:set":
    case "experiment:start":
    case "experiment:stop":
    case "experiment:report":
      return (await import("./flags")).runFlagsCommand(command);
    case "audit:verify":
      return (await import("./audit-verify")).runAuditVerify(command.outFile);
    case "audit:tail":
      return (await import("./audit-log")).runAuditTail();
    case "audit:export":
      return (await import("./audit-log")).runAuditExport(command, command.format);
    case "backfill:status":
      return (await import("./backfill-status")).runBackfillStatus(command.outFile);
    case "billing:status":
      return (await import("./billing")).runBillingStatus(command.outFile);
    case "billing:replay":
      return (await import("./billing")).runBillingReplay(command.eventId);
    case "user:export":
    case "user:erase":
      return (await import("./user-data")).runUserDataCommand(command);
    case "queue:versions":
      return (await import("./queue-versions")).runQueueVersions(command.outFile);
    case "queue:failed":
      return (await import("./failed-jobs")).runQueueFailed(command.outFile);
    case "queue:clear":
      return (await import("./queue-clear")).runQueueClear(command);
    case "queue:retry":
      return (await import("./failed-jobs")).runQueueRetry(command.target, command.queue);
    case "schedule:list":
      return (await import("./schedules")).runScheduleList(command.outFile);
    case "schedule:prune":
      return (await import("./schedules")).runSchedulePrune(command.dryRun);
    case "schedule:run":
      return (await import("./schedules")).runScheduleNow(command.name);
    case "channels":
      return (await import("./channels")).runChannelList(command.outFile);
    case "routes":
      return (await import("./routes")).runRoutes(command.outFile);
    case "openapi:export":
      return (await import("./openapi-export")).runOpenApiExport(command.outFile);
    case "key:issue":
      return (await import("./key-issue")).runKeyIssue(command.userId, command.name);
    case "orphaned-names":
      return (await import("./find-orphaned-names")).runOrphanedNames(command.outFile);
    case "down":
    case "up":
    case "maintenance:status":
      return (await import("./maintenance")).runMaintenanceCommand(command);
  }
}
