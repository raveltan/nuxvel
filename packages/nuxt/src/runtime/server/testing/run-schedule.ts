import { findSchedule } from "../jobs/schedule-registry";

export async function runSchedule(name: string) {
  const schedule = findSchedule(name);

  if (!schedule) throw new Error(`No schedule is named "${name}"`);

  await schedule.run();
}
