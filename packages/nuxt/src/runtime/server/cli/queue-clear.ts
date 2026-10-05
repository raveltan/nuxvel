import { queueNames, useQueue } from "../jobs/queue";
import { registerSchedules } from "../jobs/schedule-registry";
import { CommandError, commandSuccess } from "./command-error";

export async function runQueueClear(options: { queues?: string[]; failed: boolean; waiting: boolean }): Promise<number> {
  const known = queueNames();
  const names = options.queues ?? known;
  const unknown = names.filter((name) => !known.includes(name));

  if (unknown.length > 0) {
    throw new CommandError(`No job uses the queue "${unknown.join('", "')}"`, { hint: `Known queues: ${known.join(", ")}` });
  }

  let waiting = 0;
  let failed = 0;

  for (const name of names) {
    const queue = useQueue(name);

    if (options.waiting) {
      const counts = await queue.getJobCounts("wait", "prioritized", "delayed");

      waiting += (counts.wait ?? 0) + (counts.prioritized ?? 0) + (counts.delayed ?? 0);
      await queue.drain(true);
    }

    if (options.failed) failed += (await queue.clean(0, 0, "failed")).length;
  }

  if (options.waiting && names.includes("default")) await registerSchedules();

  const removed = [options.waiting && `${waiting} waiting`, options.failed && `${failed} failed`].filter(Boolean).join(" and ");

  commandSuccess(`Removed ${removed} job(s) from ${names.join(", ")}`);
  return 0;
}
