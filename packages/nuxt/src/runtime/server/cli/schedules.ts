import { writeFile } from "node:fs/promises";
import type { JobSchedulerJson } from "bullmq";
import { useQueue } from "../jobs/queue";
import { allSchedules, findSchedule, scheduleStoredName } from "../jobs/schedule-registry";
import { CommandError, commandReport, commandSuccess } from "./command-error";
import type { ScheduleListing } from "./schedule-listing";

export function orphanedSchedulers(schedulers: JobSchedulerJson[]): JobSchedulerJson[] {
  const known = new Set(allSchedules().map(scheduleStoredName));

  return schedulers.filter((scheduler) => !known.has(scheduler.key));
}

export async function runScheduleList(outFile: string): Promise<number> {
  const schedulers = await useQueue().getJobSchedulers();
  const registered = new Map(schedulers.map((scheduler) => [scheduler.key, scheduler]));
  const next = (key: string) => {
    const at = registered.get(key)?.next;
    return at ? new Date(at).toISOString() : null;
  };
  const listing: ScheduleListing = {
    schedules: [
      ...allSchedules().map((schedule) => {
        const storedAs = scheduleStoredName(schedule);

        return {
          name: schedule.name,
          storedAs,
          description: schedule.description,
          pattern: schedule.pattern,
          nextRun: next(storedAs),
          orphaned: false,
        };
      }),
      ...orphanedSchedulers(schedulers).map((scheduler) => ({
        name: scheduler.key,
        storedAs: scheduler.key,
        description: null,
        pattern: scheduler.pattern ?? null,
        nextRun: next(scheduler.key),
        orphaned: true,
      })),
    ],
  };

  await writeFile(outFile, JSON.stringify(listing));

  return 0;
}

export async function runSchedulePrune(dryRun: boolean): Promise<number> {
  const orphaned = orphanedSchedulers(await useQueue().getJobSchedulers());

  for (const { key } of orphaned) {
    if (dryRun) {
      commandReport(`Would remove ${key}, no defineSchedule in code`);
    } else {
      await useQueue().removeJobScheduler(key);
      commandSuccess(`Removed ${key}, no defineSchedule in code`);
    }
  }

  if (orphaned.length === 0) commandReport("No orphaned schedules");

  return 0;
}

export async function runScheduleNow(name: string): Promise<number> {
  const schedule = findSchedule(name);

  if (!schedule) {
    throw new CommandError(`no schedule named "${name}"`, { hint: "Run nuxvel schedule:list to see the schedules" });
  }

  await schedule.run();
  commandSuccess(`${name} finished`);

  return 0;
}
