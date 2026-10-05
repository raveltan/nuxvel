import schedules from "#nuxvel/schedules";
import { type Defined, definitionsIn, storedName } from "../discovery/aliases";
import type { Renamed } from "../discovery/renamed";
import type { Schedule } from "./define-schedule";
import { useQueue } from "./queue";

/**
 * The name of every schedule defined under `server/schedules/`, the
 * built-ins `nuxvel.auth.reencrypt-two-factor`, `nuxvel.prune-outbox` and, when on,
 * `nuxvel.purge-trashed` included: its file's path, which
 * identifies its repeatable job in Redis.
 */
export type ScheduleName = Defined<(typeof schedules)[number]>["name"];

function entries(): readonly (Schedule | Renamed<Schedule>)[] {
  return schedules;
}

/**
 * Every schedule discovered under `server/schedules/`.
 *
 * `nuxvel queue:work` uses it to register
 * the repeatable jobs, and `nuxvel schedule:list` to tell a schedule
 * that still exists in code from an orphaned entry in Redis.
 */
export function allSchedules(): readonly Schedule[] {
  return definitionsIn(entries());
}

export function findSchedule(name: string): Schedule | undefined {
  return allSchedules().find((schedule) => schedule.name === name);
}

/**
 * The name a schedule's BullMQ scheduler and ticks are stored under: the
 * old name a {@link renamed} alias keeps for it, or its own.
 */
export function scheduleStoredName(schedule: Schedule): string {
  return storedName(entries(), schedule);
}

export async function registerSchedules() {
  for (const schedule of allSchedules()) {
    const name = scheduleStoredName(schedule);

    await useQueue().upsertJobScheduler(name, { pattern: schedule.pattern }, { name });
  }
}
